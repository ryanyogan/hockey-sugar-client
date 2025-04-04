import { useState } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { db } from "~/lib/db.server";
import { requireAthleteUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAthleteUser(request);

  // Get messages for this athlete
  const messages = await db.message.findMany({
    where: { receiverId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return data({
    user: {
      id: user.id,
      name: user.name,
    },
    messages,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAthleteUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "mark-read") {
    const messageId = formData.get("messageId");

    if (typeof messageId !== "string") {
      return data({ error: "Message ID is required" }, { status: 400 });
    }

    // Verify the message belongs to this user
    const message = await db.message.findFirst({
      where: {
        id: messageId,
        receiverId: user.id,
      },
    });

    if (!message) {
      return data({ error: "Message not found" }, { status: 404 });
    }

    // Mark the message as read
    await db.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return data({ success: true });
  }

  if (intent === "mark-all-read") {
    // Mark all messages as read
    await db.message.updateMany({
      where: {
        receiverId: user.id,
        read: false,
      },
      data: { read: true },
    });

    return data({ success: true });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function AthleteMessagesPage() {
  const { user, messages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredMessages =
    filter === "unread"
      ? messages.filter((message) => !message.read)
      : messages;

  const handleMarkRead = (messageId: string) => {
    fetcher.submit({ intent: "mark-read", messageId }, { method: "post" });
  };

  const handleMarkAllRead = () => {
    if (window.confirm("Mark all messages as read?")) {
      fetcher.submit({ intent: "mark-all-read" }, { method: "post" });
    }
  };

  const unreadCount = messages.filter((message) => !message.read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Messages
          </h1>
          <div className="flex items-center space-x-4">
            <Link to="/athlete" className="text-blue-600 hover:text-blue-500">
              Back to Status
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium leading-6 text-gray-900">
                Your Messages
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {unreadCount} unread messages
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 text-sm rounded-md ${
                    filter === "all"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`px-3 py-1 text-sm rounded-md ${
                    filter === "unread"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Unread
                </button>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          <ul className="divide-y divide-gray-200">
            {filteredMessages.length === 0 && (
              <li className="px-4 py-6 text-center text-gray-500">
                No messages to display.
              </li>
            )}

            {filteredMessages.map((message) => (
              <li
                key={message.id}
                className={`px-4 py-5 sm:px-6 ${
                  !message.read ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      From: {message.sender.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {!message.read && (
                    <button
                      onClick={() => handleMarkRead(message.id)}
                      className="text-xs text-blue-600 hover:text-blue-500"
                    >
                      Mark as read
                    </button>
                  )}
                </div>

                <div
                  className={`mt-2 text-sm ${
                    message.isUrgent
                      ? "text-red-600 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  {message.isUrgent && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 mr-2">
                      Urgent
                    </span>
                  )}
                  {message.content}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
