import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
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
    <div className="container mx-auto py-8">
      {/* Page Header - No Card */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Add Athlete</h1>
            <p className="text-gray-600">
              Create a new athlete account to monitor their health data
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
          <CardTitle>Athlete Information</CardTitle>
          <CardDescription>
            Enter the details for the new athlete account
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

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Creating Account..."
                  : "Create Athlete Account"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
