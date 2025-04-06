import { StatusType, type User } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";

export async function updateGlucose({
  user,
  formData,
}: {
  formData: FormData;
  user: Partial<User>;
}) {
  const athleteId = formData.get("athleteId");
  const value = formData.get("value");
  const unit = formData.get("unit") || "mg/dL";

  if (typeof athleteId !== "string" || !value) {
    return data(
      { error: "Athlete ID and glucose value are required" },
      { status: 400 }
    );
  }

  // Validate the athlete belongs to this parent
  const athlete = await db.user.findFirst({
    where: {
      id: athleteId,
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
  });

  if (!athlete) {
    return data({ error: "Athlete not found" }, { status: 404 });
  }

  // Get user preferences for thresholds
  const preferences = await db.userPreferences.findUnique({
    where: {
      userId: user.id,
    },
  });

  const lowThreshold = preferences?.lowThreshold || 70;
  const highThreshold = preferences?.highThreshold || 180;
  // Determine status based on glucose value
  const numericValue = Number(value);
  let statusType: StatusType = StatusType.OK;

  if (isNaN(numericValue)) {
    return data({ error: "Invalid glucose value" }, { status: 400 });
  }

  // Use custom thresholds
  if (numericValue < lowThreshold) {
    statusType = StatusType.LOW;
  } else if (numericValue > highThreshold) {
    statusType = StatusType.HIGH;
  }

  // Create new status
  const status = await db.status.create({
    data: {
      type: statusType,
      userId: athleteId,
    },
  });

  // Create new glucose reading
  const glucoseReading = await db.glucoseReading.create({
    data: {
      value: numericValue,
      unit: unit as string,
      userId: athleteId,
      recordedById: user.id!,
      statusId: status.id,
      source: "manual",
    },
  });

  return data({ success: true, status, glucoseReading });
}
