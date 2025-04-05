import { AlertCircle, ArrowLeft, CheckCircle, UserPlus } from "lucide-react";
import {
  data,
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  console.log("Action function called");
  const user = await requireParentUser(request);
  console.log("User authenticated:", user.id, user.name, user.isAdmin);

  // Only admin can add new parents
  if (!user.isAdmin) {
    console.log("User is not an admin");
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

  console.log("Form data received:", { email, name, role });

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

  // Check if this is the first parent user
  let isAdmin = false;
  if (role === "PARENT") {
    const existingParents = await db.user.findMany({
      where: { role: "PARENT" },
    });
    isAdmin = existingParents.length === 0; // First parent is admin
  }

  // Create new parent user
  const newParent = await createUser({
    email: email.toLowerCase(),
    password,
    name,
    role: role as "PARENT" | "COACH",
    isAdmin,
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
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Add New Parent/Coach
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Create a new parent or coach account
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/parent/manage-parents")}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Parents
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <Card>
        <CardHeader>
          <CardTitle>Parent/Coach Information</CardTitle>
        </CardHeader>
        <CardContent>
          {actionData?.errors?.form && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                <span>{actionData.errors.form}</span>
              </div>
            </div>
          )}
          {actionData?.success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                <span>{actionData.success}</span>
              </div>
            </div>
          )}

          <Form
            method="post"
            className="space-y-6"
            id="parent-form"
            onSubmit={(e) => {
              console.log("Form submitted");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input type="text" name="name" id="name" required />
              {actionData?.errors?.name && (
                <p className="text-sm text-red-600">{actionData.errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input type="email" name="email" id="email" required />
              {actionData?.errors?.email && (
                <p className="text-sm text-red-600">
                  {actionData.errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input type="password" name="password" id="password" required />
              {actionData?.errors?.password && (
                <p className="text-sm text-red-600">
                  {actionData.errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="COACH">Coach</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            type="submit"
            form="parent-form"
            onClick={() => {
              console.log("Submit button clicked");
            }}
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add Parent/Coach
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
