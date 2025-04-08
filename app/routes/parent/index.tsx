import { useEffect, useState } from "react";
import {
  data,
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutletContext,
} from "react-router";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "./+types";
import { getAthleteWithMetadata } from "./queries/get-athlete-with-metadata";
import { getAthletes } from "./queries/get-athletes";
import { refreshDexcom } from "./queries/refresh-dexcom";
import { sendMessage } from "./queries/send-message";
import { sendStrobe } from "./queries/send-strobe";
import { updatePreferences } from "./queries/update-preferences";

// Move types to a separate file to keep the route module clean
import type { GlucoseReading, StatusType } from "@prisma/client";
import { AthleteStatusCard } from "./components/athlete-status-card";
import {
  DexcomDialog,
  PreferencesDialog,
  RemoveAthleteDialog,
  StrobeDialog,
} from "./components/dialogs";
import { GlucoseDataDisplay } from "./components/glucose-display";
import { ManualGlucoseEntryForm } from "./components/manual-glucose-entry-form";
import { NoAthletesDisplay } from "./components/no-athletes-display";
import { updateGlucose } from "./queries/update-glucose";
import type { LoaderData } from "./types";

/**
 * Main data loader for the parent dashboard
 * Fetches athlete information, dexcom connection status, and user preferences
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);

  // Get all athletes for the parent
  const athletes = await getAthletes(user);

  // Get the selected athlete data
  let selectedAthlete = null;
  if (athletes.length > 0) {
    const athlete = await getAthleteWithMetadata(user, athletes[0]?.id);
    if (athlete) {
      selectedAthlete = formatAthleteData(athlete);
    }
  }

  // Get the user's Dexcom token
  const dexcomToken = await db.dexcomToken.findUnique({
    where: { userId: user.id },
  });

  // Get or create user preferences with default values
  const preferences = await getUserPreferences(user.id);

  return data<LoaderData>({
    user,
    athletes,
    selectedAthlete,
    dexcomToken,
    preferences,
  });
}

/**
 * Format athlete data for the UI, converting date objects to ISO strings
 */
function formatAthleteData(athlete: any) {
  // Sort glucose readings by recordedAt in descending order
  const sortedReadings = [...athlete.glucoseReadings].sort(
    (a: any, b: any) =>
      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );

  // Get the latest reading
  const latestReading = sortedReadings[0];

  return {
    id: athlete.id,
    name: athlete.name,
    unreadMessagesCount: athlete.receivedMessages.length,
    status: latestReading
      ? {
          type: latestReading.statusType as StatusType,
          acknowledgedAt: latestReading.acknowledgedAt?.toISOString() ?? null,
          createdAt: latestReading.createdAt.toISOString(),
          updatedAt: latestReading.updatedAt.toISOString(),
        }
      : null,
    glucose: latestReading
      ? {
          ...latestReading,
          recordedAt: latestReading.recordedAt.toISOString(),
          createdAt: latestReading.createdAt.toISOString(),
          updatedAt: latestReading.updatedAt.toISOString(),
          acknowledgedAt: latestReading.acknowledgedAt?.toISOString() ?? null,
          source: latestReading.source as "manual" | "dexcom" | undefined,
        }
      : null,
    glucoseHistory: sortedReadings.slice(1).map((reading: GlucoseReading) => ({
      ...reading,
      recordedAt: reading.recordedAt.toISOString(),
      createdAt: reading.createdAt.toISOString(),
      updatedAt: reading.updatedAt.toISOString(),
      acknowledgedAt: reading.acknowledgedAt?.toISOString() ?? null,
      source: reading.source as "manual" | "dexcom" | undefined,
    })),
  };
}

/**
 * Get or create user preferences
 */
async function getUserPreferences(userId: string) {
  const preferences = await db.userPreferences.findUnique({
    where: { userId },
    select: {
      lowThreshold: true,
      highThreshold: true,
    },
  });

  // If preferences don't exist, create default ones
  if (!preferences) {
    await db.userPreferences.create({
      data: {
        userId,
        lowThreshold: 70,
        highThreshold: 180,
      },
    });
    return { lowThreshold: 70, highThreshold: 180 };
  }

  return preferences;
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Use a switch statement to handle different actions based on intent
  switch (intent) {
    case "update-glucose": {
      return updateGlucose({ user, formData });
    }

    case "send-message": {
      return sendMessage({ user, formData });
    }

    case "send-strobe": {
      return sendStrobe({ user, formData });
    }

    case "refresh-dexcom": {
      return refreshDexcom({ user });
    }

    case "update-preferences": {
      return updatePreferences({ user, formData });
    }

    default: {
      return data({ error: "Invalid intent" }, { status: 400 });
    }
  }
}

