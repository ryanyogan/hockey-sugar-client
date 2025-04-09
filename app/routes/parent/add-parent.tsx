import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { data, Form, useActionData, useNavigation } from "react-router";
import { Link } from "react-router-dom";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { db } from "~/lib/db.server";
import type { User } from "~/lib/session.server";
import { requireParentUser } from "~/lib/session.server";

type ActionData = {
  errors?: {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
    form?: string;
  };
  values?: {
    name: string;
    email: string;
    role: User["role"];
  };
  success?: string;
};

type RouteArgs = {
  request: Request;
};

export async function loader({ request }: RouteArgs) {
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

export async function action({ request }: RouteArgs) {
  const formData = await request.formData();
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const role = formData.get("role") as User["role"] | null;

  const errors: ActionData["errors"] = {};
  const values: ActionData["values"] = {
    name: name as string,
    email: email as string,
    role: role as User["role"],
  };

  if (!name || typeof name !== "string") {
    errors.name = "Name is required";
  }

  if (!email || typeof email !== "string") {
    errors.email = "Email is required";
  } else if (!email.includes("@")) {
    errors.email = "Invalid email address";
  }

  if (!password || typeof password !== "string") {
    errors.password = "Password is required";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (!confirmPassword || typeof confirmPassword !== "string") {
    errors.confirmPassword = "Please confirm your password";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (!role) {
    errors.role = "Role is required";
  }

  if (Object.keys(errors).length > 0) {
    const errorResponse: ActionData = { errors, values };
    return data(errorResponse, { status: 400 });
  }

  try {
    const hashedPassword = await bcrypt.hash(password as string, 10);

    const userData: Prisma.UserCreateInput = {
      name: name as string,
      email: email as string,
      passwordHash: hashedPassword,
      role: role as User["role"],
    };

    const newUser = await db.user.create({
      data: userData,
    });

    const successResponse: ActionData = {
      success: "Parent/Coach account created successfully",
    };
    return data(successResponse);
  } catch (error) {
    console.error("Error creating parent/coach:", error);
    const errorResponse: ActionData = {
      errors: {
        form: "Failed to create account. Please try again.",
      },
      values,
    };
    return data(errorResponse, { status: 500 });
  }
}

export default function AddParentPage() {
  const actionData = useActionData() as ActionData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="container mx-auto py-8">
      {/* Page Header - No Card */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Add Parent/Coach</h1>
            <p className="text-gray-600">
              Create a new parent or coach account to monitor athlete health
              data
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
            <Link to="/parent">
              <Button variant="outline" className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Form card */}
      <Card className="shadow-sm">
        <CardHeader className="border-b bg-gray-50/50">
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Enter the details for the new parent or coach account
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {actionData?.errors?.form && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
                <span>{actionData.errors.form}</span>
              </div>
            </div>
          )}

          <Form method="post" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={actionData?.values?.name || ""}
                  className="mt-1"
                  placeholder="Enter full name"
                />
                {actionData?.errors?.name && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.name}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={actionData?.values?.email || ""}
                  className="mt-1"
                  placeholder="parent@example.com"
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
                  required
                  className="mt-1"
                  placeholder="Confirm the password"
                />
                {actionData?.errors?.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="role">Account Type</Label>
              <Select
                name="role"
                defaultValue={actionData?.values?.role || "PARENT"}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="COACH">Coach</SelectItem>
                </SelectContent>
              </Select>
              {actionData?.errors?.role && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.role}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating Account..." : "Create Account"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
