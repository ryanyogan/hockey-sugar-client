import { schedules } from "@trigger.dev/sdk/v3";
import { useEffect, useState } from "react";
import { data, useFetcher, useLoaderData } from "react-router";
import { getFormattedAthleteData } from "~/lib/athlete.server";
import { db } from "~/lib/db.server";
import { getDexcomToken, updateGlucoseFromDexcom } from "~/lib/dexcom.server";
import { requireParentUser } from "~/lib/session.server";
import { StatusType } from "~/types/status";
import { AthleteStatusCard } from "./components/athlete-status-card";
import { DexcomStatus } from "./components/dexcom-status";
import {
  DexcomDialog,
  PreferencesDialog,
  StrobeDialog,
} from "./components/dialogs";
import { GlucoseDataDisplay } from "./components/glucose-display";
import { ManualGlucoseEntryForm } from "./components/manual-glucose-entry-form";

/**
 * Main data loader for the parent dashboard
 */
export async function loader({ request }: any) {
  const user = await requireParentUser(request);

  // Get athlete with all formatted data
  const athlete = await getFormattedAthleteData();

  // Get the DexCom token
  const dexcomToken = await getDexcomToken();

  // Get parent preferences
  const preferences = (await db.userPreferences.findUnique({
    where: { userId: user.id },
    select: {
      lowThreshold: true,
      highThreshold: true,
    },
  })) || { lowThreshold: 70, highThreshold: 180 };

  // Get the latest glucose reading
  const latestReading = await db.glucoseReading.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
    },
  });

  // Get the job status from trigger.dev
  let isJobRunning = false;

  try {
    const job = await schedules.list();
    isJobRunning =
      job.data.find((job) => job.task === "dexcom-polling")?.active ?? false;
  } catch (error) {
    console.error("Failed to get job status:", error);
  }

  return data({
    user,
    athlete,
    dexcomToken,
    preferences,
    lastReadingTime: latestReading?.createdAt,
    isJobRunning,
  });
}

