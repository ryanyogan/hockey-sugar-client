import type { StatusType as PrismaStatusType } from "@prisma/client";
import { useEffect, useState } from "react";
import {
  data,
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
  useOutletContext,
} from "react-router";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { StatusType } from "~/components/status/status-display";
import { Button } from "~/components/ui/button";
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
import { Textarea } from "~/components/ui/textarea";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);
  console.log("Current parent user:", user.id, user.name, user.role);

  // Get all athletes associated with this parent
  const athletes = await db.user.findMany({
    where: {
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    include: {
      athleteParents: {
        include: {
          parent: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  console.log("Found athletes:", athletes.length);
  console.log(
    "Athletes:",
    athletes.map((a) => ({
      id: a.id,
      name: a.name,
      parents: a.athleteParents.map((ap) => ap.parent.name),
    }))
  );

  // For each athlete, get their latest status and glucose readings
  const athletesWithData = await Promise.all(
    athletes.map(async (athlete) => {
      const latestStatus = await db.status.findFirst({
        where: { userId: athlete.id },
        orderBy: { createdAt: "desc" },
      });

      const latestGlucose = await db.glucoseReading.findFirst({
        where: { userId: athlete.id },
        orderBy: { recordedAt: "desc" },
      });

      // Get recent glucose history for chart
      const glucoseHistory = await db.glucoseReading.findMany({
        where: { userId: athlete.id },
        orderBy: { recordedAt: "desc" },
        take: 10,
        include: {
          status: true,
        },
      });

      // Transform glucose history to match GlucoseChart component's expected format
      const transformedGlucoseHistory = glucoseHistory.map((reading) => ({
        id: reading.id,
        value: reading.value,
        unit: reading.unit,
        recordedAt: reading.recordedAt.toISOString(),
        status: reading.status
          ? {
              type: reading.status.type as StatusType,
              acknowledgedAt:
                reading.status.acknowledgedAt?.toISOString() ?? null,
            }
          : null,
      }));

      // Get unread messages count
      const unreadMessagesCount = await db.message.count({
        where: {
          senderId: user.id,
          receiverId: athlete.id,
          read: false,
        },
      });

      return {
        ...athlete,
        status: latestStatus
          ? {
              ...latestStatus,
              acknowledgedAt:
                latestStatus.acknowledgedAt?.toISOString() ?? null,
              createdAt: latestStatus.createdAt.toISOString(),
              updatedAt: latestStatus.updatedAt.toISOString(),
            }
          : null,
        glucose: latestGlucose
          ? {
              ...latestGlucose,
              recordedAt: latestGlucose.recordedAt.toISOString(),
              createdAt: latestGlucose.createdAt.toISOString(),
              updatedAt: latestGlucose.updatedAt.toISOString(),
            }
          : null,
        glucoseHistory: transformedGlucoseHistory,
        unreadMessagesCount,
      };
    })
  );

  // Check parent-athlete relationships directly
  const parentAthleteRelationships = await db.parentAthlete.findMany({
    where: { parentId: user.id },
    include: { athlete: true },
  });

  console.log(
    "Parent-athlete relationships:",
    parentAthleteRelationships.length
  );
  console.log(
    "Relationships:",
    parentAthleteRelationships.map((r) => ({
      parentId: r.parentId,
      athleteId: r.athleteId,
      athleteName: r.athlete.name,
    }))
  );

  return data({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    athletes: athletesWithData,
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

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function ParentDashboard() {
  const { user, athletes } = useLoaderData<typeof loader>();
  const context = useOutletContext<{
    selectedAthleteId: string | null;
  }>();
  const selectedAthleteId =
    typeof context.selectedAthleteId === "string"
      ? context.selectedAthleteId
      : null;
  const fetcher = useFetcher<{ success?: boolean }>();
  const [isStrobeDialogOpen, setIsStrobeDialogOpen] = useState(false);
  const navigate = useNavigate();

  // Define the athlete type to fix TypeScript errors
  type Athlete = {
    id: string;
    name: string;
    status?: {
      id: string;
      type: PrismaStatusType;
      acknowledgedAt: string | null;
      userId: string;
      createdAt: string;
      updatedAt: string;
    } | null;
    glucose?: {
      id: string;
      value: number;
      unit: string;
      recordedAt: string;
      userId: string;
      recordedById: string;
      statusId: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
    glucoseHistory: Array<{
      id: string;
      value: number;
      unit: string;
      recordedAt: string;
      status: {
        type: StatusType;
        acknowledgedAt: string | null;
      } | null;
    }>;
    unreadMessagesCount: number;
  };

  const selectedAthlete = athletes.find(
    (a: Athlete) => a.id === selectedAthleteId
  ) as Athlete | undefined;

  // Reset form after successful submission
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      const form = document.querySelector(
        'form[method="post"]'
      ) as HTMLFormElement;
      if (form) {
        form.reset();
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

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="space-y-6">
      {/* Page header with prominent athlete display */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedAthlete ? selectedAthlete.name : "Dashboard"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {selectedAthlete
                ? `${
                    selectedAthlete.status?.type || "No Status"
                  } • Last Reading: ${
                    selectedAthlete.glucose
                      ? `${selectedAthlete.glucose.value} ${selectedAthlete.glucose.unit}`
                      : "No readings"
                  }`
                : "Monitor and manage athlete health data"}
            </p>
          </div>
        </div>
      </div>

      {/* Rest of the dashboard content */}
      {selectedAthlete ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Glucose Reading - Moved to top and made more prominent */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-3 border-2 border-blue-100">
            <h2 className="text-xl font-medium text-gray-900 mb-4 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Add Glucose Reading for {selectedAthlete.name}
            </h2>
            <fetcher.Form
              method="post"
              onSubmit={handleGlucoseSubmit}
              className="space-y-4"
            >
              <input type="hidden" name="intent" value="update-glucose" />
              <input
                type="hidden"
                name="athleteId"
                value={selectedAthleteId || ""}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="glucose-value">Glucose Value</Label>
                  <Input
                    id="glucose-value"
                    name="value"
                    type="number"
                    required
                    className="mt-1"
                    placeholder="Enter glucose value"
                  />
                </div>

                <div>
                  <Label htmlFor="glucose-unit">Unit</Label>
                  <Select name="unit" defaultValue="mg/dL">
                    <SelectTrigger id="glucose-unit" className="mt-1">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mg/dL">mg/dL</SelectItem>
                      <SelectItem value="mmol/L">mmol/L</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Adding..." : "Add Reading"}
                  </Button>
                </div>
              </div>
            </fetcher.Form>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Current Status
            </h2>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gray-50">
              <div
                className={`text-4xl font-bold mb-2 ${
                  selectedAthlete.status?.type === StatusType.HIGH
                    ? "text-black"
                    : selectedAthlete.status?.type === StatusType.LOW
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {selectedAthlete.status?.type || "OK"}
              </div>
              {selectedAthlete.glucose && (
                <div className="text-2xl text-gray-700">
                  {selectedAthlete.glucose.value} {selectedAthlete.glucose.unit}
                </div>
              )}
              <div className="text-sm text-gray-500 mt-2">
                {selectedAthlete.glucose
                  ? `Last updated: ${new Date(
                      selectedAthlete.glucose.recordedAt
                    ).toLocaleString()}`
                  : "No recent readings"}
              </div>
              {selectedAthlete.status?.type === StatusType.LOW && (
                <div
                  className={`mt-2 text-sm ${
                    selectedAthlete.status.acknowledgedAt
                      ? "text-green-600"
                      : "text-red-600 font-medium"
                  }`}
                >
                  {selectedAthlete.status.acknowledgedAt
                    ? `Acknowledged at ${new Date(
                        selectedAthlete.status.acknowledgedAt
                      ).toLocaleTimeString()}`
                    : "⚠️ Not acknowledged yet - Follow up immediately!"}
                </div>
              )}
            </div>
          </div>

          {/* Glucose Chart */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Glucose History
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Last 10 glucose readings over time
                </p>
              </div>
              <Link to={`/parent/history/${selectedAthleteId}`}>
                <Button variant="outline" size="sm">
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  View Full History
                </Button>
              </Link>
            </div>
            <div className="h-[300px] bg-gray-50 rounded-lg p-4">
              {selectedAthlete.glucoseHistory.length > 0 ? (
                <GlucoseChart readings={selectedAthlete.glucoseHistory} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-12 w-12 mb-2 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <p className="text-sm">No glucose history available</p>
                  <p className="text-xs mt-1">Add a reading to see the chart</p>
                </div>
              )}
            </div>
          </div>

          {/* Communication and Emergency Options - Side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:col-span-3">
            {/* Send Message */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Send Message
              </h2>
              <fetcher.Form
                method="post"
                onSubmit={handleMessageSubmit}
                className="space-y-4"
              >
                <input type="hidden" name="intent" value="send-message" />
                <input
                  type="hidden"
                  name="athleteId"
                  value={selectedAthleteId || ""}
                />

                <div>
                  <Label htmlFor="message-content">Message</Label>
                  <Textarea
                    id="message-content"
                    name="content"
                    required
                    className="mt-1"
                    placeholder="Type your message here..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center">
                  <input
                    id="message-urgent"
                    name="isUrgent"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <Label
                    htmlFor="message-urgent"
                    className="ml-2 block text-sm text-gray-700"
                  >
                    Mark as urgent
                  </Label>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </fetcher.Form>
            </div>

            {/* Emergency Options */}
            <div className="bg-white rounded-lg shadow p-6 border border-red-100">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2 text-red-600"
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
                Emergency Options
              </h2>
              <p className="text-sm text-gray-700 mb-4">
                Use the strobe alert only in emergency situations when immediate
                attention is required. This will cause {selectedAthlete.name}'s
                phone to flash between white and red to get their attention.
              </p>

              <Dialog
                open={isStrobeDialogOpen}
                onOpenChange={setIsStrobeDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={!selectedAthleteId || isSubmitting}
                    className="w-full"
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
                    Send STROBE Alert
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
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 text-center">
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
        </div>
      )}
    </div>
  );
}
