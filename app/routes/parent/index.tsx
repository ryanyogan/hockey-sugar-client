import { useEffect, useState } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { StatusType } from "~/components/status/status-display";
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
        status: latestStatus,
        glucose: latestGlucose,
        glucoseHistory: glucoseHistory.map((reading) => ({
          ...reading,
          recordedAt: reading.recordedAt.toISOString(),
          status: reading.status
            ? {
                type: reading.status.type as StatusType,
                acknowledgedAt:
                  reading.status.acknowledgedAt?.toISOString() ?? null,
              }
            : null,
        })),
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
  const fetcher = useFetcher();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    athletes.length > 0 ? athletes[0].id : null
  );

  // Set first athlete as selected on initial load if none is selected
  useEffect(() => {
    if (athletes.length > 0 && !selectedAthleteId) {
      setSelectedAthleteId(athletes[0].id);
    }
  }, [athletes, selectedAthleteId]);

  const selectedAthlete = athletes.find((a) => a.id === selectedAthleteId);

  const handleGlucoseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    fetcher.submit(form, { method: "post" });
  };

  const handleMessageSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    fetcher.submit(form, { method: "post" });

    // Reset the form
    form.reset();
  };

  const handleSendStrobe = () => {
    if (!selectedAthleteId) return;

    if (
      window.confirm(
        "Are you sure you want to send a STROBE alert? This should only be used in urgent situations."
      )
    ) {
      fetcher.submit(
        {
          intent: "send-strobe",
          athleteId: selectedAthleteId,
        },
        { method: "post" }
      );
    }
  };

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Parent Dashboard
            </h1>
            <div className="flex items-center space-x-4">
              <Link
                to="/parent/add-child"
                className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Add Athlete
              </Link>
              <Link
                to="/parent/add-parent"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Add Parent
              </Link>
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {athletes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              Welcome to Hockey Health Monitor
            </h2>
            <p className="text-gray-600 mb-8">
              You don't have any athletes added to your account yet. Add an
              athlete to start monitoring their glucose levels.
            </p>
            <Link
              to="/parent/add-child"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add Your First Athlete
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Left Column - Athlete List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Your Athletes
                  </h3>
                </div>

                <ul className="divide-y divide-gray-200">
                  {athletes.map((athlete) => {
                    const isSelected = athlete.id === selectedAthleteId;
                    const statusType = athlete.status?.type || StatusType.OK;

                    let statusColor = "bg-green-100 text-green-800";
                    if (statusType === StatusType.HIGH) {
                      statusColor = "bg-black text-white";
                    } else if (statusType === StatusType.LOW) {
                      statusColor = "bg-red-100 text-red-800";
                    }

                    return (
                      <li
                        key={athlete.id}
                        className={`px-4 py-4 cursor-pointer transition-colors duration-150 ${
                          isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                        onClick={() => setSelectedAthleteId(athlete.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {athlete.name}
                            </p>
                            <div className="flex items-center mt-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                              >
                                {statusType}
                              </span>
                              {athlete.glucose && (
                                <span className="ml-2 text-xs text-gray-500">
                                  {athlete.glucose.value} {athlete.glucose.unit}
                                </span>
                              )}
                            </div>
                          </div>
                          {athlete.unreadMessagesCount > 0 && (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                              {athlete.unreadMessagesCount}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="px-4 py-4 border-t border-gray-200">
                  <Link
                    to="/parent/add-child"
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    Add Athlete
                  </Link>
                </div>
              </div>

              {/* Quick Links */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden mt-6">
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Quick Links
                  </h3>
                </div>
                <div className="px-4 py-4">
                  <ul className="space-y-2">
                    <li>
                      <Link
                        to="/parent/messages"
                        className="text-blue-600 hover:text-blue-500 flex items-center"
                      >
                        <svg
                          className="h-4 w-4 mr-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                          />
                        </svg>
                        Messages
                      </Link>
                    </li>
                    {selectedAthlete && (
                      <li>
                        <Link
                          to={`/parent/history/${selectedAthlete.id}`}
                          className="text-blue-600 hover:text-blue-500 flex items-center"
                        >
                          <svg
                            className="h-4 w-4 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
                            />
                          </svg>
                          View {selectedAthlete.name}'s History
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Column - Selected Athlete Details */}
            {selectedAthlete && (
              <div className="lg:col-span-3 space-y-6">
                {/* Status Card */}
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {selectedAthlete.name}'s Status
                      </h3>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          selectedAthlete.status?.type === StatusType.HIGH
                            ? "bg-black text-white"
                            : selectedAthlete.status?.type === StatusType.LOW
                            ? "bg-red-600 text-white"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {selectedAthlete.status?.type || "OK"}
                      </span>
                    </div>

                    {selectedAthlete.glucose && (
                      <p className="mt-2 text-gray-700">
                        Last reading:{" "}
                        <span className="font-medium">
                          {selectedAthlete.glucose.value}{" "}
                          {selectedAthlete.glucose.unit}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          {new Date(
                            selectedAthlete.glucose.recordedAt
                          ).toLocaleString()}
                        </span>
                      </p>
                    )}

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

                  {/* Update Glucose Form */}
                  <div className="px-6 py-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Update Blood Glucose
                    </h4>
                    <form onSubmit={handleGlucoseSubmit} className="space-y-4">
                      <input
                        type="hidden"
                        name="intent"
                        value="update-glucose"
                      />
                      <input
                        type="hidden"
                        name="athleteId"
                        value={selectedAthlete.id}
                      />

                      <div className="flex items-center space-x-4">
                        <div className="w-32">
                          <input
                            type="number"
                            name="value"
                            id="value"
                            required
                            step="0.1"
                            min="0"
                            placeholder="Glucose value"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>

                        <div className="w-32">
                          <select
                            id="unit"
                            name="unit"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="mg/dL">mg/dL</option>
                            <option value="mmol/L">mmol/L</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className={`${
                            isSubmitting
                              ? "bg-blue-400"
                              : "bg-blue-600 hover:bg-blue-700"
                          } inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                        >
                          {isSubmitting ? "Updating..." : "Update"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Glucose Chart */}
                {selectedAthlete.glucoseHistory &&
                  selectedAthlete.glucoseHistory.length > 0 && (
                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                      <div className="px-6 py-5 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">
                          Recent Glucose Trend
                        </h3>
                      </div>
                      <div className="px-6 py-5">
                        <GlucoseChart
                          readings={selectedAthlete.glucoseHistory}
                        />
                        <div className="mt-2 text-right">
                          <Link
                            to={`/parent/history/${selectedAthlete.id}`}
                            className="text-sm text-blue-600 hover:text-blue-500"
                          >
                            View full history →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Message and Alert Controls */}
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                      Send Message
                    </h3>
                  </div>
                  <div className="px-6 py-5">
                    <form onSubmit={handleMessageSubmit} className="space-y-4">
                      <input type="hidden" name="intent" value="send-message" />
                      <input
                        type="hidden"
                        name="athleteId"
                        value={selectedAthlete.id}
                      />

                      <div>
                        <textarea
                          id="content"
                          name="content"
                          rows={3}
                          required
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="Enter your message here..."
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <input
                            id="isUrgent"
                            name="isUrgent"
                            type="checkbox"
                            value="true"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <label
                            htmlFor="isUrgent"
                            className="ml-2 block text-sm text-gray-900"
                          >
                            Mark as urgent
                          </label>
                        </div>

                        <div className="flex space-x-3">
                          <Link
                            to="/parent/messages"
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            View All Messages
                          </Link>

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`${
                              isSubmitting
                                ? "bg-blue-400"
                                : "bg-blue-600 hover:bg-blue-700"
                            } inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                          >
                            {isSubmitting ? "Sending..." : "Send Message"}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Emergency Options */}
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                      Emergency Options
                    </h3>
                  </div>
                  <div className="px-6 py-5">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-6 w-6 text-red-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                          />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm text-gray-700">
                          Use the strobe alert only in emergency situations when
                          immediate attention is required. This will cause the
                          athlete's phone to flash between white and red to get
                          their attention.
                        </p>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={handleSendStrobe}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <svg
                              className="h-4 w-4 mr-1.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                              />
                            </svg>
                            Send Strobe Alert
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
