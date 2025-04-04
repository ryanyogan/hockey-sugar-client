import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.server";

/**
 * Verifies user credentials and returns the user if valid
 */
export async function verifyLogin(email: string, password: string) {
  const userWithPassword = await db.user.findUnique({
    where: { email },
  });

  if (!userWithPassword) {
    return null;
  }

  const isValid = await bcrypt.compare(password, userWithPassword.passwordHash);

  if (!isValid) {
    return null;
  }

  const { passwordHash, ...userWithoutPassword } = userWithPassword;
  return userWithoutPassword;
}

/**
 * Creates a new user with hashed password
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: "ADMIN" | "PARENT" | "COACH" | "ATHLETE" = "ATHLETE"
) {
  const passwordHash = await bcrypt.hash(password, 10);

  return db.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
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
