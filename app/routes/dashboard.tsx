import { redirect } from "react-router";
import { getUserFromSession } from "~/lib/session.server";
import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromSession(request);

  if (!user) {
    return redirect("/login");
  }

  if (user.role === "ATHLETE") {
    return redirect("/athlete");
  }

  return redirect("/parent");
}

export default function Dashboard() {
  return <div>Redirecting...</div>;
}
