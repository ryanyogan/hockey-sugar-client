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
    <div className="container mx-auto py-8">
      {/* Page Header - No Card */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              <span className="mr-2">Messages</span>
              {athlete?.name && (
                <span className="text-gray-600 text-lg">to {athlete.name}</span>
              )}
            </h1>
            <p className="text-gray-600">Communicate with your athlete</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
            <Button
              variant="outline"
              onClick={() => navigate("/parent")}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      {athlete ? (
        <div className="space-y-6">
          {/* Messages Card */}
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gray-50/50">
              <CardTitle className="text-xl">Message History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px] p-6">
                {sentMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p className="text-lg font-medium">No messages yet</p>
                    <p className="text-sm mt-1">
                      Start a conversation with your athlete
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sentMessages.map((message) => (
                      <div
                        key={message.id}
                        className="bg-white rounded-lg p-4 border shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            {message.isUrgent && (
                              <Badge
                                variant="destructive"
                                className="flex items-center"
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Urgent
                              </Badge>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(message.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <Badge
                            variant={message.read ? "secondary" : "default"}
                          >
                            {message.read ? "Read" : "Unread"}
                          </Badge>
                        </div>

                        <p className="text-gray-700 whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
            <CardFooter className="border-t bg-gray-50/50 p-6">
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
                    className="resize-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="isUrgent" name="isUrgent" value="true" />
                    <Label htmlFor="isUrgent" className="text-sm">
                      Mark as urgent
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    className="flex items-center"
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    {fetcher.state !== "idle" ? "Sending..." : "Send Message"}
                  </Button>
                </div>
              </fetcher.Form>
            </CardFooter>
          </Card>
        </div>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="max-w-md mx-auto">
              <h2 className="text-xl font-bold mb-2">No Athlete Found</h2>
              <p className="text-gray-600">
                It looks like your son's account has not been set up yet.
              </p>
              <p className="text-gray-600 mt-2">
                Contact the system administrator to set up your son's account as
                an athlete.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
