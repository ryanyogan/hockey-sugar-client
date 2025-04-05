import type { User } from "@prisma/client";
import { redirect } from "@remix-run/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.server";

/**
 * Verifies user credentials and returns the user if valid
 */
export async function verifyLogin(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;

  return user;
}

type CreateUserParams = {
  email: string;
  password: string;
  name: string;
  role: "PARENT" | "COACH" | "ATHLETE";
  isAdmin?: boolean;
};

/**
 * Creates a new user with hashed password
 */
export async function createUser({
  email,
  password,
  name,
  role,
  isAdmin = false,
}: CreateUserParams) {
  const hashedPassword = await bcrypt.hash(password, 10);

  return db.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      name,
      role,
      isAdmin,
    },
  });
}

/**
 * Gets user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  return db.user.findUnique({
    where: { id },
  });
}

// JWT secret key - ideally should be in environment variables
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Generates a JWT token for a user
 */
export function generateJWT(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Authenticates a request using JWT from Authorization header
 * Returns the user payload if valid, null otherwise
 */
export async function authenticateJWT(request: Request) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    return decoded;
  } catch (error) {
    console.error("JWT verification error:", error);
    return null;
  }
}

/**
 * Requires a parent user to be authenticated
 * Redirects to login if not authenticated or not a parent
 */
export async function requireParentUser(request: Request): Promise<User> {
  const user = await authenticateJWT(request);

  if (!user) {
    throw redirect("/login");
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser || dbUser.role !== "PARENT") {
    throw redirect("/login");
  }

  return dbUser;
}
