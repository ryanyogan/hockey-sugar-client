import type { GlucoseReading, Prisma, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AlertCircle, ArrowLeft, CheckCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
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
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";

type ReadingWithStringDates = Omit<
  GlucoseReading,
  "recordedAt" | "createdAt" | "updatedAt"
> & {
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
};

type AthleteWithReadings = User & {
  recordedReadings: ReadingWithStringDates[];
};

type LoaderData = {
  user: User;
  athlete: AthleteWithReadings | null;
  isParent: boolean;
};

type ActionData = {
  error?: string;
  success?: string;
};

export async function loader({ request }: { request: Request }) {
  const user = await requireParentUser(request);
  const isParent = user.role === "PARENT";

  // Get the athlete associated with the current user
  const athleteRelation = await db.athleteParent.findFirst({
    where: {
      parentId: user.id,
    },
    select: {
      athlete: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  let athlete = null;

  if (athleteRelation) {
    // Get the athlete details with their readings
    athlete = (await db.user.findUnique({
      where: {
        id: athleteRelation.athlete.id,
      },
      include: {
        recordedReadings: {
          orderBy: {
            recordedAt: "desc",
          },
          take: 100,
        },
      },
    })) as (User & { recordedReadings: GlucoseReading[] }) | null;

    if (athlete) {
      // Convert Date objects to strings for the frontend
      athlete = {
        ...athlete,
        recordedReadings: athlete.recordedReadings.map(
          (reading: GlucoseReading) => ({
            ...reading,
            recordedAt: reading.recordedAt.toISOString(),
            createdAt: reading.createdAt.toISOString(),
            updatedAt: reading.updatedAt.toISOString(),
          })
        ),
      };
    }
  }

  return data({
    user,
    athlete,
    isParent,
  });
}

export async function action({ request }: { request: Request }) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const athleteId = formData.get("athleteId");

  if (!athleteId || typeof athleteId !== "string") {
    return data({ error: "Athlete ID is required" }, { status: 400 });
  }

  // Verify the athlete belongs to this parent
  const athleteRelation = await db.athleteParent.findFirst({
    where: {
      athleteId,
      parentId: user.id,
    },
  });

  if (!athleteRelation) {
    return data({ error: "Athlete not found" }, { status: 404 });
  }

  if (intent === "update") {
    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");

    if (!name || typeof name !== "string") {
      return data({ error: "Name is required" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return data({ error: "Email is required" }, { status: 400 });
    }

    const updateData: Prisma.UserUpdateInput = {
      name,
      email: email.toLowerCase(),
    };

    if (password && typeof password === "string" && password.length > 0) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    await db.user.update({
      where: { id: athleteId },
      data: updateData,
    });

    return data({ success: "Athlete updated successfully" });
  }

  if (intent === "remove") {
    // Only parents can remove athletes
    if (user.role !== "PARENT") {
      return data(
        { error: "Only parents can remove athletes" },
        { status: 403 }
      );
    }

    // Delete the parent-athlete relationship
    await db.athleteParent.deleteMany({
      where: {
        athleteId,
        parentId: user.id,
      },
    });

    return data({ success: "Athlete removed successfully" });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

export default function ManageAthletesPage() {
  const { user, athlete, isParent } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // If no athlete is found, redirect to add athlete page
  if (!athlete) {
    return (
      <div className="container mx-auto py-8">
        {/* Page Header - No Card */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Manage Athlete</h1>
              <p className="text-gray-600">Add an athlete to your account</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
            </div>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="border-b bg-gray-50/50">
            <CardTitle>No Athlete Found</CardTitle>
            <CardDescription>
              An account must have one athlete. Please add an athlete to
              continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Button asChild className="mt-4">
              <Link to="/parent/add-athlete">Add Athlete</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Page Header - No Card */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Manage Athlete</h1>
            <p className="text-gray-600">Update your athlete's information</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          </div>
        </div>
      </div>

      {actionData?.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
            <span>{actionData.error}</span>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-gray-50/50">
            <CardTitle>Athlete Information</CardTitle>
            <CardDescription>Manage your athlete's details</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {isEditing ? (
              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="athleteId" value={athlete.id} />
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={athlete.name}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={athlete.email}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="password">New Password (optional)</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    minLength={8}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </Form>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-gray-500">Name</Label>
                  <p className="text-lg font-medium">{athlete.name}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">Email</Label>
                  <p className="text-lg font-medium">{athlete.email}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit Information
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setIsDeleting(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete Athlete
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b bg-gray-50/50">
            <CardTitle>Glucose History</CardTitle>
            <CardDescription>Recent glucose readings</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {athlete.recordedReadings.length > 0 ? (
              <div className="h-[300px]">
                <GlucoseChart readings={athlete.recordedReadings} />
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p className="text-lg font-medium">No glucose readings yet</p>
                <p className="text-sm mt-1">
                  Readings will appear here once recorded
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the athlete account for{" "}
              <span className="font-medium">{athlete.name}</span>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="athleteId" value={athlete.id} />
              <AlertDialogAction asChild>
                <Button type="submit" variant="destructive">
                  Delete Athlete
                </Button>
              </AlertDialogAction>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
