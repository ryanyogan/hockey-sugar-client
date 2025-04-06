import type { User } from "@prisma/client";
import { data } from "react-router";
import { db } from "~/lib/db.server";

export async function updatePreferences({
  user,
  formData,
}: {
  formData: FormData;
  user: Partial<User>;
}) {
  if (!user.id) {
    return data({ error: "User not found" }, { status: 404 });
  }

  const lowThreshold = formData.get("lowThreshold");
  const highThreshold = formData.get("highThreshold");

  if (
    typeof lowThreshold !== "string" ||
    typeof highThreshold !== "string" ||
    isNaN(Number(lowThreshold)) ||
    isNaN(Number(highThreshold))
  ) {
    return data({ error: "Invalid threshold values" }, { status: 400 });
  }

  const lowValue = Number(lowThreshold);
  const highValue = Number(highThreshold);

  if (lowValue >= highValue) {
    return data(
      { error: "Low threshold must be less than high threshold" },
      { status: 400 }
    );
  }

  // Update or create preferences
  await db.userPreferences.upsert({
    where: {
      userId: user.id,
    },
    update: {
      lowThreshold: lowValue,
      highThreshold: highValue,
    },
    create: {
      userId: user.id,
      lowThreshold: lowValue,
      highThreshold: highValue,
    },
  });

  return data({ success: true });
}
