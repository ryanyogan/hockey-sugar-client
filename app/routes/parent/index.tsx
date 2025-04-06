import { useEffect, useState } from "react";
import {
  data,
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutletContext,
} from "react-router";
import { DexcomAuth } from "~/components/dexcom-auth";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { StatusType } from "~/components/status/status-display";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { PrismaStatusType as PrismaStatusTypeType } from "~/types/prisma";
import { PrismaStatusType } from "~/types/prisma";
import type { Route } from "../+types";

type GlucoseReading = {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  userId: string;
  recordedById: string;
  statusId: string | null;
  createdAt: string;
  updatedAt: string;
  source?: "manual" | "dexcom";
  status?: {
    type: StatusType;
    acknowledgedAt: string | null;
  } | null;
};

type Status = {
  id: string;
  type: StatusType;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Athlete = {
  id: string;
  name: string;
  unreadMessagesCount: number;
  status: Status | null;
  glucose?: GlucoseReading | null;
  glucoseHistory: GlucoseReading[];
};

type LoaderData = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
  };
  athletes: {
    id: string;
    name: string;
  }[];
  selectedAthlete: Athlete | null;
  dexcomToken: {
    accessToken: string;
    refreshToken: string;
  } | null;
};

type AthleteSelect = {
  id: true;
  name: true;
  receivedMessages: {
    where: {
      read: boolean;
      senderId: string;
    };
    select: {
      id: true;
    };
  };
  statuses: {
    orderBy: {
      createdAt: "desc";
    };
    take: number;
    select: {
      id: true;
      type: true;
      acknowledgedAt: true;
      createdAt: true;
      updatedAt: true;
    };
  };
  glucoseReadings: {
    orderBy: {
      recordedAt: "desc";
    };
    take: number;
    select: {
      id: true;
      value: true;
      unit: true;
      recordedAt: true;
      userId: true;
      recordedById: true;
      statusId: true;
      createdAt: true;
      updatedAt: true;
    };
  };
};