export async function action({ request }: any) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "start-dexcom-job": {
      try {
        const jobs = await schedules.list();
        const job = jobs.data.find((job) => job.task === "dexcom-polling");

        if (job) {
          await schedules.activate(job.id);
        }

        return data({ success: true });
      } catch (error) {
        console.error("Failed to start job:", error);
        return data({ error: "Failed to start job" }, { status: 500 });
      }
    }

    case "stop-dexcom-job": {
      try {
        const jobs = await schedules.list();
        const job = jobs.data.find((job) => job.task === "dexcom-polling");

        if (job) {
          await schedules.deactivate(job.id);
        }

        return data({ success: true });
      } catch (error) {
        console.error("Failed to stop job:", error);
        return data({ error: "Failed to stop job" }, { status: 500 });
      }
    }

    case "update-glucose": {
      const value = formData.get("value");
      const unit = formData.get("unit") || "mg/dL";

      if (!value) {
        return data({ error: "Glucose value is required" }, { status: 400 });
      }

      // Get parent preferences for thresholds
      const preferences = (await db.userPreferences.findUnique({
        where: { userId: user.id },
      })) || { lowThreshold: 70, highThreshold: 180 };

      // Determine status based on glucose value
      const numericValue = Number(value);
      let statusType = StatusType.OK as StatusType;

      if (isNaN(numericValue)) {
        return data({ error: "Invalid glucose value" }, { status: 400 });
      }

      if (numericValue < preferences.lowThreshold) {
        statusType = StatusType.LOW;
      } else if (numericValue > preferences.highThreshold) {
        statusType = StatusType.HIGH;
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
          value: numericValue,
          unit: unit as string,
          recordedById: user.id,
          statusId: status.id,
          source: "manual",
        },
      });

      return data({ success: true, status, glucoseReading });
    }

    case "send-message": {
      const content = formData.get("content");
      const isUrgent = formData.get("isUrgent") === "true";

      if (!content || typeof content !== "string") {
        return data({ error: "Message content is required" }, { status: 400 });
      }

      // Get the athlete
      const athlete = await db.user.findFirst({
        where: { isAthlete: true },
      });

      if (!athlete) {
        return data({ error: "Athlete not found" }, { status: 404 });
      }

      // Create new message
      const message = await db.message.create({
        data: {
          content,
          isUrgent,
          senderId: user.id,
          receiverId: athlete.id,
        },
      });

      return data({ success: true, message });
    }

    case "send-strobe": {
      // Get the athlete
      const athlete = await db.user.findFirst({
        where: { isAthlete: true },
      });

      if (!athlete) {
        return data({ error: "Athlete not found" }, { status: 404 });
      }

      // Create urgent strobe message
      const message = await db.message.create({
        data: {
          content: "⚠️ STROBE ALERT! PLEASE CHECK YOUR PHONE IMMEDIATELY!",
          isUrgent: true,
          senderId: user.id,
          receiverId: athlete.id,
        },
      });

      return data({ success: true, message });
    }

    case "refresh-dexcom": {
      const result = await updateGlucoseFromDexcom(user.id);
      return data(result);
    }

    case "update-preferences": {
      const lowThreshold = formData.get("lowThreshold");
      const highThreshold = formData.get("highThreshold");

      if (
        typeof lowThreshold !== "string" ||
        typeof highThreshold !== "string" ||
        isNaN(Number(lowThreshold)) ||
        isNaN(Number(highThreshold))
      ) {
        return data({ error: "Invalid threshold values" }, { status: 400 });
      }

      const lowValue = Number(lowThreshold);
      const highValue = Number(highThreshold);

      if (lowValue >= highValue) {
        return data(
          { error: "Low threshold must be less than high threshold" },
          { status: 400 }
        );
      }

      // Update or create preferences
      await db.userPreferences.upsert({
        where: {
          userId: user.id,
        },
        update: {
          lowThreshold: lowValue,
          highThreshold: highValue,
        },
        create: {
          userId: user.id,
          lowThreshold: lowValue,
          highThreshold: highValue,
        },
      });

      return data({ success: true });
    }

    default: {
      return data({ error: "Invalid intent" }, { status: 400 });
    }
  }
}

