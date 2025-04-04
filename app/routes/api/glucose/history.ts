import { data } from "react-router";
import { db } from "~/lib/db.server";
import { authenticate } from "../constants";
import type { Route } from "./+types/history";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await authenticate(request);
  if (!user) {
    return data({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = user.id;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // Get glucose history with status
    const glucoseReadings = await db.glucoseReading.findMany({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      take: limit,
      include: {
        status: true,
      },
    });

    return data(glucoseReadings);
  } catch (error) {
    console.error("Glucose history fetch error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
