import { data, redirect, useActionData, useNavigate } from "react-router";
import { createUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

type ActionData = {
  errors?: {
    email?: string;
    password?: string;
    name?: string;
  };
  values?: {
    email?: string;
    name?: string;
  };
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);
  return data({ user });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");

  const errors: ActionData["errors"] = {};

  if (!email || typeof email !== "string") {
    errors.email = "Email is required";
  }

  if (!password || typeof password !== "string") {
    errors.password = "Password is required";
  }

  if (!name || typeof name !== "string") {
    errors.name = "Name is required";
  }

  if (Object.keys(errors).length > 0) {
    return data<ActionData>(
      { errors, values: { name: name as string, email: email as string } },
      { status: 400 }
    );
  }

  // Check if user already exists
  const existingUser = await db.user.findUnique({
    where: { email: (email as string).toLowerCase() },
  });

  if (existingUser) {
    return data<ActionData>(
      { errors: { email: "A user already exists with this email" } },
      { status: 400 }
    );
  }

  // Create the new parent user
  const newParent = await createUser(
    (email as string).toLowerCase(),
    password as string,
    name as string,
    "PARENT"
  );

  // Get all athletes associated with the current parent
  const athletes = await db.user.findMany({
    where: {
      role: "ATHLETE",
      parentAthletes: {
        some: {
          parentId: user.id,
        },
      },
    },
  });

  // Create parent-athlete relationships for all athletes
  await Promise.all(
    athletes.map((athlete) =>
      db.parentAthlete.create({
        data: {
          parentId: newParent.id,
          athleteId: athlete.id,
        },
      })
    )
  );

  return redirect("/parent");
}

export default function AddParentPage() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">
                Add Additional Parent
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                <p>
                  Add another parent who will have access to the same athletes
                  and dashboard.
                </p>
              </div>
              <form method="post" className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Name
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      defaultValue={actionData?.values?.name}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  {actionData?.errors?.name && (
                    <p className="mt-1 text-sm text-red-600">
                      {actionData.errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <div className="mt-1">
                    <input
                      type="email"
                      name="email"
                      id="email"
                      required
                      defaultValue={actionData?.values?.email}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  {actionData?.errors?.email && (
                    <p className="mt-1 text-sm text-red-600">
                      {actionData.errors.email}
                    </p>
                  )}
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
                      type="password"
                      name="password"
                      id="password"
                      required
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  {actionData?.errors?.password && (
                    <p className="mt-1 text-sm text-red-600">
                      {actionData.errors.password}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => navigate("/parent")}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Add Parent
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
