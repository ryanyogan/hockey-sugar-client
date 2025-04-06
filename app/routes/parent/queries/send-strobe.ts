import { type User } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";

export async function sendStrobe({
  user,
  formData,
}: {
  formData: FormData;
  user: Partial<User>;
}) {
  const athleteId = formData.get("athleteId");

  if (typeof athleteId !== "string") {
    return data({ error: "Athlete ID is required" }, { status: 400 });
  }

  if (!user || !user.id) {
    return data({ error: "User not found" }, { status: 404 });
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
