import { data } from "react-router";
import { db } from "~/lib/db.server";
import { authenticate } from "../constants";
import type { Route } from "./+types/acknowledge";

export async function action({ request }: Route.ActionArgs) {
  const user = await authenticate(request);
  if (!user) {
    return data({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { readingId } = await request.json();
    const userId = user.id;

    // Verify the reading belongs to this user
    const reading = await db.glucoseReading.findFirst({
      where: {
        id: readingId,
        userId,
      },
    });

    if (!reading) {
      return data({ message: "Reading not found" }, { status: 404 });
    }

    // Update the reading
    await db.glucoseReading.update({
      where: { id: readingId },
      data: { acknowledgedAt: new Date() },
    });

    return data({ success: true });
  } catch (error) {
    console.error("Reading acknowledge error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
