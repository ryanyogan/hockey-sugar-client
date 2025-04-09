import { StatusType } from "@prisma/client";
import { db } from "./db.server";
import {
  getDexcomToken,
  refreshDexcomToken,
  saveDexcomToken,
} from "./dexcom.server";
import { eventEmitter } from "./event-emitter.server";

type Job = {
  id: string;
  interval: number; // milliseconds
  lastRun?: number;
  isRunning: boolean;
  run: () => Promise<void>;
};

class JobRunner {
  private jobs: Map<string, Job> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized: boolean = false;

  // Register a new job
  register(
    jobId: string,
    intervalMs: number,
    jobFn: () => Promise<void>
  ): void {
    this.jobs.set(jobId, {
      id: jobId,
      interval: intervalMs,
      isRunning: false,
      run: jobFn,
    });

    console.log(`Registered job: ${jobId}, interval: ${intervalMs}ms`);
  }

  // Start all registered jobs
  start(): void {
    if (this.isInitialized) {
      console.log("Job runner already initialized");
      return;
    }

    this.isInitialized = true;

    for (const [jobId, job] of this.jobs.entries()) {
      this.startJob(jobId);
    }

    console.log("Job runner initialized");
  }

  // Start a specific job
  startJob(jobId: string): void {
    const job = this.jobs.get(jobId);

    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    if (this.intervals.has(jobId)) {
      console.log(`Job ${jobId} already running`);
      return;
    }

    const interval = setInterval(async () => {
      if (job.isRunning) {
        console.log(`Job ${jobId} already running, skipping`);
        return;
      }

      try {
        job.isRunning = true;
        job.lastRun = Date.now();

        console.log(`Running job: ${jobId}`);
        await job.run();
        console.log(`Job ${jobId} completed`);
      } catch (error) {
        console.error(`Error in job ${jobId}:`, error);
      } finally {
        job.isRunning = false;
      }
    }, job.interval);

    this.intervals.set(jobId, interval);
    console.log(`Started job: ${jobId}`);

    // Optionally run immediately on startup
    setTimeout(async () => {
      try {
        job.isRunning = true;
        console.log(`Running job on startup: ${jobId}`);
        await job.run();
        console.log(`Initial run of job ${jobId} completed`);
      } catch (error) {
        console.error(`Error in initial run of job ${jobId}:`, error);
      } finally {
        job.isRunning = false;
      }
    }, 1000); // Small delay before first run
  }

  // Stop a specific job
  stopJob(jobId: string): void {
    const interval = this.intervals.get(jobId);

    if (interval) {
      clearInterval(interval);
      this.intervals.delete(jobId);
      console.log(`Stopped job: ${jobId}`);
    }
  }

  // Stop all jobs
  stop(): void {
    for (const [jobId, interval] of this.intervals.entries()) {
      clearInterval(interval);
      console.log(`Stopped job: ${jobId}`);
    }

    this.intervals.clear();
    console.log("All jobs stopped");
    this.isInitialized = false;
  }

  // Get status of all jobs
  getStatus(): Record<
    string,
    {
      lastRun: number | undefined;
      isRunning: boolean;
      interval: number;
      isScheduled: boolean;
    }
  > {
    const status: Record<string, any> = {};

    for (const [jobId, job] of this.jobs.entries()) {
      status[jobId] = {
        lastRun: job.lastRun,
        isRunning: job.isRunning,
        interval: job.interval,
        isScheduled: this.intervals.has(jobId),
      };
    }

    return status;
  }
}

// Singleton instance
const jobRunner = new JobRunner();

// Define your DexCom job
async function fetchDexcomData() {
  // Log the start of the job
  console.log("Starting Dexcom polling job");

  try {
    // Get the latest Dexcom token
    const dexcomToken = await getDexcomToken();

    if (!dexcomToken) {
      console.error("No Dexcom token found");
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
        console.log("Refreshed Dexcom token");
      } catch (error) {
        console.error("Token expired and refresh failed", { error });
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
      console.log("No readings available");
      return { success: false, error: "No readings available" };
    }

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

    eventEmitter.emit("dexcom-data-updated", {
      glucoseReading: null,
      status: null,
      timestamp: Date.now(),
    });

    if (existingReading) {
      console.log("No new data from Dexcom");
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

    console.log("Successfully created new reading", {
      value: reading.value,
      status: statusType,
    });

    // Emit an event to notify that new data is available
    eventEmitter.emit("dexcom-data-updated", {
      glucoseReading,
      status,
      timestamp: Date.now(),
    });

    return { success: true, status, glucoseReading };
  } catch (error: any) {
    console.error("Error updating glucose from Dexcom", { error });
    return { success: false, error: error.message };
  }
}

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

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_SECONDS = 10000;

jobRunner.register("dexcom-sync", TEN_SECONDS, async () => {
  const result = await fetchDexcomData();
  console.log("Dexcom sync result:", result);
});

export { jobRunner };
