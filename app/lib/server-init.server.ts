// app/server-init.server.ts
import { Role, StatusType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "./db.server";

/**
 * Initialize the server with default data
 * This runs on application startup to ensure required data exists
 */
export async function initializeServer() {
  console.log("Initializing server...");

  try {
    // Check if any users exist
    const userCount = await db.user.count();

    if (userCount === 0) {
      console.log("No users found, creating initial data");
      await createInitialData();
    } else {
      console.log(`${userCount} users found, skipping initialization`);

      // Check if we need to mark an athlete
      const athleteCount = await db.user.count({
        where: { isAthlete: true },
      });

      if (athleteCount === 0) {
        console.log("No athlete marked, finding and marking one");
        await markFirstAthlete();
      }
    }
  } catch (error) {
    console.error("Error initializing server:", error);
  }
}

/**
 * Create initial data for a new installation
 */
async function createInitialData() {
  // Create admin user
  const admin = await db.user.create({
    data: {
      name: "Admin",
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "ADMIN",
      isAdmin: true,
    },
  });
  console.log("Created admin user:", admin.id);

  // Create parent (dad)
  const dad = await db.user.create({
    data: {
      name: "Dad",
      email: "dad@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "PARENT",
      isAdmin: true,
    },
  });
  console.log("Created dad user:", dad.id);

  // Create parent (mom)
  const mom = await db.user.create({
    data: {
      name: "Mom",
      email: "mom@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "PARENT",
      isAdmin: false,
    },
  });
  console.log("Created mom user:", mom.id);

  // Create athlete (son)
  const son = await db.user.create({
    data: {
      name: "Pickle",
      email: "pickle@jk.com",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "ATHLETE", // Using PARENT role but marking as athlete
      isAthlete: true,
    },
  });
  console.log("Created son user (athlete):", son.id);

  const athleteParent = await db.athleteParent.create({
    data: {
      parentId: dad.id,
      athleteId: son.id,
    },
  });
  console.log("Created athlete parent relationship:", athleteParent.id);

  const athleteParent2 = await db.athleteParent.create({
    data: {
      parentId: mom.id,
      athleteId: son.id,
    },
  });
  console.log("Created athlete parent relationship:", athleteParent2.id);

  // Set up default preferences for each parent
  await db.userPreferences.create({
    data: {
      userId: dad.id,
      lowThreshold: 70,
      highThreshold: 180,
    },
  });

  await db.userPreferences.create({
    data: {
      userId: mom.id,
      lowThreshold: 70,
      highThreshold: 180,
    },
  });

  // Create an initial status
  const status = await db.status.create({
    data: {
      type: StatusType.OK,
    },
  });

  // Create an initial glucose reading
  await db.glucoseReading.create({
    data: {
      value: 110,
      unit: "mg/dL",
      recordedAt: new Date(),
      recordedById: dad.id,
      statusId: status.id,
      source: "manual",
    },
  });

  console.log("Created initial preferences, status, and glucose reading");
}

/**
 * Find the first user with ATHLETE role and mark them as isAthlete=true
 * This is used for migrating from the old schema to the new one
 */
async function markFirstAthlete() {
  // First, look for users with ATHLETE role
  const athlete = await db.user.findFirst({
    where: {
      role: "ATHLETE" as Role,
    },
  });

  if (athlete) {
    // Mark this user as the athlete
    await db.user.update({
      where: { id: athlete.id },
      data: { isAthlete: true },
    });
    console.log(`Marked user ${athlete.id} (${athlete.name}) as the athlete`);
    return;
  }

  // If no ATHLETE role found, check if there's a user named 'Son', 'Kid', 'Child', or similar
  const namePatterns = ["son", "kid", "child", "athlete", "boy", "girl"];

  for (const pattern of namePatterns) {
    const potentialAthlete = await db.user.findFirst({
      where: {
        name: {
          contains: pattern,
        },
      },
    });

    if (potentialAthlete) {
      await db.user.update({
        where: { id: potentialAthlete.id },
        data: { isAthlete: true },
      });
      console.log(
        `Marked user ${potentialAthlete.id} (${potentialAthlete.name}) as the athlete based on name`
      );
      return;
    }
  }

  console.log(
    "Could not automatically identify the athlete. Please mark the athlete manually."
  );
}
