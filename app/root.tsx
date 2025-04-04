import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";
import { getUserFromSession } from "~/lib/session.server";
import type { Route } from "./+types/root";

import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromSession(request);

  // Basic session data available throughout the app
  return data({
    user: user
      ? { id: user.id, name: user.name, email: user.email, role: user.role }
      : null,
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const isNavigating = Boolean(navigation.location);

  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-gray-50">
        {isNavigating && (
          <div className="fixed top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-50"></div>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);
  return (
    <html>
      <head>
        <title>Oh no!</title>
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-3xl font-bold text-red-700 mb-4">
          Application Error
        </h1>
        <p className="text-lg mb-6">We're sorry, something went wrong.</p>
        <pre className="bg-gray-100 p-4 rounded-md overflow-auto max-w-full">
          {error.message}
        </pre>
        <p className="mt-6">
          <a href="/" className="text-blue-600 hover:underline">
            Return to home page
          </a>
        </p>
        <Scripts />
      </body>
    </html>
  );
}
