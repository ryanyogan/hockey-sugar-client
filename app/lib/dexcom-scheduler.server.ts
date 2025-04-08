import { StatusType } from "@prisma/client";
import schedule from "node-schedule";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "~/lib/db.server";
import { getLatestDexcomReading } from "~/lib/dexcom.server";

// Create a WebSocket server
let wss: WebSocketServer | null = null;

// Store connected clients
const clients = new Set<WebSocket>();

// Initialize the WebSocket server
export function initializeWebSocketServer(port: number = 8080) {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  if (wss) {
    if (isDevelopment) {
      console.log("WebSocket server already initialized");
    }
    return; // Already initialized
  }

  wss = new WebSocketServer({ port });

  wss.on("connection", (ws: WebSocket) => {
    if (isDevelopment) {
      console.log(
        `New WebSocket connection established (total clients: ${
          clients.size + 1
        })`
      );
    } else {
      console.log("New WebSocket connection established");
    }

    clients.add(ws);

    ws.on("close", () => {
      if (isDevelopment) {
        console.log(
          `WebSocket connection closed (remaining clients: ${clients.size - 1})`
        );
      } else {
        console.log("WebSocket connection closed");
      }
      clients.delete(ws);
    });

    // Send initial data to the new client
    sendInitialData(ws);
  });

  console.log(`WebSocket server started on port ${port} in ${NODE_ENV} mode`);
}

