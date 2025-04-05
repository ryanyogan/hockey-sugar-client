import {
  createCookieSessionStorage,
  redirect,
  type Session,
} from "react-router";
import { db } from "./db.server";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "PARENT" | "COACH" | "ATHLETE" | "ADMIN";
  isAdmin: boolean;
};

// Create session storage
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "s3cr3t"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(request: Request): Promise<Session> {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function createUserSession(userId: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") return null;
  return userId;
}

export async function requireUserId(
  request: Request,
  redirectTo: string = new URL(request.url).pathname
): Promise<string> {
  const session = await getSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }
  return userId;
}

export async function getUserFromSession(
  request: Request
): Promise<User | null> {
  const userId = await getUserId(request);
  if (typeof userId !== "string") {
    return null;
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAdmin: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Error fetching user from session:", error);
    throw logout(request);
  }
}

export async function getUser(request: Request): Promise<User | null> {
  return getUserFromSession(request);
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

export async function requireParentUser(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== "PARENT" && user.role !== "COACH") {
    throw redirect("/");
  }
  return user;
}

export async function requireAthleteUser(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== "ATHLETE") {
    throw redirect("/");
  }
  return user;
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
