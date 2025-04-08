import type { StatusType } from "@prisma/client";
import { format, parseISO, subDays } from "date-fns";
import { data, useLoaderData, useSearchParams } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlucoseChart } from "~/components/glucose/glucose-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getAthlete } from "~/lib/athlete.server";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import { PrismaStatusType } from "~/types/prisma";

// Define types for the data we'll be working with
type GlucoseReading = {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  recordedById: string;
  statusId: string | null;
  createdAt: string;
  updatedAt: string;
  source: string | null;
  status: {
    id: string;
    type: PrismaStatusType;
    acknowledgedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type Athlete = {
  id: string;
  name: string;
  email: string;
};

type LoaderData = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
  };
  athlete: Athlete | null;
  glucoseReadings: GlucoseReading[];
  timeRange: string;
  preferences: {
    lowThreshold: number;
    highThreshold: number;
  };
};

export async function loader({ request }: { request: Request }) {
  const user = await requireParentUser(request);
  const url = new URL(request.url);
  const timeRange = url.searchParams.get("timeRange") || "7d";

  // Get the single athlete
  const athlete = await getAthlete();

  if (!athlete) {
    return data({
      user,
      athlete: null,
      glucoseReadings: [],
      timeRange,
      preferences: { lowThreshold: 70, highThreshold: 180 },
    });
  }

  // Get user preferences
  const preferences = (await db.userPreferences.findUnique({
    where: { userId: user.id },
    select: {
      lowThreshold: true,
      highThreshold: true,
    },
  })) || { lowThreshold: 70, highThreshold: 180 };

  // Filter readings based on time range
  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case "24h":
      startDate = subDays(now, 1);
      break;
    case "3d":
      startDate = subDays(now, 3);
      break;
    case "7d":
      startDate = subDays(now, 7);
      break;
    case "14d":
      startDate = subDays(now, 14);
      break;
    case "30d":
      startDate = subDays(now, 30);
      break;
    default:
      startDate = subDays(now, 7);
  }

  // Get glucose readings - no need to filter by userId anymore
  const readings = await db.glucoseReading.findMany({
    where: {
      recordedAt: {
        gte: startDate,
      },
    },
    orderBy: {
      recordedAt: "desc",
    },
    include: {
      status: true,
    },
  });

  // Format the readings for the frontend
  const formattedReadings = readings.map((reading) => ({
    ...reading,
    recordedAt: reading.recordedAt.toISOString(),
    createdAt: reading.createdAt.toISOString(),
    updatedAt: reading.updatedAt.toISOString(),
    status: reading.status
      ? {
          ...reading.status,
          acknowledgedAt: reading.status.acknowledgedAt?.toISOString() || null,
          createdAt: reading.status.createdAt.toISOString(),
          updatedAt: reading.status.updatedAt.toISOString(),
        }
      : null,
  }));

  return data<LoaderData>({
    user,
    athlete,
    glucoseReadings: formattedReadings,
    timeRange,
    preferences,
  });
}

