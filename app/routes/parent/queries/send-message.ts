import { type User } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";

export async function sendMessage({
  user,
  formData,
}: {
  formData: FormData;
  user: Partial<User>;
}) {
  const athleteId = formData.get("athleteId") as string;
  const content = formData.get("content") as string;
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

  if (!user || !user.id) {
    return data({ error: "User not found" }, { status: 404 });
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
