import { logout } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  return logout(request);
}

export default function Logout() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>Logging out...</p>
    </div>
  );
}
