import type { GlucoseReading, Prisma, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ArrowLeft, Trash2 } from "lucide-react";
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
        <div className="mb-8 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Manage Athlete</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>No Athlete Found</CardTitle>
            <CardDescription>
              An account must have one athlete. Please add an athlete to
              continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
      <div className="mb-8 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">Manage Athlete</h1>
      </div>

      {actionData?.error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">
          {actionData.error}
        </div>
      )}

      {actionData?.success && (
        <div className="mb-4 rounded-md bg-green-50 p-4 text-green-700">
          {actionData.success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Athlete Information</CardTitle>
            <CardDescription>Manage your athlete's details</CardDescription>
          </CardHeader>
          <CardContent>
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
                  />
                </div>
                <div>
                  <Label htmlFor="password">New Password (optional)</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    minLength={8}
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
                  <Label>Name</Label>
                  <p className="text-lg">{athlete.name}</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <p className="text-lg">{athlete.email}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                  {isParent && (
                    <Button
                      variant="destructive"
                      onClick={() => setIsDeleting(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Glucose History</CardTitle>
            <CardDescription>Recent glucose readings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <GlucoseChart
                readings={athlete.recordedReadings}
                highThreshold={180}
                lowThreshold={70}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Athlete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {athlete.name}? This will remove
              your access to their data but won't delete their account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Form method="post">
            <input type="hidden" name="intent" value="remove" />
            <input type="hidden" name="athleteId" value={athlete.id} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit">Remove</AlertDialogAction>
            </AlertDialogFooter>
          </Form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
