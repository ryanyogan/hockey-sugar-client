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
    const { statusId } = await request.json();
    const userId = user.id;

    // Verify the status belongs to this user
    const status = await db.status.findFirst({
      where: {
        id: statusId,
        userId,
      },
    });

    if (!status) {
      return data({ message: "Status not found" }, { status: 404 });
    }

    // Update the status
    await db.status.update({
      where: { id: statusId },
      data: { acknowledgedAt: new Date() },
    });

    return data({ success: true });
  } catch (error) {
    console.error("Status acknowledge error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
