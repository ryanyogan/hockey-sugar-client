import type { User } from "@prisma/client";
import { db } from "~/lib/db.server";

export async function getAthletes(user: Partial<User>) {
  return await db.user.findMany({
    where: {
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
    },
  });
}
