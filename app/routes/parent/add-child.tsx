import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
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

  return data({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
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

    // Create the athlete account
    const athlete = await createUser({
      email: (email as string).toLowerCase(),
      password: password as string,
      name: name as string,
      role: "ATHLETE",
    });

    console.log("Created athlete:", athlete.id, athlete.name);

    // Find all parents associated with the current parent
    const associatedParents = await db.parentAthlete.findMany({
      where: {
        athleteId: {
          in: await db.parentAthlete
            .findMany({
              where: { parentId: user.id },
            })
            .then((relations) => relations.map((r) => r.athleteId)),
        },
      },
      select: { parentId: true },
      distinct: ["parentId"],
    });

    console.log("Associated parents:", associatedParents.length);
    console.log(
      "Associated parent IDs:",
      associatedParents.map((p) => p.parentId)
    );

    // Filter out the current parent from associated parents to avoid duplicates
    const otherParentIds = associatedParents
      .map((p) => p.parentId)
      .filter((id) => id !== user.id);

    console.log("Other parent IDs:", otherParentIds);

    // Create parent-athlete relationships for all parents
    // First create for the current parent
    const parentAthleteRelationship = await db.parentAthlete.create({
      data: {
        parentId: user.id,
        athleteId: athlete.id,
      },
    });

    console.log(
      "Created parent-athlete relationship:",
      parentAthleteRelationship.id
    );

    // Then create for other parents if any exist
    if (otherParentIds.length > 0) {
      const otherRelationships = await Promise.all(
        otherParentIds.map((parentId) =>
          db.parentAthlete.create({
            data: {
              parentId,
              athleteId: athlete.id,
            },
          })
        )
      );

      console.log("Created other relationships:", otherRelationships.length);
    }

    // Verify the relationship was created
    const verifyRelationship = await db.parentAthlete.findFirst({
      where: {
        parentId: user.id,
        athleteId: athlete.id,
      },
    });

    console.log(
      "Verification:",
      verifyRelationship ? "Relationship exists" : "Relationship not found"
    );

    return redirect("/parent");
  } catch (error) {
    console.error("Error adding child:", error);
    return data<ActionData>(
      {
        errors: {
          form: "An error occurred while adding the athlete. Please try again.",
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Add Athlete
          </h1>
          <div>
            <Link to="/parent" className="text-white hover:text-blue-100">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          {actionData?.errors?.form && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
              {actionData.errors.form}
            </div>
          )}

          <Form method="post" className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Athlete's Name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={actionData?.values?.name || ""}
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
                {actionData?.errors?.name && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.name}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Athlete's Email Address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={actionData?.values?.email || ""}
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
                {actionData?.errors?.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.email}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
                {actionData?.errors?.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.password}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm Password
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
                {actionData?.errors?.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${
                  isSubmitting ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
                } flex w-full justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
              >
                {isSubmitting ? "Adding Athlete..." : "Add Athlete"}
              </button>
            </div>
          </Form>
        </div>
      </main>
    </div>
  );
}