export default function GlucoseHistory() {
  const { user, athlete, glucoseReadings, timeRange, preferences } =
    useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleTimeRangeChange = (range: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("timeRange", range);
    setSearchParams(params);
  };

  // Calculate statistics
  const calculateStats = (readings: GlucoseReading[]) => {
    if (readings.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        standardDeviation: 0,
        lowCount: 0,
        highCount: 0,
        okCount: 0,
        acknowledgedLows: 0,
        unacknowledgedLows: 0,
        timeInRange: 0,
        readingsBySource: { manual: 0, dexcom: 0 },
      };
    }

    const values = readings.map((r) => r.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;

    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate standard deviation
    const squareDiffs = values.map((value) => {
      const diff = value - average;
      return diff * diff;
    });
    const avgSquareDiff =
      squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    const standardDeviation = Math.sqrt(avgSquareDiff);

    // Count by status
    const lowCount = readings.filter((r) => r.status?.type === "LOW").length;
    const highCount = readings.filter((r) => r.status?.type === "HIGH").length;
    const okCount = readings.filter((r) => r.status?.type === "OK").length;

    // Count acknowledged vs unacknowledged lows
    const acknowledgedLows = readings.filter(
      (r) => r.status?.type === "LOW" && r.status?.acknowledgedAt !== null
    ).length;
    const unacknowledgedLows = lowCount - acknowledgedLows;

    // Calculate time in range (using parent preferences)
    const inRangeCount = readings.filter(
      (r) =>
        r.value >= preferences.lowThreshold &&
        r.value <= preferences.highThreshold
    ).length;
    const timeInRange = (inRangeCount / readings.length) * 100;

    // Count by source
    const readingsBySource = {
      manual: readings.filter((r) => r.source === "manual").length,
      dexcom: readings.filter((r) => r.source === "dexcom").length,
    };

    return {
      average,
      min,
      max,
      standardDeviation,
      lowCount,
      highCount,
      okCount,
      acknowledgedLows,
      unacknowledgedLows,
      timeInRange,
      readingsBySource,
    };
  };

  const stats = calculateStats(glucoseReadings);

  // Prepare data for charts
  const prepareChartData = (readings: GlucoseReading[]) => {
    // Sort readings by date
    const sortedReadings = [...readings].sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );

    // Format data for the chart
    return sortedReadings.map((reading) => {
      const date = new Date(reading.recordedAt);
      return {
        time: date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: format(date, "MMM d"),
        fullTime: date.toLocaleString(),
        value: reading.value,
        status: reading.status?.type || "OK",
        acknowledged: reading.status?.acknowledgedAt !== null,
        source: reading.source === "dexcom" ? "dexcom" : "manual",
      };
    });
  };

  const chartData = prepareChartData(glucoseReadings);

  // Prepare data for daily averages chart
  const prepareDailyAveragesData = (readings: GlucoseReading[]) => {
    // Group readings by day
    const readingsByDay: Record<string, number[]> = {};

    readings.forEach((reading) => {
      const date = format(new Date(reading.recordedAt), "yyyy-MM-dd");
      if (!readingsByDay[date]) {
        readingsByDay[date] = [];
      }
      readingsByDay[date].push(reading.value);
    });

    // Calculate average for each day
    return Object.entries(readingsByDay)
      .map(([date, values]) => {
        const sum = values.reduce((a, b) => a + b, 0);
        const average = sum / values.length;

        return {
          date: format(parseISO(date), "MMM d"),
          average,
          count: values.length,
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
  };

  const dailyAveragesData = prepareDailyAveragesData(glucoseReadings);

  // Prepare data for status distribution pie chart
  const statusDistributionData = [
    { name: "Low", value: stats.lowCount || 0, color: "#ef4444" },
    { name: "OK", value: stats.okCount || 0, color: "#22c55e" },
    { name: "High", value: stats.highCount || 0, color: "#f97316" },
  ];

  // Prepare data for source distribution pie chart
  const sourceDistributionData = [
    {
      name: "Manual",
      value: stats.readingsBySource.manual || 0,
      color: "#3b82f6",
    },
    {
      name: "Dexcom",
      value: stats.readingsBySource.dexcom || 0,
      color: "#8b5cf6",
    },
  ];

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Glucose History</h1>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {athlete && (
          <div className="w-full md:w-1/3 p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-medium text-blue-800">Athlete</h2>
            <p className="text-blue-600">{athlete.name}</p>
          </div>
        )}

        <div className="w-full md:w-1/3">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="3d">Last 3 days</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="14d">Last 14 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {athlete && glucoseReadings.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Average Glucose
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.average.toFixed(1)} mg/dL
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Time in Range
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.timeInRange.toFixed(1)}%
                </div>
                <p className="text-xs text-gray-500">
                  {preferences.lowThreshold}-{preferences.highThreshold} mg/dL
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Low Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.lowCount}</div>
                <p className="text-xs text-gray-500">
                  {stats.acknowledgedLows} acknowledged,{" "}
                  {stats.unacknowledgedLows} unacknowledged
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  High Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.highCount}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview" className="mb-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
              <TabsTrigger value="readings">Readings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Glucose Trend</CardTitle>
                  <CardDescription>Glucose readings over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <GlucoseChart
                      readings={glucoseReadings.map((reading) => ({
                        ...reading,
                        status: reading.status
                          ? {
                              type: reading.status.type as StatusType,
                              acknowledgedAt: reading.status.acknowledgedAt,
                            }
                          : null,
                      }))}
                      highThreshold={preferences.highThreshold}
                      lowThreshold={preferences.lowThreshold}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily Averages</CardTitle>
                    <CardDescription>Average glucose by day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyAveragesData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis domain={[0, 400]} />
                          <Tooltip />
                          <Bar dataKey="average" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Status Distribution</CardTitle>
                    <CardDescription>
                      Distribution of glucose statuses
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusDistributionData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} ${(percent * 100).toFixed(0)}%`
                            }
                          >
                            {statusDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="statistics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-lg font-medium mb-2">
                        Glucose Metrics
                      </h3>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">
                              Minimum
                            </TableCell>
                            <TableCell>{stats.min} mg/dL</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Maximum
                            </TableCell>
                            <TableCell>{stats.max} mg/dL</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Average
                            </TableCell>
                            <TableCell>
                              {stats.average.toFixed(1)} mg/dL
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Standard Deviation
                            </TableCell>
                            <TableCell>
                              {stats.standardDeviation.toFixed(1)} mg/dL
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Time in Range
                            </TableCell>
                            <TableCell>
                              {stats.timeInRange.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium mb-2">Event Counts</h3>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">
                              Total Readings
                            </TableCell>
                            <TableCell>{glucoseReadings.length}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Low Events
                            </TableCell>
                            <TableCell>{stats.lowCount}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              High Events
                            </TableCell>
                            <TableCell>{stats.highCount}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              OK Readings
                            </TableCell>
                            <TableCell>{stats.okCount}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Acknowledged Lows
                            </TableCell>
                            <TableCell>{stats.acknowledgedLows}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Data Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sourceDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {sourceDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="readings">
              <Card>
                <CardHeader>
                  <CardTitle>Glucose Readings</CardTitle>
                  <CardDescription>
                    Detailed list of all glucose readings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Acknowledged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {glucoseReadings.map((reading) => (
                        <TableRow key={reading.id}>
                          <TableCell>
                            {format(
                              new Date(reading.recordedAt),
                              "MMM d, h:mm a"
                            )}
                          </TableCell>
                          <TableCell>
                            {reading.value} {reading.unit}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                reading.status?.type === "HIGH"
                                  ? "bg-black text-white"
                                  : reading.status?.type === "LOW"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {reading.status?.type || "OK"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                reading.source === "dexcom"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {reading.source === "dexcom"
                                ? "Dexcom"
                                : "Manual"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {reading.status?.acknowledgedAt ? (
                              <span className="text-green-600">Yes</span>
                            ) : (
                              <span className="text-gray-500">No</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            {!athlete ? (
              <div>
                <p className="text-lg font-medium mb-2">No athlete found</p>
                <p className="text-sm text-gray-500">
                  Please contact the system administrator to set up your athlete
                  account.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium mb-2">
                  No glucose readings available
                </p>
                <p className="text-sm text-gray-500">
                  Please add some readings manually or connect Dexcom to view
                  history.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
