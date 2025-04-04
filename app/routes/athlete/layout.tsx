import { data, Outlet } from "react-router";
import { requireAthleteUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAthleteUser(request);

  return data({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

export default function AthleteLayout() {
  return (
    <div className="h-screen w-full">
      <Outlet />
    </div>
  );
}
