import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

type ActionData = {
  errors?: {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    form?: string;
  };
  values?: {
    name?: string;
    email?: string;
  };
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);

  // Check if the user already has an athlete
  const existingAthlete = await db.user.findFirst({
    where: {
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
  });

  if (existingAthlete) {
    return redirect("/parent");
  }

  return data({ user });
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const user = await requireParentUser(request);
    console.log("Adding child for parent:", user.id, user.name);

    const formData = await request.formData();

    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    const errors: ActionData["errors"] = {};

    if (!name || typeof name !== "string") {
      errors.name = "Name is required";
    }

    if (!email || typeof email !== "string") {
      errors.email = "Email is required";
    } else if (!email.includes("@")) {
      errors.email = "Email is invalid";
    }

    if (!password || typeof password !== "string") {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      return data<ActionData>(
        {
          errors,
          values: {
            name: typeof name === "string" ? name : undefined,
            email: typeof email === "string" ? email : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Check if email is already in use
    const existingUser = await db.user.findUnique({
      where: { email: (email as string).toLowerCase() },
    });

    if (existingUser) {
      return data<ActionData>(
        {
          errors: { email: "This email is already in use" },
          values: {
            name: typeof name === "string" ? name : undefined,
            email: typeof email === "string" ? email : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Create the athlete user
    const athlete = await createUser({
      name: name as string,
      email: (email as string).toLowerCase(),
      password: password as string,
      role: "ATHLETE",
      isAthlete: true,
    });

    // Create the parent-athlete relationship
    await db.athleteParent.create({
      data: {
        parentId: user.id,
        athleteId: athlete.id,
      },
    });

    return redirect("/parent");
  } catch (error) {
    console.error("Error adding child:", error);
    const formData = await request.formData();
    return data<ActionData>(
      {
        errors: {
          form: "An error occurred while adding the athlete. Please try again.",
        },
        values: {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
        },
      },
      { status: 500 }
    );
  }
}

export default function AddChildPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Add Athlete</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create a new athlete account to monitor their health data
            </p>
          </div>
          <Link to="/parent">
            <Button variant="outline">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-lg shadow p-6">
        {actionData?.errors?.form && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
            <div className="flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{actionData.errors.form}</span>
            </div>
          </div>
        )}

        <Form method="post" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">Athlete's Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={actionData?.values?.name || ""}
                className="mt-1"
                placeholder="Enter athlete's name"
              />
              {actionData?.errors?.name && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Athlete's Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={actionData?.values?.email || ""}
                className="mt-1"
                placeholder="athlete@example.com"
              />
              {actionData?.errors?.email && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="mt-1"
                placeholder="Create a password"
              />
              {actionData?.errors?.password && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.password}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="mt-1"
                placeholder="Confirm password"
              />
              {actionData?.errors?.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.confirmPassword}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Adding Athlete...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                  Add Athlete
                </>
              )}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
