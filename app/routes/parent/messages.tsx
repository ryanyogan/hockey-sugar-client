import { useEffect, useState } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "./+types/messages";

export async function loader({ request }: Route.LoaderArgs) {
  const parent = await requireParentUser(request);

  // Get athletes associated with this parent
  const athletes = await db.user.findMany({
    where: {
      parentId: parent.id,
      role: "ATHLETE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  // Get all messages sent by this parent
  const sentMessages = await db.message.findMany({
    where: { senderId: parent.id },
    orderBy: { createdAt: "desc" },
    include: {
      receiver: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return data({
    parent: {
      id: parent.id,
      name: parent.name,
    },
    athletes,
    sentMessages,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const parent = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

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
        parentId: parent.id,
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
        senderId: parent.id,
        receiverId: athleteId,
      },
    });

    return data({ success: true, message });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function ParentMessagesPage() {
  const { parent, athletes, sentMessages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    athletes.length > 0 ? athletes[0].id : null
  );

  // Set first athlete as selected on load if none selected
  useEffect(() => {
    if (athletes.length > 0 && !selectedAthleteId) {
      setSelectedAthleteId(athletes[0].id);
    }
  }, [athletes, selectedAthleteId]);

  const filterMessagesByAthlete = (athleteId: string | null) => {
    if (!athleteId) return [];

    return sentMessages.filter((msg) => msg.receiver.id === athleteId);
  };

  const filteredMessages = selectedAthleteId
    ? filterMessagesByAthlete(selectedAthleteId)
    : sentMessages;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    fetcher.submit(form, { method: "post" });
    form.reset();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg font-medium leading-6 text-gray-900">
                Athletes
              </h3>
            </div>

            <ul className="divide-y divide-gray-200">
              {athletes.length === 0 ? (
                <li className="px-4 py-4 text-center text-gray-500">
                  No athletes found.
                </li>
              ) : (
                athletes.map((athlete) => (
                  <li
                    key={athlete.id}
                    onClick={() => setSelectedAthleteId(athlete.id)}
                    className={`px-4 py-4 cursor-pointer hover:bg-gray-50 ${
                      selectedAthleteId === athlete.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {athlete.name}
                      </p>
                      <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="px-4 py-4 sm:px-6 border-t border-gray-200">
              <Link
                to="/parent/add-child"
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Add Athlete
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg font-medium leading-6 text-gray-900">
                Messages
              </h3>
              {selectedAthleteId && (
                <p className="mt-1 text-sm text-gray-500">
                  Conversation with{" "}
                  {athletes.find((a) => a.id === selectedAthleteId)?.name}
                </p>
              )}
            </div>

            <div
              className="px-4 py-5 sm:px-6 flex-1 overflow-y-auto"
              style={{ maxHeight: "400px" }}
            >
              {filteredMessages.length === 0 ? (
                <p className="text-center text-gray-500">No messages yet.</p>
              ) : (
                <ul className="space-y-4">
                  {filteredMessages.map((message) => (
                    <li key={message.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <p className="text-xs text-gray-500">
                          To: {message.receiver.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleString()}
                        </p>
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

                      <div className="mt-2 text-xs text-gray-500">
                        {message.read ? "Read" : "Unread"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedAthleteId && (
              <div className="px-4 py-4 sm:px-6 border-t border-gray-200">
                <fetcher.Form
                  method="post"
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="send-message" />
                  <input
                    type="hidden"
                    name="athleteId"
                    value={selectedAthleteId}
                  />

                  <div>
                    <label htmlFor="content" className="sr-only">
                      Message
                    </label>
                    <textarea
                      id="content"
                      name="content"
                      rows={3}
                      required
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="Type your message here..."
                    ></textarea>
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

                    <button
                      type="submit"
                      disabled={fetcher.state !== "idle"}
                      className={`${
                        fetcher.state !== "idle"
                          ? "bg-blue-400"
                          : "bg-blue-600 hover:bg-blue-700"
                      } inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                    >
                      {fetcher.state !== "idle" ? "Sending..." : "Send Message"}
                    </button>
                  </div>
                </fetcher.Form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
