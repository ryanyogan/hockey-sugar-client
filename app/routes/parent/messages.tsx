// app/routes/parent/messages.tsx
import { AlertCircle, ArrowLeft, Send } from "lucide-react";
import { data, useFetcher, useLoaderData, useNavigate } from "react-router";
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
import { getAthlete } from "~/lib/athlete.server";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";

export async function loader({ request }: any) {
  const parent = await requireParentUser(request);

  // Get the single athlete
  const athlete = await getAthlete();

  if (!athlete) {
    return data({
      parent: {
        id: parent.id,
        name: parent.name,
      },
      athlete: null,
      sentMessages: [],
    });
  }

  // Get all messages sent by this parent to the athlete
  const sentMessages = await db.message.findMany({
    where: {
      senderId: parent.id,
      receiverId: athlete.id,
    },
    orderBy: { createdAt: "desc" },
  });

  // Format the messages for the frontend
  const formattedMessages = sentMessages.map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    receiver: athlete,
  }));

  return data({
    parent: {
      id: parent.id,
      name: parent.name,
    },
    athlete,
    sentMessages: formattedMessages,
  });
}

export async function action({ request }: any) {
  const parent = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "send-message") {
    const content = formData.get("content");
    const isUrgent = formData.get("isUrgent") === "true";

    if (!content || typeof content !== "string") {
      return data({ error: "Message content is required" }, { status: 400 });
    }

    // Get the athlete
    const athlete = await getAthlete();

    if (!athlete) {
      return data({ error: "Athlete not found" }, { status: 404 });
    }

    // Create new message
    const message = await db.message.create({
      data: {
        content,
        isUrgent,
        senderId: parent.id,
        receiverId: athlete.id,
      },
    });

    return data({ success: true, message });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function ParentMessagesPage() {
  const { parent, athlete, sentMessages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

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
              Communicate with {athlete?.name || "your athlete"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/parent")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      {athlete ? (
        <div className="grid grid-cols-1 gap-6">
          {/* Messages area */}
          <Card>
            <CardHeader>
              <CardTitle>Messages to {athlete.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {sentMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    No messages yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sentMessages.map((message) => (
                      <div
                        key={message.id}
                        className="bg-gray-50 rounded-lg p-4"
                      >
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
            <CardFooter className="border-t">
              <fetcher.Form
                method="post"
                onSubmit={handleSubmit}
                className="w-full space-y-4"
              >
                <input type="hidden" name="intent" value="send-message" />

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
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-center">
              <p className="text-lg font-medium">No athlete found</p>
              <p className="text-sm text-gray-500 mt-2">
                Please contact the system administrator to set up your athlete's
                account.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
