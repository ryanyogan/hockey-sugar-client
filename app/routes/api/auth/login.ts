import jwt from "jsonwebtoken";
import { data } from "react-router";
import { verifyLogin } from "~/lib/auth.server";
import type { Route } from "./+types/login";

export async function action({ request }: Route.ActionArgs) {
  try {
    const formData = await request.json();
    const { email, password } = formData;

    // Verify credentials and get user
    const user = await verifyLogin(email, password);

    if (!user) {
      return data({ message: "Invalid email or password" }, { status: 401 });
    }

    if (user.role !== "ATHLETE") {
      return data(
        { message: "Only athletes can use the mobile app" },
        { status: 403 }
      );
    }

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
    console.error("Login error:", error);
    return data({ message: "Server error" }, { status: 500 });
  }
}
