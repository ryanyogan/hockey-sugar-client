import { db } from "~/lib/db.server";

export async function authenticate(request: Request) {
  return db.user.findFirst({
    where: {
      email: "pickle@jk.com",
    },
  });
}
