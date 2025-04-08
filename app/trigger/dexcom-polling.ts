import { StatusType } from "@prisma/client";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { db } from "~/lib/db.server";
import {
  getDexcomToken,
  refreshDexcomToken,
  saveDexcomToken,
} from "~/lib/dexcom.server";

// Define the job
export const dexcomPollingJob = schedules.task({
  id: "dexcom-polling",
  cron: "* * * * *",
  run: async (payload, { ctx }) => {
    // Log the start of the job
    logger.log("Starting Dexcom polling job");

    try {
      // Get the latest Dexcom token
      const dexcomToken = await getDexcomToken();

      if (!dexcomToken) {
        logger.error("No Dexcom token found");
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
          logger.info("Refreshed Dexcom token");
        } catch (error) {
          logger.error("Token expired and refresh failed", { error });
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
        logger.info("No readings available");
        return { success: false, error: "No readings available" };
      }

      // Get the athlete
      const athlete = await db.user.findFirst({
        where: { isAthlete: true },
      });

      if (!athlete) {
        logger.error("No athlete found");
        return { success: false, error: "No athlete found" };
      }

      // Get parent preferences for thresholds
      const parent = await db.user.findFirst({
        where: {
          athleteParents: {
            some: {
              athleteId: athlete.id,
            },
          },
        },
      });

      if (!parent) {
        logger.error("No parent found for athlete");
        return { success: false, error: "No parent found for athlete" };
      }

      const preferences = await db.userPreferences.findUnique({
        where: { userId: parent.id },
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
        logger.info("No new data from Dexcom");
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
          recordedById: parent.id,
          statusId: status.id,
          source: "dexcom",
        },
      });

      logger.info("Successfully created new reading", {
        value: reading.value,
        status: statusType,
      });

      return { success: true, status, glucoseReading };
    } catch (error: any) {
      logger.error("Error updating glucose from Dexcom", { error });
      return { success: false, error: error.message };
    }
  },
});

// Helper function to get the latest Dexcom reading
async function getLatestDexcomReading(accessToken: string) {
  try {
    // Calculate time range for the last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Format dates for Dexcom API
    const formattedStartDate = startDate.toISOString().replace(/\.\d{3}Z$/, "");
    const formattedEndDate = endDate.toISOString().replace(/\.\d{3}Z$/, "");

    const response = await fetch(
      `https://sandbox-api.dexcom.com/v3/users/self/egvs?startDate=${formattedStartDate}&endDate=${formattedEndDate}&minCount=1`,
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
