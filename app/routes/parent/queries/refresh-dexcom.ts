import { StatusType, type User } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";

export async function refreshDexcom({ user }: { user: Partial<User> }) {
  if (!user || !user.id) {
    return data({ error: "User not found" }, { status: 404 });
  }

  const dexcomToken = await db.dexcomToken.findUnique({
    where: {
      userId: user.id,
    },
  });

  if (!dexcomToken) {
    console.log("No Dexcom token found");
    return data(
      { error: "Dexcom token not found", needsReauth: true },
      { status: 400 }
    );
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = new Date(dexcomToken.expiresAt) < new Date();
  const isExpiringSoon =
    new Date(dexcomToken.expiresAt) < new Date(Date.now() + 5 * 60 * 1000);

  if (isExpired || isExpiringSoon) {
    return data(
      { error: "Refreshing Dexcom connection...", needsReauth: true },
      { status: 400 }
    );
  }

  // Get the athlete
  const athlete = await db.user.findFirst({
    where: {
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    include: {
      glucoseReadings: {
        orderBy: {
          recordedAt: "desc",
        },
        take: 1,
        where: {
          source: "dexcom",
        },
      },
    },
  });

  if (!athlete) {
    return data({ error: "Athlete not found" }, { status: 404 });
  }

  try {
    // Get the latest reading from Dexcom
    // Calculate time range for the last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Format dates for Dexcom API in YYYY-MM-DDThh:mm:ss format
    const formattedStartDate = startDate.toISOString().replace(/\.\d{3}Z$/, "");
    const formattedEndDate = endDate.toISOString().replace(/\.\d{3}Z$/, "");

    const response = await fetch(
      `https://sandbox-api.dexcom.com/v3/users/self/egvs?startDate=${formattedStartDate}&endDate=${formattedEndDate}&minCount=1`,
      {
        headers: {
          Authorization: `Bearer ${dexcomToken.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Dexcom API error:", errorData);

      // If we get a 401, the token might be invalid even after refresh
      if (response.status === 401) {
        return data(
          { error: "Dexcom token invalid", needsReauth: true },
          { status: 401 }
        );
      }

      throw new Error(
        `Failed to get Dexcom readings: ${
          errorData.error_description || response.statusText
        }`
      );
    }

    const responseData = await response.json();

    if (!responseData.records || responseData.records.length === 0) {
      console.log("No readings found in response");
      return data({ success: false, message: "No readings found" });
    }

    // Get the most recent reading
    const latestReading = responseData.records[0];
    console.log("Latest reading:", latestReading);

    // Check if we have a previous Dexcom reading
    if (athlete.glucoseReadings.length > 0) {
      const lastReading = athlete.glucoseReadings[0];
      const lastReadingTime = new Date(lastReading.recordedAt);
      const currentTime = new Date();
      const timeDiffMinutes =
        (currentTime.getTime() - lastReadingTime.getTime()) / (1000 * 60);

      // If the value is the same and less than 5 minutes have passed, disregard
      if (latestReading.value === lastReading.value && timeDiffMinutes < 5) {
        console.log("Same value within 5 minutes, disregarding");
        return data({
          success: false,
          message: "Dexcom has not provided a new value yet",
          noNewData: true,
        });
      }
    }

    // Get user preferences for thresholds
    const preferences = await db.userPreferences.findUnique({
      where: {
        userId: user.id,
      },
    });

    const lowThreshold = preferences?.lowThreshold || 70;
    const highThreshold = preferences?.highThreshold || 180;

    // Determine the status based on the glucose value
    const value = latestReading.value;
    let statusType = StatusType.OK as StatusType;

    // Use custom thresholds
    if (value < lowThreshold) {
      statusType = StatusType.LOW;
    } else if (value > highThreshold) {
      statusType = StatusType.HIGH;
    }

    // Create new status
    const status = await db.status.create({
      data: {
        type: statusType,
        userId: athlete.id,
      },
    });

    // Create new glucose reading
    const glucoseReading = await db.glucoseReading.create({
      data: {
        value,
        unit: latestReading.unit,
        userId: athlete.id,
        recordedById: user.id,
        statusId: status.id,
        source: "dexcom",
      },
    });

    console.log("Successfully created new reading:", glucoseReading);
    return data({ success: true, status, glucoseReading });
  } catch (error) {
    console.error("Error refreshing Dexcom data:", error);
    return data({ error: "Failed to refresh Dexcom data" }, { status: 500 });
  }
}
