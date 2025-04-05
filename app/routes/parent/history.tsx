import { data, Link, redirect, useLoaderData } from "react-router";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { StatusType } from "~/components/status/status-display";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "../+types";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireParentUser(request);
  const { athleteId } = params;

  if (!athleteId) {
    return redirect("/parent");
  }

  // Check if this athlete belongs to the parent
  const athlete = await db.user.findFirst({
    where: {
      id: athleteId,
      athleteParents: {
        some: {
          parentId: user.id,
        },
      },
    },
  });

  if (!athlete) {
    return redirect("/parent");
  }

  // Get glucose readings with status and user info
  const glucoseReadings = await db.glucoseReading.findMany({
    where: { userId: athleteId },
    orderBy: { recordedAt: "desc" },
    include: {
      status: true,
      recordedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Get stats
  const stats = {
    total: glucoseReadings.length,
    high: glucoseReadings.filter((r) => r.status?.type === StatusType.HIGH)
      .length,
    low: glucoseReadings.filter((r) => r.status?.type === StatusType.LOW)
      .length,
    ok: glucoseReadings.filter((r) => r.status?.type === StatusType.OK).length,
    average:
      glucoseReadings.length > 0
        ? Math.round(
            glucoseReadings.reduce((acc, r) => acc + r.value, 0) /
              glucoseReadings.length
          )
        : 0,
  };

  // Group readings by date for the chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split("T")[0];
  }).reverse();

  const chartData = glucoseReadings.map((reading) => ({
    ...reading,
    recordedAt: reading.recordedAt.toISOString(),
    status: reading.status
      ? {
          type: reading.status.type as StatusType,
          acknowledgedAt: reading.status.acknowledgedAt?.toISOString() ?? null,
        }
      : null,
  }));

  return data({
    athlete,
    glucoseReadings: chartData,
    stats,
    chartData,
  });
}

export default function HistoryPage() {
  const { athlete, glucoseReadings, stats, chartData } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {athlete.name}'s Glucose History
          </h1>
          <div>
            <Link to="/parent" className="text-white hover:text-blue-100">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Total Readings
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats.total}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                High Readings
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-black">
                {stats.high}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Low Readings
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-red-600">
                {stats.low}
              </dd>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Average Reading
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats.average}
              </dd>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Glucose Trends
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Visual representation of glucose readings over time
            </p>
          </div>
          <div className="px-4 py-5 sm:p-6">
            {glucoseReadings.length > 0 ? (
              <GlucoseChart readings={glucoseReadings} />
            ) : (
              <p className="text-center text-gray-500">
                No glucose data available yet.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Detailed Glucose History
            </h3>
          </div>
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date & Time
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Reading
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Recorded By
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {glucoseReadings.map((reading) => {
                  const statusType = reading.status?.type || StatusType.OK;

                  let statusClass = "text-green-800";
                  if (statusType === StatusType.HIGH) {
                    statusClass = "text-black font-medium";
                  } else if (statusType === StatusType.LOW) {
                    statusClass = "text-red-600 font-medium";
                  }

                  return (
                    <tr key={reading.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(reading.recordedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {reading.value} {reading.unit}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm ${statusClass}`}
                      >
                        {statusType}
                        {statusType === StatusType.LOW &&
                          reading.status?.acknowledgedAt && (
                            <span className="ml-2 text-xs text-gray-500">
                              (Acknowledged)
                            </span>
                          )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {reading.recordedBy.name}
                      </td>
                    </tr>
                  );
                })}

                {glucoseReadings.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center"
                    >
                      No glucose readings recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