export default function ParentDashboard() {
  const {
    user,
    athlete,
    dexcomToken,
    preferences,
    lastReadingTime,
    isJobRunning,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  // State hooks
  const [isStrobeDialogOpen, setIsStrobeDialogOpen] = useState(false);
  const [isDexcomDialogOpen, setIsDexcomDialogOpen] = useState(false);
  const [isDexcomConnected, setIsDexcomConnected] = useState(!!dexcomToken);
  const [dexcomError, setDexcomError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(
    preferences?.lowThreshold || 70
  );
  const [highThreshold, setHighThreshold] = useState(
    preferences?.highThreshold || 180
  );
  const [isPreferencesDialogOpen, setIsPreferencesDialogOpen] = useState(false);

  // Check URL parameters for Dexcom callback results
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const success = url.searchParams.get("success");
      const error = url.searchParams.get("error");

      if (success === "true") {
        setIsDexcomConnected(true);
        // Clean up URL
        window.history.replaceState({}, "", "/parent");
      } else if (error) {
        setDexcomError(error);
        // Clean up URL
        window.history.replaceState({}, "", "/parent");
      }
    }
  }, []);

  // Reset form after successful submission and handle response
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      handleFetcherResponse(fetcher.data);
    }
  }, [fetcher.state, fetcher.data]);

  // Handle fetcher response
  const handleFetcherResponse = (response: any) => {
    if (response.success) {
      resetForm();
      // Refresh the page to show updated data
      window.location.reload();
    } else if (response.noNewData) {
      alert("Dexcom has not provided a new value yet");
    } else if (response.needsReauth) {
      setDexcomError("Dexcom connection expired. Please reconnect.");
      setIsDexcomConnected(false);
      setIsDexcomDialogOpen(true);
    } else if (!response.success) {
      setDexcomError(response.error || "Failed to refresh Dexcom data");
    }

    setIsRefreshing(false);
  };

  // Reset form helper
  const resetForm = () => {
    const form = document.querySelector(
      'form[method="post"]'
    ) as HTMLFormElement;
    if (form) {
      form.reset();
    }
  };

  // Function to handle Dexcom authentication success
  const handleDexcomAuthSuccess = () => {
    setIsDexcomConnected(true);
    setDexcomError(null);
  };

  // Function to refresh Dexcom data
  const refreshDexcomData = async () => {
    if (!dexcomToken) {
      setDexcomError("No Dexcom connection found. Please connect to Dexcom.");
      setIsDexcomConnected(false);
      setIsDexcomDialogOpen(true);
      return;
    }

    setIsRefreshing(true);
    setDexcomError(null);

    try {
      // Submit the form to update the glucose reading
      const formData = new FormData();
      formData.append("intent", "refresh-dexcom");

      fetcher.submit(formData, { method: "post" });
    } catch (error) {
      console.error("Error refreshing Dexcom data:", error);
      setDexcomError("Failed to refresh Dexcom data");
      setIsRefreshing(false);
    }
  };

  const handleGlucoseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    fetcher.submit(form, { method: "post" });
  };

  const handleSendStrobe = () => {
    fetcher.submit(
      {
        intent: "send-strobe",
      },
      { method: "post" }
    );

    setIsStrobeDialogOpen(false);
  };

  // Function to update preferences
  const updatePrefs = () => {
    const formData = new FormData();
    formData.append("intent", "update-preferences");
    formData.append("lowThreshold", lowThreshold.toString());
    formData.append("highThreshold", highThreshold.toString());

    fetcher.submit(formData, { method: "post" });
    setIsPreferencesDialogOpen(false);
  };

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Parent Dashboard</h1>
        <p className="text-gray-600">
          Monitor and manage your athlete's glucose data
        </p>
      </div>

      <div className="container mx-auto py-8">
        {/* Dialogs */}
        <PreferencesDialog
          isOpen={isPreferencesDialogOpen}
          setIsOpen={setIsPreferencesDialogOpen}
          lowThreshold={lowThreshold}
          setLowThreshold={setLowThreshold}
          highThreshold={highThreshold}
          setHighThreshold={setHighThreshold}
          updatePreferences={updatePrefs}
        />

        <StrobeDialog
          isOpen={isStrobeDialogOpen}
          setIsOpen={setIsStrobeDialogOpen}
          athleteName={athlete?.name}
          handleSendStrobe={handleSendStrobe}
        />

        <DexcomDialog
          isOpen={isDexcomDialogOpen}
          setIsOpen={setIsDexcomDialogOpen}
          onAuthSuccess={handleDexcomAuthSuccess}
        />

        {athlete ? (
          <div className="space-y-6">
            <DexcomStatus
              isConnected={isDexcomConnected}
              lastReadingTime={lastReadingTime}
              isJobRunning={isJobRunning}
              onRefresh={refreshDexcomData}
            />

            <AthleteStatusCard
              athlete={athlete}
              isDexcomConnected={isDexcomConnected}
              setIsDexcomDialogOpen={setIsDexcomDialogOpen}
              isRefreshing={isRefreshing}
              refreshDexcomData={refreshDexcomData}
              setIsStrobeDialogOpen={setIsStrobeDialogOpen}
              isSubmitting={isSubmitting}
              preferences={preferences}
              setIsPreferencesDialogOpen={setIsPreferencesDialogOpen}
            />

            <ManualGlucoseEntryForm
              handleSubmit={handleGlucoseSubmit}
              athleteName={athlete.name}
              isSubmitting={isSubmitting}
            />

            <GlucoseDataDisplay athlete={athlete} />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h2 className="text-xl font-bold mb-4">No Athlete Found</h2>
            <p className="mb-4">
              It looks like your son's account has not been set up yet.
            </p>
            <p>
              Contact the system administrator to set up your son's account as
              an athlete.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
