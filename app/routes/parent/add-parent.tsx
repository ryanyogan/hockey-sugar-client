import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import { createUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

type ActionData = {
  errors?: {
    email?: string;
    password?: string;
    name?: string;
    form?: string;
  };
  success?: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);

  // Only admin can add new parents
  if (!user.isAdmin) {
    return data(
      { errors: { form: "Only administrators can add new parents" } },
      { status: 403 }
    );
  }

  return data({ user });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireParentUser(request);

  // Only admin can add new parents
  if (!user.isAdmin) {
    return data(
      { errors: { form: "Only administrators can add new parents" } },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");
  const role = formData.get("role");

  if (
    !email ||
    typeof email !== "string" ||
    !password ||
    typeof password !== "string" ||
    !name ||
    typeof name !== "string" ||
    !role ||
    typeof role !== "string"
  ) {
    return data<ActionData>(
      {
        errors: {
          email: !email ? "Email is required" : undefined,
          password: !password ? "Password is required" : undefined,
          name: !name ? "Name is required" : undefined,
          form: "All fields are required",
        },
      },
      { status: 400 }
    );
  }

  // Check if user already exists
  const existingUser = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    return data<ActionData>(
      { errors: { email: "A user with this email already exists" } },
      { status: 400 }
    );
  }

  // Create new parent user
  const newParent = await createUser({
    email: email.toLowerCase(),
    password,
    name,
    role: role as "PARENT" | "COACH",
    isAdmin: false, // New parents are never admins
  });

  // Get all athletes associated with the admin
  const athletes = await db.user.findMany({
    where: {
      role: "ATHLETE",
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    select: {
      id: true,
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

  return data<ActionData>({ success: "Parent added successfully" });
}

export default function AddParentPage() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Add New Parent/Coach
          </h1>
          <div>
            <Link
              to="/parent/manage-parents"
              className="text-white hover:text-blue-100"
            >
              Back to Parents
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="p-6">
            {actionData?.errors?.form && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                {actionData.errors.form}
              </div>
            )}
            {actionData?.success && (
              <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
                {actionData.success}
              </div>
            )}

            <Form method="post" className="space-y-6">
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
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                  Email
                </label>
                <div className="mt-1">
                  <input
                    type="email"
                    name="email"
                    id="email"
                    required
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                    type="password"
                    name="password"
                    id="password"
                    required
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700"
                >
                  Role
                </label>
                <div className="mt-1">
                  <select
                    id="role"
                    name="role"
                    required
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="PARENT">Parent</option>
                    <option value="COACH">Coach</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Add Parent/Coach
                </button>
              </div>
            </Form>
          </div>
        </div>
      </main>
    </div>
  );
}
