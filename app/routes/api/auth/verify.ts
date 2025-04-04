import jwt from "jsonwebtoken";
import { data } from "react-router";
import { getUserById } from "~/lib/auth.server";
import type { Route } from "./+types/verify";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return data(
        { message: "Authorization header required" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return data({ message: "Invalid authorization format" }, { status: 401 });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    ) as {
      id: string;
      email: string;
      role: string;
    };

    // Fetch updated user data
    const user = await getUserById(decoded.id);

    if (!user) {
      return data({ message: "User not found" }, { status: 404 });
    }

    return data({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    return data({ message: "Invalid or expired token" }, { status: 403 });
  }
}
