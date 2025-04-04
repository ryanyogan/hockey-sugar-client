import { data } from "react-router";
import { db } from "~/lib/db.server";
import { authenticate } from "../constants";
import type { Route } from "./+types/read";

export async function action({ request, params }: Route.ActionArgs) {
  const { messageId } = params;
  const user = await authenticate(request);
  if (!user) {
    return data({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // const { messageId } = await request.json();
    const userId = user.id;

    // Verify the message belongs to this user
    const message = await db.message.findFirst({
      where: {
        id: messageId,
        receiverId: userId,
      },
    });

    if (!message) {
      return data({ message: "Message not found" }, { status: 404 });
    }

    // Mark as read
    await db.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return data({ success: true });
  } catch (error) {
    console.error("Message read error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
