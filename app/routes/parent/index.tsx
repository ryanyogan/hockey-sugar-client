import { AlertCircle, Clock, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { getFormattedAthleteData } from "~/lib/athlete.server";
import { db } from "~/lib/db.server";
import { getDexcomToken, updateGlucoseFromDexcom } from "~/lib/dexcom.server";
import { jobRunner } from "~/lib/job-runner.server";
import { requireParentUser } from "~/lib/session.server";
import { StatusType } from "~/types/status";
import {
  DexcomDialog,
  PreferencesDialog,
  StrobeDialog,
} from "./components/dialogs";
import { GlucoseDataDisplay } from "./components/glucose-display";
import { ManualGlucoseEntryForm } from "./components/manual-glucose-entry-form";
import { UnifiedStatusCard } from "./components/unified-status-card";

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
  const jobStatus = jobRunner.getStatus();
  const isJobRunning = !!jobStatus["dexcom-sync"]?.isScheduled;

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
        jobRunner.startJob("dexcom-sync");

        return data({ success: true });
      } catch (error) {
        console.error("Failed to start job:", error);
        return data({ error: "Failed to start job" }, { status: 500 });
      }
    }

    case "stop-dexcom-job": {
      try {
        jobRunner.stopJob("dexcom-sync");
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

    case "disconnect-dexcom": {
      try {
        // Delete all Dexcom tokens
        await db.dexcomToken.deleteMany({});
        return data({ success: true });
      } catch (error) {
        console.error("Failed to disconnect Dexcom:", error);
        return data({ error: "Failed to disconnect Dexcom" }, { status: 500 });
      }
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
  const validator = useRevalidator();
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

  // Set up SSE connection to listen for Dexcom data updates
  useEffect(() => {
    if (!athlete) return;

    const eventSource = new EventSource("/api/dexcom/events");

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // If we receive a Dexcom data update, refresh the page data
      if (data.glucoseReading) {
        validator.revalidate();
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      eventSource.close();
    };

    // Clean up the EventSource when the component unmounts
    return () => {
      eventSource.close();
    };
  }, [athlete, validator]);

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
      {/* Page Header - No Card */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              <span className="mr-2">{athlete?.name || "Athlete"}</span>
              {athlete?.status && (
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    athlete.status.type === "HIGH"
                      ? "bg-black text-white"
                      : athlete.status.type === "LOW"
                      ? "bg-red-600 text-white"
                      : "bg-green-600 text-white"
                  }`}
                >
                  {athlete.status.type}
                </span>
              )}
            </h1>
            <p className="text-gray-600 flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              Last updated:{" "}
              {athlete?.glucose
                ? new Date(athlete.glucose.recordedAt).toLocaleTimeString()
                : "No recent readings"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
            {/* Dexcom Connection Status */}
            {isDexcomConnected ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Dexcom Connected</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDexcomDialogOpen(true)}
                className="flex items-center bg-white text-blue-600 hover:bg-blue-50"
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Connect Dexcom
              </Button>
            )}

            {/* SOS Button */}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsStrobeDialogOpen(true)}
              disabled={isSubmitting}
              className="flex items-center"
            >
              <AlertCircle className="h-4 w-4 mr-1.5" />
              Send SOS
            </Button>
          </div>
        </div>
      </div>

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
          <UnifiedStatusCard
            athlete={athlete}
            isDexcomConnected={isDexcomConnected}
            setIsDexcomDialogOpen={setIsDexcomDialogOpen}
            isRefreshing={isRefreshing}
            refreshDexcomData={refreshDexcomData}
            setIsStrobeDialogOpen={setIsStrobeDialogOpen}
            isSubmitting={isSubmitting}
            preferences={preferences}
            setIsPreferencesDialogOpen={setIsPreferencesDialogOpen}
            lastReadingTime={lastReadingTime}
            isJobRunning={isJobRunning}
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
            Contact the system administrator to set up your son's account as an
            athlete.
          </p>
        </div>
      )}
    </div>
  );
}
