// app/lib/dexcom.server.ts
import { StatusType } from "@prisma/client";
import { db } from "./db.server";

// Dexcom API endpoints
const SANDBOX_TOKEN_URL = "https://sandbox-api.dexcom.com/v2/oauth2/token";
const SANDBOX_EGVS_URL = "https://sandbox-api.dexcom.com/v3/users/self/egvs";

// Use sandbox for development
const USE_SANDBOX = true;
const TOKEN_URL = USE_SANDBOX
  ? SANDBOX_TOKEN_URL
  : "https://api.dexcom.com/v2/oauth2/token";
const EGVS_URL = USE_SANDBOX
  ? SANDBOX_EGVS_URL
  : "https://api.dexcom.com/v3/users/self/egvs";

// Replace with your actual client ID and secret
const CLIENT_ID = "7hb0UP16z9PSQgr7VAXziGOFhtMOAwVC";
const CLIENT_SECRET = "o5uesNyh9zY2gOGP";

/**
 * Get the current DexCom token
 */
export async function getDexcomToken() {
  // Always get the latest token (we only store one now)
  return db.dexcomToken.findFirst({
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Refresh DexCom tokens
 */
export async function refreshDexcomToken(refreshToken: string) {
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Token refresh failed: ${
          errorData.error_description || response.statusText
        }`
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (error) {
    console.error("Error refreshing token:", error);
    throw error;
  }
}

/**
 * Save or update DexCom token
 */
export async function saveDexcomToken(tokenData: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  // Create a new token every time (we'll only use the latest one)
  return db.dexcomToken.create({
    data: tokenData,
  });
}

/**
 * Get the latest glucose reading from Dexcom
 */
export async function getLatestDexcomReading(accessToken: string) {
  try {
    // Calculate time range for the last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Format dates for Dexcom API
    const formattedStartDate = startDate.toISOString().replace(/\.\d{3}Z$/, "");
    const formattedEndDate = endDate.toISOString().replace(/\.\d{3}Z$/, "");

    const response = await fetch(
      `${EGVS_URL}?startDate=${formattedStartDate}&endDate=${formattedEndDate}&minCount=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }

      const errorData = await response.json();
      throw new Error(
        `Failed to get Dexcom readings: ${
          errorData.error_description || response.statusText
        }`
      );
    }

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      return null;
    }

    // Get the most recent reading
    const latestReading = data.records[0];

    return {
      value: latestReading.value,
      unit: latestReading.unit,
      recordedAt: new Date(latestReading.displayTime || new Date()),
    };
  } catch (error) {
    console.error("Error fetching Dexcom readings:", error);
    throw error;
  }
}

/**
 * Update glucose reading from Dexcom
 * This now requires the parent user ID who is refreshing the data
 */
export async function updateGlucoseFromDexcom(parentId: string) {
  try {
    // Get the latest Dexcom token
    const dexcomToken = await getDexcomToken();

    if (!dexcomToken) {
      return { success: false, error: "No Dexcom token found" };
    }

    // Check if token is expired
    if (new Date(dexcomToken.expiresAt) < new Date()) {
      try {
        // Try to refresh the token
        const newToken = await refreshDexcomToken(dexcomToken.refreshToken);
        await saveDexcomToken(newToken);

        // Continue with the new token
        dexcomToken.accessToken = newToken.accessToken;
      } catch (error) {
        return {
          success: false,
          error: "Token expired and refresh failed",
          needsReauth: true,
        };
      }
    }

    // Get the latest reading from Dexcom
    const reading = await getLatestDexcomReading(dexcomToken.accessToken);

    if (!reading) {
      return { success: false, error: "No readings available" };
    }

    // Get parent preferences for thresholds
    const preferences = await db.userPreferences.findUnique({
      where: { userId: parentId },
    });

    const lowThreshold = preferences?.lowThreshold || 70;
    const highThreshold = preferences?.highThreshold || 180;

    // Determine status based on glucose value
    let statusType = StatusType.OK as StatusType;
    if (reading.value < lowThreshold) {
      statusType = StatusType.LOW;
    } else if (reading.value > highThreshold) {
      statusType = StatusType.HIGH;
    }

    // Check if we already have this reading (to avoid duplicates)
    const existingReading = await db.glucoseReading.findFirst({
      where: {
        value: reading.value,
        recordedAt: {
          gte: new Date(new Date().getTime() - 5 * 60 * 1000), // Within last 5 minutes
        },
        source: "dexcom",
      },
    });

    if (existingReading) {
      return { success: false, noNewData: true };
    }

    // Create new status
    const status = await db.status.create({
      data: {
        type: statusType,
      },
    });

    // Create new glucose reading
    const glucoseReading = await db.glucoseReading.create({
      data: {
        value: reading.value,
        unit: reading.unit,
        recordedById: parentId,
        statusId: status.id,
        source: "dexcom",
      },
    });

    return { success: true, status, glucoseReading };
  } catch (error: any) {
    console.error("Error updating glucose from Dexcom:", error);
    return { success: false, error: error.message };
  }
}
