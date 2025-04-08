// app/lib/athlete.server.ts
import { db } from "./db.server";

/**
 * Get the single athlete user
 */
export async function getAthlete(includeDetails = false) {
  const queryOptions = {
    where: {
      isAthlete: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  };

  return db.user.findFirst(queryOptions);
}

/**
 * Get the latest glucose readings
 */
export async function getGlucoseReadings(limit = 10) {
  return db.glucoseReading.findMany({
    orderBy: {
      recordedAt: "desc",
    },
    take: limit,
    include: {
      status: true,
    },
  });
}

/**
 * Get the latest glucose reading
 */
export async function getLatestGlucoseReading() {
  return db.glucoseReading.findFirst({
    orderBy: {
      recordedAt: "desc",
    },
    include: {
      status: true,
    },
  });
}

/**
 * Get the latest status
 */
export async function getLatestStatus() {
  // Find the latest glucose reading's status
  const latestReading = await getLatestGlucoseReading();
  if (latestReading?.status) {
    return latestReading.status;
  }

  return null;
}

/**
 * Format all athlete data for the UI
 */
export async function getFormattedAthleteData() {
  const athlete = await getAthlete();
  if (!athlete) return null;

  const latestReading = await getLatestGlucoseReading();
  const recentReadings = await getGlucoseReadings(10);

  // Remove the latest reading from recent readings to avoid duplication
  const glucoseHistory = latestReading
    ? recentReadings.filter((r) => r.id !== latestReading.id)
    : recentReadings;

  // Get unread messages count
  const unreadMessages = await db.message.findMany({
    where: {
      receiverId: athlete.id,
      read: false,
    },
    select: {
      id: true,
    },
  });

  return {
    id: athlete.id,
    name: athlete.name,
    unreadMessagesCount: unreadMessages.length,
    status: latestReading?.status
      ? {
          ...latestReading.status,
          acknowledgedAt:
            latestReading.status.acknowledgedAt?.toISOString() || null,
          createdAt: latestReading.status.createdAt.toISOString(),
          updatedAt: latestReading.status.updatedAt.toISOString(),
        }
      : null,
    glucose: latestReading
      ? {
          ...latestReading,
          recordedAt: latestReading.recordedAt.toISOString(),
          createdAt: latestReading.createdAt.toISOString(),
          updatedAt: latestReading.updatedAt.toISOString(),
        }
      : null,
    glucoseHistory: glucoseHistory.map((reading) => ({
      ...reading,
      recordedAt: reading.recordedAt.toISOString(),
      createdAt: reading.createdAt.toISOString(),
      updatedAt: reading.updatedAt.toISOString(),
    })),
  };
}
