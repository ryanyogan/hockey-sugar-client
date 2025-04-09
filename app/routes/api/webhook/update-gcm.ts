import { StatusType } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";
import type { Route } from "./+types/update-gcm";

// Define a type for the incoming blood sugar data
interface BloodSugarUpdate {
  value: number;
  timestamp: string;
  trend?: string;
  unit?: string;
}

export async function action({ request }: Route.ActionArgs) {
  // 1. Validate request is POST
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // 2. Optional: Validate webhook with a secret header
  // const authHeader = request.headers.get("X-Webhook-Secret");
  // const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  // if (!authHeader || authHeader !== WEBHOOK_SECRET) {
  //   return json({ error: "Unauthorized" }, { status: 401 });
  // }

  try {
    // 3. Parse the incoming blood sugar data
    const reading = (await request.json()) as BloodSugarUpdate;

    // Get the athlete
    const athlete = await db.user.findFirst({
      where: { isAthlete: true },
    });

    if (!athlete) {
      console.error("No athlete found");
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
      console.error("No parent found for athlete");
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
      console.info("No new data from Dexcom");
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

    console.info("Successfully created new reading", {
      value: reading.value,
      status: statusType,
    });

    return data({ success: true, id: glucoseReading.id }, { status: 201 });
  } catch (error) {
    console.error("Error saving blood sugar data:", error);
    return data({ error: "Failed to process data" }, { status: 500 });
  }
}
