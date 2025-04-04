import { db } from "~/lib/db.server";
import type { Route } from "./+types/status";
import { authenticate } from "./constants";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const latestStatus = await db.status.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const latestGlucose = await db.glucoseReading.findFirst({
      where: { userId: user.id },
      orderBy: { recordedAt: "desc" },
    });

    return Response.json({
      status: latestStatus,
      glucoseReading: latestGlucose,
    });
  } catch (error) {
    console.error("Status fetch error:", error);
    return Response.json({ message: "Server error" }, { status: 500 });
  }
}