export default function ParentDashboard() {
  const { user, athletes, selectedAthlete, dexcomToken, preferences } =
    useLoaderData<typeof loader>();
  const context = useOutletContext<{
    selectedAthleteId: string | null;
  }>();
  const selectedAthleteId = context.selectedAthleteId ?? null;
  const fetcher = useFetcher<{
    success?: boolean;
    error?: string;
    noNewData?: boolean;
    needsReauth?: boolean;
  }>();
  const navigate = useNavigate();

  // State hooks
  const [isStrobeDialogOpen, setIsStrobeDialogOpen] = useState(false);
  const [isDexcomDialogOpen, setIsDexcomDialogOpen] = useState(false);
  const [isDexcomConnected, setIsDexcomConnected] = useState(!!dexcomToken);
  const [dexcomError, setDexcomError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRemoveAthleteDialogOpen, setIsRemoveAthleteDialogOpen] =
    useState(false);
  const [athleteToRemove, setAthleteToRemove] = useState<string | null>(null);
  const [isRemovingAthlete, setIsRemovingAthlete] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(
    preferences?.lowThreshold || 70
  );
  const [highThreshold, setHighThreshold] = useState(
    preferences?.highThreshold || 180
  );
  const [isPreferencesDialogOpen, setIsPreferencesDialogOpen] = useState(false);
  const [noNewDataMessage, setNoNewDataMessage] = useState<string | null>(null);

  // Show the remove athlete dialog if there are multiple athletes
  useEffect(() => {
    if (athletes.length > 1) {
      setIsRemoveAthleteDialogOpen(true);
    }
  }, [athletes.length]);

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
      setNoNewDataMessage(
        "Dexcom data has not updated, please try again in a few minutes."
      );
      // Clear the message after 5 seconds
      setTimeout(() => {
        setNoNewDataMessage(null);
      }, 5000);
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

    // Check if token is expired or about to expire (within 5 minutes)
    const isExpired = new Date(dexcomToken.expiresAt) < new Date();
    const isExpiringSoon =
      new Date(dexcomToken.expiresAt) < new Date(Date.now() + 5 * 60 * 1000);

    if (isExpired || isExpiringSoon) {
      console.log("Dexcom token expired or expiring soon");
      // The server will handle the refresh, but we'll show a message
      setDexcomError("Refreshing Dexcom connection...");
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
    if (!selectedAthleteId) return;

    fetcher.submit(
      {
        intent: "send-strobe",
        athleteId: selectedAthleteId,
      },
      { method: "post" }
    );

    setIsStrobeDialogOpen(false);
  };

  const handleRemoveAthlete = () => {
    if (!athleteToRemove) return;

    setIsRemovingAthlete(true);

    const formData = new FormData();
    formData.append("intent", "remove-athlete");
    formData.append("athleteId", athleteToRemove);

    fetcher.submit(formData, { method: "post" });

    // Redirect to the parent page with the athleteRemoved parameter
    navigate("/parent?athleteRemoved=true");
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
    <div className="p-4 md:p-6 space-y-6">
      {/* Dialogs */}
      <RemoveAthleteDialog
        isOpen={isRemoveAthleteDialogOpen}
        setIsOpen={setIsRemoveAthleteDialogOpen}
        athleteToRemove={athleteToRemove}
        setAthleteToRemove={setAthleteToRemove}
        handleRemoveAthlete={handleRemoveAthlete}
        isRemoving={isRemovingAthlete}
        athletes={athletes}
      />

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
        athleteName={selectedAthlete?.name}
        handleSendStrobe={handleSendStrobe}
      />

      <DexcomDialog
        isOpen={isDexcomDialogOpen}
        setIsOpen={setIsDexcomDialogOpen}
        onAuthSuccess={handleDexcomAuthSuccess}
      />

      {noNewDataMessage && (
        <div className="bg-orange-500 text-white p-3 rounded-md mb-4">
          {noNewDataMessage}
        </div>
      )}

      {selectedAthlete ? (
        <div className="space-y-6">
          <AthleteStatusCard
            athlete={selectedAthlete}
            isDexcomConnected={isDexcomConnected}
            setIsDexcomDialogOpen={setIsDexcomDialogOpen}
            isRefreshing={isRefreshing}
            refreshDexcomData={refreshDexcomData}
            setIsStrobeDialogOpen={setIsStrobeDialogOpen}
            selectedAthleteId={selectedAthleteId}
            isSubmitting={isSubmitting}
            preferences={preferences}
            setIsPreferencesDialogOpen={setIsPreferencesDialogOpen}
          />

          <ManualGlucoseEntryForm
            handleSubmit={handleGlucoseSubmit}
            athleteName={selectedAthlete.name}
            selectedAthleteId={selectedAthleteId}
            isSubmitting={isSubmitting}
          />

          <GlucoseDataDisplay athlete={selectedAthlete} />
        </div>
      ) : (
        <NoAthletesDisplay />
      )}
    </div>
  );
}
