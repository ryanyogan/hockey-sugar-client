import { AlertCircle, ArrowLeft, Send, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  data,
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  const parent = await requireParentUser(request);

  // Get athletes associated with this parent using the new schema
  const athletes = await db.user.findMany({
    where: {
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: parent.id,
        },
      },
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

    // Validate the athlete belongs to this parent using the new schema
    const athlete = await db.user.findFirst({
      where: {
        id: athleteId,
        athleteParents: {
          some: {
            parentId: parent.id,
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
  const navigate = useNavigate();
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
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            <p className="mt-1 text-sm text-gray-500">
              Communicate with your athletes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/parent")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Dashboard
            </Button>
            <Link to="/parent/add-child">
              <Button>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add Athlete
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Athletes sidebar */}
        <Card>
          <CardHeader>
            <CardTitle>Athletes</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {athletes.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No athletes found.
                </div>
              ) : (
                <div className="space-y-1">
                  {athletes.map((athlete) => (
                    <div
                      key={athlete.id}
                      onClick={() => setSelectedAthleteId(athlete.id)}
                      className={`p-3 rounded-md cursor-pointer transition-colors ${
                        selectedAthleteId === athlete.id
                          ? "bg-blue-50 hover:bg-blue-100"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{athlete.name}</span>
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Messages area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            {selectedAthleteId && (
              <p className="text-sm text-gray-500">
                Conversation with{" "}
                {athletes.find((a) => a.id === selectedAthleteId)?.name}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {filteredMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No messages yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMessages.map((message) => (
                    <div key={message.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <span className="text-xs text-gray-500">
                          To: {message.receiver.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="mt-2">
                        {message.isUrgent && (
                          <Badge variant="destructive" className="mb-2">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Urgent
                          </Badge>
                        )}
                        <p className="text-sm text-gray-700">
                          {message.content}
                        </p>
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        {message.read ? "Read" : "Unread"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
          {selectedAthleteId && (
            <CardFooter className="border-t">
              <fetcher.Form
                method="post"
                onSubmit={handleSubmit}
                className="w-full space-y-4"
              >
                <input type="hidden" name="intent" value="send-message" />
                <input
                  type="hidden"
                  name="athleteId"
                  value={selectedAthleteId}
                />

                <div className="space-y-2">
                  <Label htmlFor="content" className="sr-only">
                    Message
                  </Label>
                  <Textarea
                    id="content"
                    name="content"
                    rows={3}
                    required
                    placeholder="Type your message here..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="isUrgent" name="isUrgent" value="true" />
                    <Label htmlFor="isUrgent">Mark as urgent</Label>
                  </div>

                  <Button type="submit" disabled={fetcher.state !== "idle"}>
                    <Send className="h-4 w-4 mr-1.5" />
                    {fetcher.state !== "idle" ? "Sending..." : "Send Message"}
                  </Button>
                </div>
              </fetcher.Form>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
