import jwt from "jsonwebtoken";
import { data } from "react-router";
import { createUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import type { Route } from "./+types/register";

export async function action({ request }: Route.ActionArgs) {
  try {
    const formData = await request.json();
    const { name, email, password } = formData;

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return data(
        { message: "User already exists with this email" },
        { status: 400 }
      );
    }

    // Create user
    const user = await createUser(
      email.toLowerCase(),
      password,
      name,
      "ATHLETE"
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Return user info and token
    return data({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
