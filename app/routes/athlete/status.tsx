import { useEffect, useState } from "react";
import {
  data,
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { MessageNotification } from "~/components/messaging/message-notifcation";
import { StatusDisplay, StatusType } from "~/components/status/status-display";
import { db } from "~/lib/db.server";
import { requireAthleteUser } from "~/lib/session.server";
import type { Route } from "./+types/status";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAthleteUser(request);

  // Get the latest status and glucose reading
  const latestStatus = await db.status.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const latestGlucose = await db.glucoseReading.findFirst({
    where: { userId: user.id },
    orderBy: { recordedAt: "desc" },
  });

  // Get any unread messages
  const unreadMessages = await db.message.findMany({
    where: {
      receiverId: user.id,
      read: false,
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: 5,
  });

  // Get recent glucose history for chart
  const glucoseHistory = await db.glucoseReading.findMany({
    where: { userId: user.id },
    orderBy: { recordedAt: "desc" },
    take: 10,
    include: {
      status: true,
    },
  });

  return data({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    status: latestStatus,
    glucose: latestGlucose,
    messages: unreadMessages,
    glucoseHistory,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAthleteUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "acknowledge") {
    const statusId = formData.get("statusId");

    if (typeof statusId !== "string") {
      return data({ error: "Status ID is required" }, { status: 400 });
    }

    // Update the status to acknowledged
    await db.status.update({
      where: { id: statusId },
      data: { acknowledgedAt: new Date() },
    });

    return data({ success: true });
  }

  if (intent === "read-message") {
    const messageId = formData.get("messageId");

    if (typeof messageId !== "string") {
      return data({ error: "Message ID is required" }, { status: 400 });
    }

    // Mark the message as read
    await db.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return data({ success: true });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function AthleteStatusPage() {
  const revalidator = useRevalidator();

  const {
    user,
    status,
    glucose,
    messages: rawMessages,
    glucoseHistory,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [hasStrobe, setHasStrobe] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Format messages to convert Date objects to strings
  const messages = rawMessages.map((msg) => ({
    ...msg,
    createdAt: new Date(msg.createdAt).toISOString(),
    updatedAt: new Date(msg.updatedAt).toISOString(),
  }));

  // Check for strobe effect in messages
  useEffect(() => {
    const hasStrobeMessage = messages.some(
      (msg) => msg.isUrgent && msg.content.toLowerCase().includes("strobe")
    );

    setHasStrobe(hasStrobeMessage);

    // If there's a strobe message, set up a timer to automatically disable it after 30 seconds
    if (hasStrobeMessage) {
      const timer = setTimeout(() => {
        setHasStrobe(false);
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, [messages]);

  // Polling for updates every 5 seconds with data comparison
  useEffect(() => {
    const interval = setInterval(async () => {
      revalidator.revalidate();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [fetcher, status?.id, glucose?.id, messages]);

  // Handle status acknowledge
  const handleAcknowledge = () => {
    if (status && status.type === StatusType.LOW && !status.acknowledgedAt) {
      fetcher.submit(
        { intent: "acknowledge", statusId: status.id },
        { method: "post" }
      );
    }
  };

  // Handle message read
  const handleMessageRead = (messageId: string) => {
    fetcher.submit({ intent: "read-message", messageId }, { method: "post" });
  };

  // Determine the current status
  let currentStatus = StatusType.OK;
  let isAcknowledged = false;

  if (status) {
    currentStatus = status.type as StatusType;
    isAcknowledged = !!status.acknowledgedAt;
  }

  const glucoseValue = glucose ? glucose.value : undefined;
  const unit = glucose ? glucose.unit : "mg/dL";

  // Add timestamp to displayed data if available
  const timestamp = glucose
    ? new Date(glucose.recordedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Determine text color based on status for buttons
  const buttonTextColor =
    currentStatus === StatusType.HIGH
      ? "text-white"
      : currentStatus === StatusType.LOW
      ? "text-white"
      : "text-gray-800";

  return (
    <div className="h-screen w-full relative">
      {/* Message Notification */}
      {messages.length > 0 && (
        <MessageNotification
          messages={messages}
          onMessageRead={handleMessageRead}
        />
      )}

      {/* Top Actions */}
      <div className="absolute top-4 right-4 z-10 flex space-x-2">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`px-3 py-1 rounded-full text-sm ${
            currentStatus === StatusType.HIGH
              ? "bg-gray-800 text-white"
              : currentStatus === StatusType.LOW
              ? "bg-red-800 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          {showHistory ? "Hide History" : "Show History"}
        </button>
        <Link
          to="/athlete/messages"
          className={`px-3 py-1 rounded-full text-sm ${
            currentStatus === StatusType.HIGH
              ? "bg-gray-800 text-white"
              : currentStatus === StatusType.LOW
              ? "bg-red-800 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          Messages
        </Link>
        <Link
          to="/logout"
          className={`px-3 py-1 rounded-full text-sm ${
            currentStatus === StatusType.HIGH
              ? "bg-gray-800 text-white"
              : currentStatus === StatusType.LOW
              ? "bg-red-800 text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          Logout
        </Link>
      </div>

      {/* Glucose History */}
      {showHistory && glucoseHistory.length > 0 && (
        <div className="absolute top-16 left-0 right-0 z-10 bg-white bg-opacity-90 p-4 mx-4 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-2">Recent Glucose History</h3>
          <GlucoseChart
            readings={glucoseHistory.map((reading) => ({
              ...reading,
              recordedAt: reading.recordedAt.toString(),
              status: {
                type: reading.status?.type as StatusType,
                acknowledgedAt: reading.status?.acknowledgedAt
                  ? reading.status.acknowledgedAt.toString()
                  : null,
              },
            }))}
            className="mb-2"
          />
          <button
            onClick={() => setShowHistory(false)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Close
          </button>
        </div>
      )}

      {/* Main Status Display */}
      <StatusDisplay
        status={currentStatus}
        glucoseValue={glucoseValue}
        unit={unit}
        onAcknowledge={handleAcknowledge}
        isAcknowledged={isAcknowledged}
        hasStrobe={hasStrobe}
      />

      {/* Timestamp display */}
      {timestamp && (
        <div
          className={`absolute bottom-6 left-0 right-0 text-center ${
            currentStatus === StatusType.HIGH
              ? "text-white"
              : currentStatus === StatusType.LOW
              ? "text-white"
              : "text-gray-600"
          }`}
        >
          <p className="text-sm">Last updated: {timestamp}</p>
        </div>
      )}
    </div>
  );
}
