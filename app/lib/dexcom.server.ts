import { StatusType } from "@prisma/client";
import { db } from "./db.server";

// Dexcom API endpoints
const DEXCOM_TOKEN_URL = "https://api.dexcom.com/v2/oauth2/token";
const DEXCOM_EGVS_URL = "https://api.dexcom.com/v2/users/self/egvs";

// For development, use sandbox endpoints
const SANDBOX_TOKEN_URL = "https://sandbox-api.dexcom.com/v2/oauth2/token";
const SANDBOX_EGVS_URL = "https://sandbox-api.dexcom.com/v2/users/self/egvs";

// Use sandbox for development
const USE_SANDBOX = true;

const TOKEN_URL = USE_SANDBOX ? SANDBOX_TOKEN_URL : DEXCOM_TOKEN_URL;
const EGVS_URL = USE_SANDBOX ? SANDBOX_EGVS_URL : DEXCOM_EGVS_URL;

// Replace with your actual client ID and secret
const CLIENT_ID = "7hb0UP16z9PSQgr7VAXziGOFhtMOAwVC";
const CLIENT_SECRET = "o5uesNyh9zY2gOGP";

interface DexcomTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Get Dexcom tokens for an athlete
 */
export async function getDexcomTokens(
  athleteId: string
): Promise<DexcomTokens | null> {
  // In a real application, you would store these tokens in your database
  // For this example, we'll retrieve them from localStorage on the client side
  // and pass them to the server via a form submission

  // This is a placeholder - in a real app, you would retrieve from your database
  return null;
}

/**
 * Refresh Dexcom tokens
 */
export async function refreshDexcomTokens(
  refreshToken: string
): Promise<DexcomTokens> {
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
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Get the latest glucose reading from Dexcom
 */
export async function getLatestDexcomReading(accessToken: string): Promise<{
  value: number;
  unit: string;
  recordedAt: Date;
} | null> {
  try {
    // Calculate time range for the last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Format dates for Dexcom API in YYYY-MM-DDThh:mm:ss format
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
        // Token expired, need to refresh
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

    if (!data.egvs || data.egvs.length === 0) {
      return null;
    }

    // Get the most recent reading
    const latestReading = data.egvs[0];

    return {
      value: latestReading.value,
      unit: latestReading.unit,
      recordedAt: new Date(latestReading.displayTime),
    };
  } catch (error) {
    console.error("Error fetching Dexcom readings:", error);
    throw error;
  }
}

/**
 * Determine status based on glucose value
 */
export function getStatusFromGlucose(value: number): StatusType {
  if (value < 100) return StatusType.LOW;
  if (value >= 250) return StatusType.HIGH;
  return StatusType.OK;
}

/**
 * Update athlete's glucose reading from Dexcom
 */
export async function updateAthleteGlucoseFromDexcom(
  athleteId: string,
  accessToken: string
): Promise<boolean> {
  try {
    // Get the latest reading from Dexcom
    const reading = await getLatestDexcomReading(accessToken);

    if (!reading) {
      return false;
    }

    // Determine the status based on the glucose value
    const statusType = getStatusFromGlucose(reading.value);

    // Create new status
    const status = await db.status.create({
      data: {
        type: statusType,
        user: {
          connect: {
            id: athleteId,
          },
        },
      },
    });

    // Create new glucose reading
    const glucoseReading = await db.glucoseReading.create({
      data: {
        value: reading.value,
        unit: reading.unit,
        userId: athleteId,
        recordedById: athleteId,
        statusId: status.id,
      },
    });

    return true;
  } catch (error) {
    console.error("Error updating athlete glucose from Dexcom:", error);
    return false;
  }
}
