import type { User } from "@prisma/client";
import { createCookieSessionStorage, redirect } from "react-router";
import { getUserById } from "./auth.server";

// Create session storage
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__hockey_health_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "s3cr3t"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function createUserSession(userId: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export async function getUserFromSession(
  request: Request
): Promise<User | null> {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  const userId = session.get("userId");
  if (!userId) return null;

  const user = await getUserById(userId);
  return user;
}

export async function requireUser(
  request: Request,
  redirectTo: string = "/login"
) {
  const user = await getUserFromSession(request);

  if (!user) {
    const searchParams = new URLSearchParams([["redirectTo", request.url]]);
    throw redirect(`${redirectTo}?${searchParams}`);
  }

  return user;
}

export async function requireParentUser(request: Request) {
  const user = await requireUser(request);

  if (user.role !== "PARENT" && user.role !== "ADMIN") {
    throw redirect("/dashboard");
  }

  return user;
}

export async function requireAthleteUser(request: Request) {
  const user = await requireUser(request);

  if (user.role !== "ATHLETE") {
    throw redirect("/dashboard");
  }

  return user;
}

export async function logout(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
