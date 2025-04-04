import { data, Link, Outlet, useLoaderData, useNavigation } from "react-router";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);

  return data({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

export default function ParentLayout() {
  const { user } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top loading indicator */}
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-50"></div>
      )}

      {/* Header */}
      <header className="bg-blue-600 shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            <Link to="/parent">Hockey Health Monitor</Link>
          </h1>
          <div className="flex items-center space-x-4">
            <span className="text-white">{user.name}</span>
            <Link to="/logout" className="text-white hover:text-blue-100">
              Logout
            </Link>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-12 justify-start space-x-8">
            <Link
              to="/parent"
              className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Dashboard
            </Link>
            <Link
              to="/parent/add-child"
              className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Add Athlete
            </Link>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            &copy; 2023 Hockey Health Monitor. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
