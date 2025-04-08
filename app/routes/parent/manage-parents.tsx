import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { User } from "~/types";

type ActionData = {
  error?: string;
  success?: string;
};

type LoaderData = {
  currentUser: User;
  parents: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isAdmin: boolean;
  }>;
};

export async function loader({ request }: { request: Request }) {
  const user = await requireParentUser(request);

  // Get the athlete associated with the current user
  const athleteRelation = await db.athleteParent.findFirst({
    where: {
      parentId: user.id,
    },
    select: {
      athleteId: true,
    },
  });

  if (!athleteRelation) {
    return {
      currentUser: user,
      parents: [],
    };
  }

  // Get all parents associated with this athlete
  const athleteParents = await db.athleteParent.findMany({
    where: {
      athleteId: athleteRelation.athleteId,
    },
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isAdmin: true,
        },
      },
    },
  });

  // Extract unique parents
  const parents = athleteParents.map((relation) => relation.parent);

  return {
    currentUser: user,
    parents,
  };
}

export async function action({ request }: { request: Request }) {
  const user = await requireParentUser(request);
  const formData = await request.formData();
  const parentId = formData.get("parentId");

  if (typeof parentId !== "string") {
    return { error: "Invalid parent ID" };
  }

  // Only admins can remove other parents
  if (!user.isAdmin) {
    return { error: "Only administrators can remove parents" };
  }

  // Prevent removing yourself
  if (parentId === user.id) {
    return { error: "You cannot remove yourself" };
  }

  try {
    // Delete all parent-athlete relationships for this parent
    await db.athleteParent.deleteMany({
      where: {
        parentId: parentId,
      },
    });

    return { success: "Parent removed successfully" };
  } catch (error) {
    console.error("Error removing parent:", error);
    return { error: "Failed to remove parent" };
  }
}

export default function ManageParentsPage() {
  const { currentUser, parents } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Parents</h1>
            <p className="mt-1 text-sm text-gray-500">
              View and manage parents associated with your athletes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/parent")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Dashboard
            </Button>
            <Link to="/parent/add-parent">
              <Button>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add New Parent
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-blue-500" />
            <span>
              Note: Parents may also be coaches. This is only reflected in the
              UI display.
            </span>
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                {currentUser.isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parents.map((parent) => (
                <TableRow key={parent.id}>
                  <TableCell className="font-medium">{parent.name}</TableCell>
                  <TableCell>{parent.email}</TableCell>
                  <TableCell>
                    {parent.role}
                    {parent.isAdmin && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </TableCell>
                  {currentUser.isAdmin && parent.id !== currentUser.id && (
                    <TableCell>
                      <Form method="post">
                        <input
                          type="hidden"
                          name="parentId"
                          value={parent.id}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          type="submit"
                          className="text-red-600 hover:text-red-900 hover:bg-red-50"
                          onClick={(e) => {
                            if (
                              !confirm(
                                "Are you sure you want to remove this parent?"
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </Form>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
