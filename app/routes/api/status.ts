import { db } from "~/lib/db.server";
import type { Route } from "./+types/status";
import { authenticate } from "./constants";

export async function loader({ request }: Route.LoaderArgs) {
  const athlete = await authenticate(request);
  if (!athlete) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const latestGlucose = await db.glucoseReading.findFirst({
      orderBy: { recordedAt: "desc" },
      include: { status: true },
    });

    return Response.json({
      status: latestGlucose?.status
        ? {
            type: latestGlucose.status.type,
            acknowledgedAt: latestGlucose.status.acknowledgedAt,
          }
        : null,
      glucoseReading: latestGlucose,
    });
  } catch (error) {
    console.error("Status fetch error:", error);
    return Response.json({ message: "Server error" }, { status: 500 });
  }
}