// Send initial data to a newly connected client
async function sendInitialData(ws: WebSocket) {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  try {
    if (isDevelopment) {
      console.log("Sending initial data to new client...");
    }

    // Get all athletes with their latest glucose readings
    const athletes = await db.user.findMany({
      where: { role: "ATHLETE" },
      include: {
        glucoseReadings: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    if (isDevelopment) {
      console.log(`Found ${athletes.length} athletes for initial data`);

      // Log details about each athlete
      if (athletes.length > 0) {
        console.log("Athletes for initial data:");
        athletes.forEach((athlete) => {
          console.log(`- ${athlete.name} (ID: ${athlete.id})`);
          console.log(
            `  Latest reading: ${
              athlete.glucoseReadings[0]
                ? `${athlete.glucoseReadings[0].value} ${athlete.glucoseReadings[0].unit} at ${athlete.glucoseReadings[0].recordedAt}`
                : "None"
            }`
          );

          // Check if this athlete has a Dexcom token
          checkAthleteDexcomToken(athlete.id);
        });
      }
    }

    // Get all Dexcom tokens to check for parent relationships
    const dexcomTokens = await db.dexcomToken.findMany({
      include: {
        user: true,
        athlete: true,
      },
    });

    // For each athlete, check if they have a parent with a Dexcom token
    const athletesWithParentTokens = [];

    for (const athlete of athletes) {
      // First check if the athlete has a direct Dexcom token
      const directToken = dexcomTokens.find(
        (token) => token.athleteId === athlete.id
      );

      if (directToken) {
        athletesWithParentTokens.push({
          athleteId: athlete.id,
          parentId: directToken.userId,
          parentName: directToken.user?.name || "Unknown",
          tokenId: directToken.id,
          isDirect: true,
        });

        if (isDevelopment) {
          console.log(
            `Athlete ${athlete.name} has a direct Dexcom token: ${directToken.id}`
          );
        }
        continue;
      }

      // Check if the athlete has a parent with a Dexcom token
      const parent = await db.user.findFirst({
        where: {
          role: "PARENT",
          athleteParents: {
            some: {
              athleteId: athlete.id,
            },
          },
        },
        include: {
          dexcomToken: true,
        },
      });

      if (parent?.dexcomToken) {
        // Update the token with the athlete ID if it's not already set
        if (!parent.dexcomToken.athleteId) {
          await db.dexcomToken.update({
            where: { id: parent.dexcomToken.id },
            data: { athleteId: athlete.id },
          });

          if (isDevelopment) {
            console.log(
              `Updated parent's Dexcom token with athlete ID: ${athlete.id}`
            );
          }
        }

        athletesWithParentTokens.push({
          athleteId: athlete.id,
          parentId: parent.id,
          parentName: parent.name,
          tokenId: parent.dexcomToken.id,
          isDirect: false,
        });

        if (isDevelopment) {
          console.log(
            `Athlete ${athlete.name} has a Dexcom token through parent ${parent.name}: ${parent.dexcomToken.id}`
          );
        }
      }
    }

    const message = JSON.stringify({
      type: "initial-data",
      athletes: athletes.map((athlete) => ({
        id: athlete.id,
        name: athlete.name,
        latestReading: athlete.glucoseReadings[0] || null,
      })),
      parentTokens: athletesWithParentTokens,
    });

    ws.send(message);

    if (isDevelopment) {
      console.log("Initial data sent to new client");
    }
  } catch (error) {
    if (isDevelopment) {
      console.error("Error sending initial data:", error);
      console.error(
        "Stack trace:",
        error instanceof Error ? error.stack : "No stack trace available"
      );
    } else {
      console.error("Error sending initial data:", error);
    }
  }
}

// Helper function to check if an athlete has a Dexcom token
async function checkAthleteDexcomToken(athleteId: string) {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  if (!isDevelopment) return;

  try {
    const athlete = await db.user.findUnique({
      where: { id: athleteId },
      include: { dexcomToken: true },
    });

    if (athlete) {
      console.log(
        `  Dexcom token for ${athlete.name}: ${
          athlete.dexcomToken ? "Present" : "Missing"
        }`
      );
      if (athlete.dexcomToken) {
        console.log(`  Token ID: ${athlete.dexcomToken.id}`);
        console.log(`  Token expires: ${athlete.dexcomToken.expiresAt}`);
      }
    }
  } catch (error) {
    console.error(
      `Error checking Dexcom token for athlete ${athleteId}:`,
      error
    );
  }
}

// Broadcast a message to all connected clients
export function broadcastMessage(message: any) {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  const messageString = JSON.stringify(message);

  if (isDevelopment) {
    console.log(
      `Broadcasting message: ${message.type} to ${clients.size} clients`
    );
  }

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

// Poll Dexcom data for all athletes
async function pollDexcomData() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  console.log(`Polling Dexcom data... (${new Date().toLocaleTimeString()})`);

  try {
    // First, get all Dexcom tokens
    const dexcomTokens = await db.dexcomToken.findMany({
      include: {
        user: true, // Include the user associated with the token
        athlete: true, // Include the athlete associated with the token
      },
    });

    if (isDevelopment) {
      console.log(`Found ${dexcomTokens.length} Dexcom tokens in the database`);

      // Log details about each Dexcom token
      if (dexcomTokens.length > 0) {
        console.log("Dexcom tokens:");
        dexcomTokens.forEach((token) => {
          console.log(`- Token ID: ${token.id}`);
          console.log(`  User ID: ${token.userId}`);
          console.log(`  User name: ${token.user?.name || "Unknown"}`);
          console.log(`  User role: ${token.user?.role || "Unknown"}`);
          if (token.athleteId) {
            console.log(`  Athlete ID: ${token.athleteId}`);
            console.log(`  Athlete name: ${token.athlete?.name || "Unknown"}`);
          } else {
            console.log(`  No athlete associated with this token`);
          }
          console.log(`  Expires: ${token.expiresAt}`);
        });
      }
    }

    // Get all athletes
    const athletes = await db.user.findMany({
      where: { role: "ATHLETE" },
      include: {
        glucoseReadings: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    if (isDevelopment) {
      console.log(`Found ${athletes.length} athletes in the database`);
    }

    // For each athlete, find their associated Dexcom token
    const athletesWithTokens = [];

    for (const athlete of athletes) {
      // First check if the athlete has a direct Dexcom token
      const directToken = dexcomTokens.find(
        (token) => token.athleteId === athlete.id
      );

      if (directToken) {
        athletesWithTokens.push({
          ...athlete,
          dexcomToken: directToken,
        });

        if (isDevelopment) {
          console.log(
            `Athlete ${athlete.name} has a direct Dexcom token: ${directToken.id}`
          );
        }
        continue;
      }

      // Check if the athlete has a parent with a Dexcom token
      const parent = await db.user.findFirst({
        where: {
          role: "PARENT",
          athleteParents: {
            some: {
              athleteId: athlete.id,
            },
          },
        },
        include: {
          dexcomToken: true,
        },
      });

      if (parent?.dexcomToken) {
        // Update the token with the athlete ID if it's not already set
        if (!parent.dexcomToken.athleteId) {
          await db.dexcomToken.update({
            where: { id: parent.dexcomToken.id },
            data: { athleteId: athlete.id },
          });

          if (isDevelopment) {
            console.log(
              `Updated parent's Dexcom token with athlete ID: ${athlete.id}`
            );
          }
        }

        athletesWithTokens.push({
          ...athlete,
          dexcomToken: parent.dexcomToken,
        });

        if (isDevelopment) {
          console.log(
            `Athlete ${athlete.name} has a Dexcom token through parent ${parent.name}: ${parent.dexcomToken.id}`
          );
        }
      }
    }

    if (isDevelopment) {
      console.log(
        `Found ${athletesWithTokens.length} athletes with Dexcom tokens (direct or through parent)`
      );
    }

    // Process each athlete with a Dexcom token
    for (const athlete of athletesWithTokens) {
      if (!athlete.dexcomToken) continue;

      try {
        if (isDevelopment) {
          console.log(`Polling Dexcom data for athlete: ${athlete.name}`);
        }

        // Get latest reading from Dexcom
        const reading = await getLatestDexcomReading(
          athlete.dexcomToken.accessToken
        );

        console.log("Reading", reading);
        console.log(athlete.dexcomToken);

        if (reading) {
          if (isDevelopment) {
            console.log(
              `Received reading for ${athlete.name}: ${reading.value} ${reading.unit} at ${reading.recordedAt}`
            );
          }

          // Check if we already have this reading (within 5 minutes)
          const latestReading = athlete.glucoseReadings[0];
          const isDuplicate =
            latestReading &&
            Math.abs(latestReading.value - reading.value) < 0.1;

          if (!isDuplicate) {
            // Determine status based on glucose value
            let statusType: StatusType = StatusType.OK;

            // Get user preferences for thresholds
            const preferences = await db.userPreferences.findFirst({
              where: { userId: athlete.id },
            });

            const lowThreshold = preferences?.lowThreshold || 70;
            const highThreshold = preferences?.highThreshold || 180;

            if (reading.value < lowThreshold) {
              statusType = StatusType.LOW;
            } else if (reading.value > highThreshold) {
              statusType = StatusType.HIGH;
            }

            if (isDevelopment) {
              console.log(
                `Status for ${athlete.name}: ${statusType} (thresholds: ${lowThreshold}-${highThreshold})`
              );
            }

            // Create new glucose reading
            const newReading = await db.glucoseReading.create({
              data: {
                value: reading.value,
                unit: reading.unit,
                recordedAt: new Date(reading.recordedAt),
                userId: athlete.id,
                recordedById: athlete.id,
                statusType,
                source: "dexcom",
              },
            });

            // Broadcast update to all connected clients
            broadcastMessage({
              type: "glucose-update",
              athleteId: athlete.id,
              reading: {
                ...newReading,
                recordedAt: newReading.recordedAt.toISOString(),
                createdAt: newReading.createdAt.toISOString(),
                updatedAt: newReading.updatedAt.toISOString(),
                acknowledgedAt:
                  newReading.acknowledgedAt?.toISOString() ?? null,
              },
            });

            if (isDevelopment) {
              console.log(
                `Updated glucose reading for ${athlete.name}: ${reading.value} ${reading.unit} (${statusType})`
              );
            } else {
              console.log(
                `Updated glucose reading for athlete ${athlete.id}: ${reading.value} ${reading.unit}`
              );
            }
          } else {
            if (isDevelopment) {
              console.log(
                `No new glucose reading for ${athlete.name} (value unchanged)`
              );
            } else {
              console.log(`No new glucose reading for athlete ${athlete.id}`);
            }
          }
        } else {
          if (isDevelopment) {
            console.log(`No reading received for ${athlete.name}`);
          } else {
            console.log(`No reading received for athlete ${athlete.id}`);
          }
        }
      } catch (error) {
        if (isDevelopment) {
          console.error(`Error polling Dexcom for ${athlete.name}:`, error);
        } else {
          console.error(
            `Error polling Dexcom for athlete ${athlete.id}:`,
            error
          );
        }

        // Check if it's an authentication error
        if (
          error instanceof Error &&
          (error.message.includes("authentication") ||
            error.message === "TOKEN_EXPIRED")
        ) {
          if (isDevelopment) {
            console.log(
              `Dexcom authentication error for ${athlete.name}. Broadcasting to clients.`
            );
          }

          // Broadcast authentication error to all connected clients
          broadcastMessage({
            type: "dexcom-auth-error",
            athleteId: athlete.id,
            message: "Dexcom connection expired. Please reconnect.",
          });
        }
      }
    }
  } catch (error) {
    if (isDevelopment) {
      console.error("Error in Dexcom polling job:", error);
      console.error(
        "Stack trace:",
        error instanceof Error ? error.stack : "No stack trace available"
      );
    } else {
      console.error("Error in Dexcom polling job:", error);
    }
  }
}

// Start the job scheduler
export function startDexcomScheduler() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  // Schedule job to run every 10 seconds in development, every minute in production
  const scheduleInterval = isDevelopment ? "*/10 * * * * *" : "*/1 * * * *";
  schedule.scheduleJob(scheduleInterval, pollDexcomData);

  // Run immediately on startup
  pollDexcomData();

  // Check database schema in development mode
  if (isDevelopment) {
    checkDatabaseSchema();
  }

  console.log(
    `Dexcom scheduler started in ${NODE_ENV} mode (polling every ${
      isDevelopment ? "10 seconds" : "minute"
    })`
  );
}

// Helper function to check the database schema
async function checkDatabaseSchema() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  if (!isDevelopment) return;

  try {
    console.log("Checking database schema...");

    // Check User model
    const userCount = await db.user.count();
    console.log(`Total users in database: ${userCount}`);

    // Check User model with role filter
    const athleteCount = await db.user.count({
      where: { role: "ATHLETE" },
    });
    console.log(`Total athletes in database: ${athleteCount}`);

    const parentCount = await db.user.count({
      where: { role: "PARENT" },
    });
    console.log(`Total parents in database: ${parentCount}`);

    // Check DexcomToken model
    const dexcomTokenCount = await db.dexcomToken.count();
    console.log(`Total Dexcom tokens in database: ${dexcomTokenCount}`);

    // Check if there are any athletes with Dexcom tokens
    const athletesWithTokens = await db.user.findMany({
      where: {
        role: "ATHLETE",
        dexcomToken: {
          isNot: null,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    console.log(
      `Athletes with direct Dexcom tokens: ${athletesWithTokens.length}`
    );

    // Check if there are any parents with Dexcom tokens
    const parentsWithTokens = await db.user.findMany({
      where: {
        role: "PARENT",
        dexcomToken: {
          isNot: null,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    console.log(`Parents with Dexcom tokens: ${parentsWithTokens.length}`);

    // Check if there are any Dexcom tokens with athleteId set
    const tokensWithAthleteId = await db.dexcomToken.count({
      where: {
        athleteId: {
          not: null,
        },
      },
    });

    console.log(`Dexcom tokens with athleteId set: ${tokensWithAthleteId}`);

    // Check the relationship between User and DexcomToken
    if (athletesWithTokens.length > 0) {
      console.log("Sample athlete with direct Dexcom token:");
      const sampleAthlete = await db.user.findUnique({
        where: { id: athletesWithTokens[0].id },
        include: { dexcomToken: true },
      });

      if (sampleAthlete) {
        console.log(`- ${sampleAthlete.name} (ID: ${sampleAthlete.id})`);
        console.log(
          `  Dexcom token: ${sampleAthlete.dexcomToken ? "Present" : "Missing"}`
        );
        if (sampleAthlete.dexcomToken) {
          console.log(`  Token ID: ${sampleAthlete.dexcomToken.id}`);
          console.log(
            `  Token expires: ${sampleAthlete.dexcomToken.expiresAt}`
          );
          console.log(
            `  Athlete ID: ${sampleAthlete.dexcomToken.athleteId || "Not set"}`
          );
        }
      }
    }

    if (parentsWithTokens.length > 0) {
      console.log("Sample parent with Dexcom token:");
      const sampleParent = await db.user.findUnique({
        where: { id: parentsWithTokens[0].id },
        include: {
          dexcomToken: true,
          athleteParents: {
            include: {
              athlete: true,
            },
          },
        },
      });

      if (sampleParent) {
        console.log(`- ${sampleParent.name} (ID: ${sampleParent.id})`);
        console.log(
          `  Dexcom token: ${sampleParent.dexcomToken ? "Present" : "Missing"}`
        );
        if (sampleParent.dexcomToken) {
          console.log(`  Token ID: ${sampleParent.dexcomToken.id}`);
          console.log(`  Token expires: ${sampleParent.dexcomToken.expiresAt}`);
          console.log(
            `  Athlete ID: ${sampleParent.dexcomToken.athleteId || "Not set"}`
          );
        }

        console.log(
          `  Associated athletes: ${sampleParent.athleteParents.length}`
        );
        sampleParent.athleteParents.forEach((relation) => {
          console.log(
            `  - ${relation.athlete.name} (ID: ${relation.athlete.id})`
          );
        });
      }
    }

    // Check alternative query for athletes with Dexcom tokens
    await checkAlternativeDexcomQuery();

    console.log("Database schema check complete");
  } catch (error) {
    console.error("Error checking database schema:", error);
  }
}

// Helper function to check alternative queries for athletes with Dexcom tokens
async function checkAlternativeDexcomQuery() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isDevelopment = NODE_ENV === "development";

  if (!isDevelopment) return;

  try {
    console.log("Checking alternative Dexcom queries...");

    // Get all athletes
    const allAthletes = await db.user.findMany({
      where: { role: "ATHLETE" },
      select: { id: true, name: true },
    });

    console.log(`Found ${allAthletes.length} athletes total`);

    // Check each athlete for a Dexcom token
    for (const athlete of allAthletes) {
      const athleteWithToken = await db.user.findUnique({
        where: { id: athlete.id },
        include: { dexcomToken: true },
      });

      if (athleteWithToken && athleteWithToken.dexcomToken) {
        console.log(
          `Athlete ${athlete.name} has a Dexcom token: ${athleteWithToken.dexcomToken.id}`
        );
      }
    }

    // Check if there are any Dexcom tokens without an associated athlete
    const allTokens = await db.dexcomToken.findMany({
      select: { id: true, userId: true, athleteId: true },
    });

    console.log(`Found ${allTokens.length} Dexcom tokens total`);

    for (const token of allTokens) {
      const user = await db.user.findUnique({
        where: { id: token.userId },
        select: { id: true, name: true, role: true },
      });

      if (user) {
        console.log(
          `Token ${token.id} belongs to user ${user.name} (${user.role})`
        );

        if (token.athleteId) {
          const athlete = await db.user.findUnique({
            where: { id: token.athleteId },
            select: { id: true, name: true },
          });

          if (athlete) {
            console.log(
              `Token ${token.id} is associated with athlete ${athlete.name} (${athlete.id})`
            );
          } else {
            console.log(
              `Token ${token.id} is associated with non-existent athlete ${token.athleteId}`
            );
          }
        } else {
          console.log(`Token ${token.id} is not associated with any athlete`);
        }
      } else {
        console.log(
          `Token ${token.id} belongs to non-existent user ${token.userId}`
        );
      }
    }

    console.log("Alternative Dexcom queries check complete");
  } catch (error) {
    console.error("Error checking alternative Dexcom queries:", error);
  }
}

// Stop the job scheduler
export function stopDexcomScheduler() {
  schedule.gracefulShutdown();
  console.log("Dexcom scheduler stopped");
}
