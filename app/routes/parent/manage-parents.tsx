import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
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

  // Get all athletes associated with the current user
  const athletes = await db.user.findMany({
    where: {
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
    include: {
      athleteParents: {
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
      },
    },
  });

  // Extract unique parents from all athletes
  const parentMap = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      role: string;
      isAdmin: boolean;
    }
  >();

  athletes.forEach((athlete) => {
    athlete.athleteParents.forEach((relation) => {
      const parent = relation.parent;
      if (!parentMap.has(parent.id)) {
        parentMap.set(parent.id, {
          id: parent.id,
          name: parent.name,
          email: parent.email,
          role: parent.role,
          isAdmin: parent.isAdmin,
        });
      }
    });
  });

  return {
    currentUser: user,
    parents: Array.from(parentMap.values()),
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
    await db.parentAthlete.deleteMany({
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
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Manage Parents</h1>
        <button
          onClick={() => navigate("/parent")}
          className="text-blue-600 hover:text-blue-800"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <p className="text-gray-600">
            Note: Parents may also be coaches. This is only reflected in the UI
            display.
          </p>
        </div>

        {actionData?.error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {actionData.error}
          </div>
        )}

        {actionData?.success && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
            {actionData.success}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                {currentUser.isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {parents.map((parent) => (
                <tr key={parent.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {parent.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{parent.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {parent.role}
                      {parent.isAdmin && " (Admin)"}
                    </div>
                  </td>
                  {currentUser.isAdmin && parent.id !== currentUser.id && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Form method="post">
                        <input
                          type="hidden"
                          name="parentId"
                          value={parent.id}
                        />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900"
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
                          Remove
                        </button>
                      </Form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <Link
            to="/parent/add-parent"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Add New Parent
          </Link>
        </div>
      </div>
    </div>
  );
}
