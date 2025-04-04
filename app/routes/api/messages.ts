import { data } from "react-router";
import { db } from "~/lib/db.server";
import type { Route } from "./+types/messages";
import { authenticate } from "./constants";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await authenticate(request);
  if (!user) {
    return data({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = user.id;

    // Get messages for this user
    const messages = await db.message.findMany({
      where: { receiverId: userId },
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

    return data(messages);
  } catch (error) {
    console.error("Messages fetch error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