type AthleteResult = {
  id: string;
  name: string;
  receivedMessages: ReadonlyArray<{ id: string }>;
  statuses: ReadonlyArray<{
    id: string;
    type: PrismaStatusTypeType;
    acknowledgedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  glucoseReadings: ReadonlyArray<{
    id: string;
    value: number;
    unit: string;
    recordedAt: Date;
    userId: string;
    recordedById: string;
    statusId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);
  const url = new URL(request.url);
  const athleteId = url.searchParams.get("athleteId");
  const athleteRemoved = url.searchParams.get("athleteRemoved") === "true";

  // Get all athletes for the parent
  const athletes = await db.user.findMany({
    where: {
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  // If an athlete was just removed, redirect to refresh the page
  if (athleteRemoved) {
    return redirect("/parent");
  }

  // Get the selected athlete
  let selectedAthlete = null;
  if (athleteId) {
    const athlete = await db.user.findFirst({
      where: {
        id: athleteId,
        role: "ATHLETE",
        athleteParents: {
          some: {
            parentId: user.id,
          },
        },
      },
      select: {
        id: true,
        name: true,
        receivedMessages: {
          where: {
            read: false,
            senderId: user.id,
          },
          select: {
            id: true,
          },
        },
        statuses: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            type: true,
            acknowledgedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        glucoseReadings: {
          orderBy: {
            recordedAt: "desc",
          },
          take: 10,
          select: {
            id: true,
            value: true,
            unit: true,
            recordedAt: true,
            userId: true,
            recordedById: true,
            statusId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (athlete) {
      selectedAthlete = {
        id: athlete.id,
        name: athlete.name,
        unreadMessagesCount: athlete.receivedMessages.length,
        status: athlete.statuses[0]
          ? {
              ...athlete.statuses[0],
              type: athlete.statuses[0].type as StatusType,
              acknowledgedAt:
                athlete.statuses[0].acknowledgedAt?.toISOString() ?? null,
              createdAt: athlete.statuses[0].createdAt.toISOString(),
              updatedAt: athlete.statuses[0].updatedAt.toISOString(),
            }
          : null,
        glucose: athlete.glucoseReadings[0]
          ? {
              ...athlete.glucoseReadings[0],
              recordedAt: athlete.glucoseReadings[0].recordedAt.toISOString(),
              createdAt: athlete.glucoseReadings[0].createdAt.toISOString(),
              updatedAt: athlete.glucoseReadings[0].updatedAt.toISOString(),
            }
          : null,
        glucoseHistory: athlete.glucoseReadings.slice(1).map((reading) => ({
          ...reading,
          recordedAt: reading.recordedAt.toISOString(),
          createdAt: reading.createdAt.toISOString(),
          updatedAt: reading.updatedAt.toISOString(),
        })),
      };
    }
  } else if (athletes.length === 1) {
    // If only one athlete, select it by default
    const athlete = await db.user.findFirst({
      where: {
        id: athletes[0].id,
        role: "ATHLETE",
        athleteParents: {
          some: {
            parentId: user.id,
          },
        },
      },
      select: {
        id: true,
        name: true,
        receivedMessages: {
          where: {
            read: false,
            senderId: user.id,
          },
          select: {
            id: true,
          },
        },
        statuses: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            type: true,
            acknowledgedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        glucoseReadings: {
          orderBy: {
            recordedAt: "desc",
          },
          take: 10,
          select: {
            id: true,
            value: true,
            unit: true,
            recordedAt: true,
            userId: true,
            recordedById: true,
            statusId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (athlete) {
      selectedAthlete = {
        id: athlete.id,
        name: athlete.name,
        unreadMessagesCount: athlete.receivedMessages.length,
        status: athlete.statuses[0]
          ? {
              ...athlete.statuses[0],
              type: athlete.statuses[0].type as StatusType,
              acknowledgedAt:
                athlete.statuses[0].acknowledgedAt?.toISOString() ?? null,
              createdAt: athlete.statuses[0].createdAt.toISOString(),
              updatedAt: athlete.statuses[0].updatedAt.toISOString(),
            }
          : null,
        glucose: athlete.glucoseReadings[0]
          ? {
              ...athlete.glucoseReadings[0],
              recordedAt: athlete.glucoseReadings[0].recordedAt.toISOString(),
              createdAt: athlete.glucoseReadings[0].createdAt.toISOString(),
              updatedAt: athlete.glucoseReadings[0].updatedAt.toISOString(),
            }
          : null,
        glucoseHistory: athlete.glucoseReadings.slice(1).map((reading) => ({
          ...reading,
          recordedAt: reading.recordedAt.toISOString(),
          createdAt: reading.createdAt.toISOString(),
          updatedAt: reading.updatedAt.toISOString(),
        })),
      };
    }
  }

  // Get the user's Dexcom token
  const dexcomToken = await db.dexcomToken.findUnique({
    where: {
      userId: user.id,
    },
  });

  return data<LoaderData>({
    user,
    athletes,
    selectedAthlete,
    dexcomToken,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-glucose") {
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

    // Determine status based on glucose value
    const numericValue = Number(value);
    let statusType = StatusType.OK;

    if (isNaN(numericValue)) {
      return data({ error: "Invalid glucose value" }, { status: 400 });
    }

    // Basic thresholds - should be customizable per athlete in a real app
    if (numericValue < 70) {
      statusType = StatusType.LOW;
    } else if (numericValue > 180) {
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
        recordedById: user.id,
        statusId: status.id,
        source: "manual",
      },
    });

    return data({ success: true, status, glucoseReading });
  }

  if (intent === "send-message") {
    const athleteId = formData.get("athleteId");
    const content = formData.get("content");
    const isUrgent = formData.get("isUrgent") === "true";

    if (
      typeof athleteId !== "string" ||
      !content ||
      typeof content !== "string"
    ) {
      return data(
        { error: "Athlete ID and message content are required" },
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

    // Create new message
    const message = await db.message.create({
      data: {
        content,
        isUrgent,
        senderId: user.id,
        receiverId: athleteId,
      },
    });

    return data({ success: true, message });
  }

  if (intent === "send-strobe") {
    const athleteId = formData.get("athleteId");

    if (typeof athleteId !== "string") {
      return data({ error: "Athlete ID is required" }, { status: 400 });
    }

    // Create urgent strobe message
    const message = await db.message.create({
      data: {
        content: "⚠️ STROBE ALERT! PLEASE CHECK YOUR PHONE IMMEDIATELY!",
        isUrgent: true,
        senderId: user.id,
        receiverId: athleteId,
      },
    });

    return data({ success: true, message });
  }

  if (intent === "refresh-dexcom") {
    console.log("Starting Dexcom refresh...");
    // Get the user's Dexcom token
    const dexcomToken = await db.dexcomToken.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (!dexcomToken) {
      console.log("No Dexcom token found");
      return data({ error: "Dexcom token not found" }, { status: 400 });
    }

    // Check if token is expired
    if (dexcomToken.expiresAt < new Date()) {
      console.log("Dexcom token expired");
      return data({ error: "Dexcom token expired" }, { status: 400 });
    }

    // Get the athlete
    const athlete = await db.user.findFirst({
      where: {
        role: "ATHLETE",
        athleteParents: {
          some: {
            parentId: user.id,
          },
        },
      },
      include: {
        glucoseReadings: {
          orderBy: {
            recordedAt: "desc",
          },
          take: 1,
          where: {
            source: "dexcom",
          },
        },
      },
    });

    if (!athlete) {
      console.log("No athlete found");
      return data({ error: "Athlete not found" }, { status: 404 });
    }

    try {
      // Get the latest reading from Dexcom
      // Calculate time range for the last 24 hours
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      // Format dates for Dexcom API in YYYY-MM-DDThh:mm:ss format
      const formattedStartDate = startDate
        .toISOString()
        .replace(/\.\d{3}Z$/, "");
      const formattedEndDate = endDate.toISOString().replace(/\.\d{3}Z$/, "");

      console.log("Fetching Dexcom data...");
      const response = await fetch(
        `https://sandbox-api.dexcom.com/v3/users/self/egvs?startDate=${formattedStartDate}&endDate=${formattedEndDate}&minCount=1`,
        {
          headers: {
            Authorization: `Bearer ${dexcomToken.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Dexcom API error:", errorData);
        throw new Error(
          `Failed to get Dexcom readings: ${
            errorData.error_description || response.statusText
          }`
        );
      }

      const responseData = await response.json();
      console.log("Dexcom API response:", responseData);

      if (!responseData.records || responseData.records.length === 0) {
        console.log("No readings found in response");
        return data({ success: false, message: "No readings found" });
      }

      // Get the most recent reading
      const latestReading = responseData.records[0];
      console.log("Latest reading:", latestReading);

      // Check if we have a previous Dexcom reading
      if (athlete.glucoseReadings.length > 0) {
        const lastReading = athlete.glucoseReadings[0];
        const lastReadingTime = new Date(lastReading.recordedAt);
        const currentTime = new Date();
        const timeDiffMinutes =
          (currentTime.getTime() - lastReadingTime.getTime()) / (1000 * 60);

        // If the value is the same and less than 5 minutes have passed, disregard
        if (latestReading.value === lastReading.value && timeDiffMinutes < 5) {
          console.log("Same value within 5 minutes, disregarding");
          return data({
            success: false,
            message: "Dexcom has not provided a new value yet",
            noNewData: true,
          });
        }
      }

      // Determine the status based on the glucose value
      const value = latestReading.value;
      let statusType = StatusType.OK;

      if (value < 70) {
        statusType = StatusType.LOW;
      } else if (value > 180) {
        statusType = StatusType.HIGH;
      }

      // Create new status
      const status = await db.status.create({
        data: {
          type: statusType,
          userId: athlete.id,
        },
      });

      // Create new glucose reading
      const glucoseReading = await db.glucoseReading.create({
        data: {
          value,
          unit: latestReading.unit,
          userId: athlete.id,
          recordedById: user.id,
          statusId: status.id,
          source: "dexcom",
        },
      });

      console.log("Successfully created new reading:", glucoseReading);
      return data({ success: true, status, glucoseReading });
    } catch (error) {
      console.error("Error refreshing Dexcom data:", error);
      return data({ error: "Failed to refresh Dexcom data" }, { status: 500 });
    }
  }

  if (intent === "remove-athlete") {
    const athleteId = formData.get("athleteId");

    if (typeof athleteId !== "string") {
      return data({ error: "Athlete ID is required" }, { status: 400 });
    }

    // Verify the athlete belongs to this parent
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

    // Delete the parent-athlete relationship
    await db.parentAthlete.deleteMany({
      where: {
        parentId: user.id,
        athleteId: athleteId,
      },
    });

    // Delete the athlete's data
    await db.user.delete({
      where: {
        id: athleteId,
      },
    });

    return data({ success: true });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function ParentDashboard() {
  const { user, athletes, selectedAthlete, dexcomToken } =
    useLoaderData<typeof loader>();
  const context = useOutletContext<{
    selectedAthleteId: string | null;
  }>();
  const selectedAthleteId = context.selectedAthleteId ?? null;
  const fetcher = useFetcher<{
    success?: boolean;
    error?: string;
    noNewData?: boolean;
  }>();
  const [isStrobeDialogOpen, setIsStrobeDialogOpen] = useState(false);
  const [isDexcomDialogOpen, setIsDexcomDialogOpen] = useState(false);
  const [isDexcomConnected, setIsDexcomConnected] = useState(!!dexcomToken);
  const [dexcomError, setDexcomError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRemoveAthleteDialogOpen, setIsRemoveAthleteDialogOpen] =
    useState(false);
  const [athleteToRemove, setAthleteToRemove] = useState<string | null>(null);
  const [isRemovingAthlete, setIsRemovingAthlete] = useState(false);
  const navigate = useNavigate();

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

  // Function to handle Dexcom authentication success
  const handleDexcomAuthSuccess = (data: {
    accessToken: string;
    refreshToken: string;
  }) => {
    setIsDexcomConnected(true);
    setDexcomError(null);
  };

  // Function to refresh Dexcom data
  const refreshDexcomData = async () => {
    if (!dexcomToken) return;

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
    } finally {
      setIsRefreshing(false);
    }
  };

  // Reset form after successful submission
  useEffect(() => {
    if (fetcher.state === "idle") {
      if (fetcher.data?.success) {
        const form = document.querySelector(
          'form[method="post"]'
        ) as HTMLFormElement;
        if (form) {
          form.reset();
        }
        // Refresh the page to show updated data
        window.location.reload();
      } else if (fetcher.data?.noNewData) {
        // Show alert for no new data
        alert("Dexcom has not provided a new value yet");
      } else if (fetcher.data && !fetcher.data.success) {
        setDexcomError("Failed to refresh Dexcom data");
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleGlucoseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    fetcher.submit(form, { method: "post" });
  };

  const handleMessageSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    fetcher.submit(form, { method: "post" });
    form.reset();
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

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Remove Athlete Dialog */}
      <Dialog
        open={isRemoveAthleteDialogOpen}
        onOpenChange={setIsRemoveAthleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Multiple Athletes Detected</DialogTitle>
            <DialogDescription>
              You currently have multiple athletes in your account. Please
              select one to remove.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <Label htmlFor="athlete-select">Select Athlete to Remove</Label>
              <Select
                value={athleteToRemove || ""}
                onValueChange={setAthleteToRemove}
              >
                <SelectTrigger id="athlete-select">
                  <SelectValue placeholder="Select an athlete" />
                </SelectTrigger>
                <SelectContent>
                  {athletes.map((athlete) => (
                    <SelectItem key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRemoveAthleteDialogOpen(false)}
              disabled={isRemovingAthlete}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveAthlete}
              disabled={!athleteToRemove || isRemovingAthlete}
            >
              {isRemovingAthlete ? "Removing..." : "Remove Athlete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedAthlete ? (
        <div className="space-y-6">
          {/* Current Status Card */}
          <Card className="border-l-4 border-blue-500">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl">
                  {selectedAthlete.name}
                </CardTitle>
                <CardDescription>
                  Current Status and Latest Reading
                </CardDescription>
              </div>
              <div className="mt-4 sm:mt-0 flex flex-row items-center gap-2 w-full">
                {isDexcomConnected ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm w-1/3 justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Connected to Dexcom</span>
                  </div>
                ) : (
                  <Dialog
                    open={isDexcomDialogOpen}
                    onOpenChange={setIsDexcomDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDexcomDialogOpen(true)}
                        className="w-1/2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 mr-1.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Connect Dexcom
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Connect to Dexcom</DialogTitle>
                        <DialogDescription>
                          Connect to Dexcom for automatic glucose readings
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <DexcomAuth onAuthSuccess={handleDexcomAuthSuccess} />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {isDexcomConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDexcomData}
                    disabled={isRefreshing}
                    className="w-1/3"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                )}
                <Dialog
                  open={isStrobeDialogOpen}
                  onOpenChange={setIsStrobeDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!selectedAthleteId || isSubmitting}
                      className="w-1/3"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      Send SOS
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm STROBE Alert</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to send a STROBE alert to{" "}
                        {selectedAthlete?.name}? This should only be used in
                        urgent situations and will cause their phone to flash.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsStrobeDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleSendStrobe}>
                        Send Alert
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-gray-50">
                  <div className="text-4xl font-bold mb-2">
                    {selectedAthlete.glucose ? (
                      <>
                        <span className="text-5xl">
                          {selectedAthlete.glucose.value}
                        </span>
                        <span className="text-2xl ml-1">
                          {selectedAthlete.glucose.unit}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">No Reading</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedAthlete.glucose
                      ? `Last updated: ${new Date(
                          selectedAthlete.glucose.recordedAt
                        ).toLocaleTimeString()}`
                      : "No recent readings"}
                  </div>
                  {selectedAthlete.glucose &&
                    selectedAthlete.glucoseHistory.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500 flex items-center">
                        <span className="mr-1">
                          Previous: {selectedAthlete.glucoseHistory[0].value}
                        </span>
                        <span
                          className={`ml-1 ${
                            selectedAthlete.glucose.value >
                            selectedAthlete.glucoseHistory[0].value
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                        >
                          (
                          {selectedAthlete.glucose.value >
                          selectedAthlete.glucoseHistory[0].value
                            ? "+"
                            : ""}
                          {selectedAthlete.glucose.value -
                            selectedAthlete.glucoseHistory[0].value}
                          )
                        </span>
                      </div>
                    )}
                </div>
                <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-gray-50">
                  <div
                    className={`text-4xl font-bold mb-2 ${
                      selectedAthlete.status?.type === PrismaStatusType.HIGH
                        ? "text-black"
                        : selectedAthlete.status?.type === PrismaStatusType.LOW
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {selectedAthlete.status?.type || "OK"}
                  </div>
                  {selectedAthlete.status?.type === PrismaStatusType.LOW && (
                    <div
                      className={`text-sm ${
                        selectedAthlete.status.acknowledgedAt
                          ? "text-green-600"
                          : "text-red-600 font-medium"
                      }`}
                    >
                      {selectedAthlete.status.acknowledgedAt
                        ? `Acknowledged at ${new Date(
                            selectedAthlete.status.acknowledgedAt
                          ).toLocaleTimeString()}`
                        : "⚠️ Not acknowledged yet"}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-600"></div>
                  <span>Low: &lt;100</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-600"></div>
                  <span>OK: 100-249</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-black"></div>
                  <span>High: 250+</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Glucose Entry - Full Width */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Glucose Entry</CardTitle>
              <CardDescription>
                Enter a new glucose reading for {selectedAthlete.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                method="post"
                onSubmit={handleGlucoseSubmit}
                className="space-y-4"
              >
                <input type="hidden" name="intent" value="update-glucose" />
                <input
                  type="hidden"
                  name="athleteId"
                  value={selectedAthleteId ?? ""}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="value"
                      className="text-sm font-medium text-gray-700"
                    >
                      Glucose Value
                    </label>
                    <Input
                      type="number"
                      name="value"
                      id="value"
                      required
                      placeholder="Enter value"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="unit"
                      className="text-sm font-medium text-gray-700"
                    >
                      Unit
                    </label>
                    <Select name="unit" defaultValue="mg/dL">
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mg/dL">mg/dL</SelectItem>
                        <SelectItem value="mmol/L">mmol/L</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? "Submitting..." : "Submit Reading"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Glucose Chart and Readings Table - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Glucose Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Glucose History</CardTitle>
                <CardDescription>
                  Recent glucose readings for {selectedAthlete.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <GlucoseChart
                    readings={[
                      ...(selectedAthlete.glucoseHistory || []),
                      ...(selectedAthlete.glucose
                        ? [selectedAthlete.glucose]
                        : []),
                    ]
                      .sort(
                        (a, b) =>
                          new Date(a.recordedAt).getTime() -
                          new Date(b.recordedAt).getTime()
                      )
                      .map((reading) => ({
                        ...reading,
                        recordedAt: reading.recordedAt,
                        status: reading.status
                          ? {
                              type: reading.status.type as StatusType,
                              acknowledgedAt:
                                reading.status.acknowledgedAt || null,
                            }
                          : null,
                      }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Glucose Readings Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Glucose Readings</CardTitle>
                <CardDescription>
                  Detailed list of recent glucose readings for{" "}
                  {selectedAthlete.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left">Time</th>
                        <th className="py-2 text-left">Value</th>
                        <th className="py-2 text-left">Status</th>
                        <th className="py-2 text-left">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...(selectedAthlete.glucoseHistory || []),
                        ...(selectedAthlete.glucose
                          ? [selectedAthlete.glucose]
                          : []),
                      ]
                        .sort(
                          (a, b) =>
                            new Date(b.recordedAt).getTime() -
                            new Date(a.recordedAt).getTime()
                        )
                        .slice(0, 10)
                        .map((reading) => (
                          <tr key={reading.id} className="border-b">
                            <td className="py-2">
                              {new Date(reading.recordedAt).toLocaleString()}
                            </td>
                            <td className="py-2">
                              {reading.value} {reading.unit}
                            </td>
                            <td className="py-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  reading.status?.type === PrismaStatusType.HIGH
                                    ? "bg-black text-white"
                                    : reading.status?.type ===
                                      PrismaStatusType.LOW
                                    ? "bg-red-100 text-red-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {reading.status?.type || "OK"}
                              </span>
                            </td>
                            <td className="py-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  reading.source === "dexcom"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {reading.source === "dexcom"
                                  ? "From Dexcom"
                                  : "Manual Entry"}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mx-auto text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">
              No Athletes Added
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              You haven't added any athletes yet. Add an athlete to start
              monitoring their health.
            </p>
            <div className="mt-6">
              <Link to="/parent/add-child">
                <Button>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                  Add Athlete
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
