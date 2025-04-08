import { db } from "~/lib/db.server";
import type { Route } from "./+types/status";
import { authenticate } from "./constants";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const latestGlucose = await db.glucoseReading.findFirst({
      where: { userId: user.id },
      orderBy: { recordedAt: "desc" },
    });

    return Response.json({
      status: latestGlucose
        ? {
            type: latestGlucose.statusType,
            acknowledgedAt: latestGlucose.acknowledgedAt,
          }
        : null,
      glucoseReading: latestGlucose,
    });
  } catch (error) {
    console.error("Status fetch error:", error);
    return Response.json({ message: "Server error" }, { status: 500 });
  }
}
