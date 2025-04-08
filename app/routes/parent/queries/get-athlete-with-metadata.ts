import type { User } from "@prisma/client";
import { db } from "~/lib/db.server";

export async function getAthleteWithMetadata(
  user: Partial<User>,
  athleteId: string
) {
  return await db.user.findFirst({
    where: {
      id: athleteId,
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    select: {
      id: true,
      name: true,
      receivedMessages: {
        where: {
          read: false,
          senderId: user.id,
        },
        select: {
          id: true,
        },
      },
      glucoseReadings: {
        orderBy: {
          recordedAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          value: true,
          unit: true,
          recordedAt: true,
          userId: true,
          recordedById: true,
          statusType: true,
          acknowledgedAt: true,
          createdAt: true,
          updatedAt: true,
          source: true,
        },
      },
    },
  });
}
