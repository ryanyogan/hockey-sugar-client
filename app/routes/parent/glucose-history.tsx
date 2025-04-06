import { format, parseISO, subDays } from "date-fns";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
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
import { StatusDisplay } from "~/components/status/status-display";
import { Button } from "~/components/ui/button";
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
import { db } from "~/lib/db.server";
import { requireUser } from "~/lib/session.server";
import { PrismaStatusType } from "~/types/prisma";
import { StatusType } from "~/types/status";

// Define types for the data we'll be working with
type GlucoseReading = {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  userId: string;
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
  highThreshold: number;
  lowThreshold: number;
  glucoseReadings: GlucoseReading[];
};

type LoaderData = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
  };
  glucoseReadings: GlucoseReading[];
  timeRange: string;
  preferences: {
    lowThreshold: number;
    highThreshold: number;
  } | null;
};

export async function loader({ request }: { request: Request }) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const timeRange = url.searchParams.get("timeRange") || "24h";

  // Calculate the start date based on the time range
  let startDate = new Date();
  if (timeRange === "24h") {
    startDate = subDays(startDate, 1);
  } else if (timeRange === "7d") {
    startDate = subDays(startDate, 7);
  } else if (timeRange === "30d") {
    startDate = subDays(startDate, 30);
  }

  // Get the user's glucose readings
  const glucoseReadings = await db.glucoseReading.findMany({
    where: {
      userId: user.id,
      recordedAt: {
        gte: startDate,
      },
    },
    include: {
      status: true,
    },
    orderBy: {
      recordedAt: "desc",
    },
  });

  // Get user preferences for thresholds
  const preferences = await db.userPreferences.findUnique({
    where: {
      userId: user.id,
    },
    select: {
      lowThreshold: true,
      highThreshold: true,
    },
  });

  // If preferences don't exist, create default ones
  if (!preferences) {
    await db.userPreferences.create({
      data: {
        userId: user.id,
        lowThreshold: 70,
        highThreshold: 180,
      },
    });
  }

  return {
    user,
    glucoseReadings: glucoseReadings.map((reading) => ({
      ...reading,
      recordedAt: reading.recordedAt.toISOString(),
      createdAt: reading.createdAt.toISOString(),
      updatedAt: reading.updatedAt.toISOString(),
      status: reading.status
        ? {
            ...reading.status,
            acknowledgedAt:
              reading.status.acknowledgedAt?.toISOString() || null,
            createdAt: reading.status.createdAt.toISOString(),
            updatedAt: reading.status.updatedAt.toISOString(),
          }
        : null,
    })),
    timeRange,
    preferences: preferences || { lowThreshold: 70, highThreshold: 180 },
  };
}

export default function GlucoseHistory() {
  const { user, glucoseReadings, timeRange, preferences } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Calculate statistics
  const lowThreshold = preferences?.lowThreshold || 70;
  const highThreshold = preferences?.highThreshold || 180;

  const lowReadings = glucoseReadings.filter(
    (reading: GlucoseReading) => reading.status?.type === PrismaStatusType.LOW
  );
  const highReadings = glucoseReadings.filter(
    (reading: GlucoseReading) => reading.status?.type === PrismaStatusType.HIGH
  );
  const okReadings = glucoseReadings.filter(
    (reading: GlucoseReading) => reading.status?.type === PrismaStatusType.OK
  );

  const lowPercentage = Math.round(
    (lowReadings.length / glucoseReadings.length) * 100
  );
  const highPercentage = Math.round(
    (highReadings.length / glucoseReadings.length) * 100
  );
  const okPercentage = Math.round(
    (okReadings.length / glucoseReadings.length) * 100
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Glucose History</h1>
          <p className="text-gray-500">View your glucose readings over time</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={timeRange}
            onValueChange={(value) => {
              setSearchParams({ timeRange: value });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => navigate("/parent")}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>
              Percentage of readings in each status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Low", value: lowReadings.length },
                      { name: "OK", value: okReadings.length },
                      { name: "High", value: highReadings.length },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    <Cell fill="#ef4444" />
                    <Cell fill="#22c55e" />
                    <Cell fill="#000000" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Low: {lowPercentage}%</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-600"></div>
                <span>OK: {okPercentage}%</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-black"></div>
                <span>High: {highPercentage}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Glucose Chart</CardTitle>
            <CardDescription>Glucose readings over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <GlucoseChart
                readings={glucoseReadings.map((reading: GlucoseReading) => ({
                  ...reading,
                  recordedAt: reading.recordedAt,
                  status: reading.status
                    ? {
                        type: reading.status.type,
                        acknowledgedAt: reading.status.acknowledgedAt || null,
                      }
                    : null,
                }))}
                lowThreshold={lowThreshold}
                highThreshold={highThreshold}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Low: &lt;{lowThreshold}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-600"></div>
                <span>
                  OK: {lowThreshold}-{highThreshold}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-black"></div>
                <span>High: &gt;{highThreshold}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Counts</CardTitle>
            <CardDescription>Number of readings in each status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Low", count: lowReadings.length },
                    { name: "OK", count: okReadings.length },
                    { name: "High", count: highReadings.length },
                  ]}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8">
                    <Cell fill="#ef4444" />
                    <Cell fill="#22c55e" />
                    <Cell fill="#000000" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Low: {lowReadings.length}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-600"></div>
                <span>OK: {okReadings.length}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-black"></div>
                <span>High: {highReadings.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Glucose Readings</CardTitle>
          <CardDescription>
            Detailed list of your glucose readings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Readings</TabsTrigger>
              <TabsTrigger value="low">Low Readings</TabsTrigger>
              <TabsTrigger value="ok">OK Readings</TabsTrigger>
              <TabsTrigger value="high">High Readings</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
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
                  {glucoseReadings.map((reading: GlucoseReading) => (
                    <TableRow key={reading.id}>
                      <TableCell>
                        {format(parseISO(reading.recordedAt), "PPpp")}
                      </TableCell>
                      <TableCell>
                        {reading.value} {reading.unit}
                      </TableCell>
                      <TableCell>
                        <StatusDisplay
                          status={
                            (reading.status?.type ||
                              PrismaStatusType.OK) as unknown as StatusType
                          }
                          glucoseValue={reading.value}
                          unit={reading.unit}
                          isAcknowledged={!!reading.status?.acknowledgedAt}
                        />
                      </TableCell>
                      <TableCell>
                        {reading.source === "dexcom"
                          ? "Dexcom"
                          : reading.source === "manual"
                          ? "Manual"
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {reading.status?.acknowledgedAt
                          ? format(
                              parseISO(reading.status.acknowledgedAt),
                              "PPpp"
                            )
                          : "Not acknowledged"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="low">
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
                  {lowReadings.map((reading: GlucoseReading) => (
                    <TableRow key={reading.id}>
                      <TableCell>
                        {format(parseISO(reading.recordedAt), "PPpp")}
                      </TableCell>
                      <TableCell>
                        {reading.value} {reading.unit}
                      </TableCell>
                      <TableCell>
                        <StatusDisplay
                          status={
                            (reading.status?.type ||
                              PrismaStatusType.OK) as unknown as StatusType
                          }
                          glucoseValue={reading.value}
                          unit={reading.unit}
                          isAcknowledged={!!reading.status?.acknowledgedAt}
                        />
                      </TableCell>
                      <TableCell>
                        {reading.source === "dexcom"
                          ? "Dexcom"
                          : reading.source === "manual"
                          ? "Manual"
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {reading.status?.acknowledgedAt
                          ? format(
                              parseISO(reading.status.acknowledgedAt),
                              "PPpp"
                            )
                          : "Not acknowledged"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="ok">
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
                  {okReadings.map((reading: GlucoseReading) => (
                    <TableRow key={reading.id}>
                      <TableCell>
                        {format(parseISO(reading.recordedAt), "PPpp")}
                      </TableCell>
                      <TableCell>
                        {reading.value} {reading.unit}
                      </TableCell>
                      <TableCell>
                        <StatusDisplay
                          status={
                            (reading.status?.type ||
                              PrismaStatusType.OK) as unknown as StatusType
                          }
                          glucoseValue={reading.value}
                          unit={reading.unit}
                          isAcknowledged={!!reading.status?.acknowledgedAt}
                        />
                      </TableCell>
                      <TableCell>
                        {reading.source === "dexcom"
                          ? "Dexcom"
                          : reading.source === "manual"
                          ? "Manual"
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {reading.status?.acknowledgedAt
                          ? format(
                              parseISO(reading.status.acknowledgedAt),
                              "PPpp"
                            )
                          : "Not acknowledged"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="high">
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
                  {highReadings.map((reading: GlucoseReading) => (
                    <TableRow key={reading.id}>
                      <TableCell>
                        {format(parseISO(reading.recordedAt), "PPpp")}
                      </TableCell>
                      <TableCell>
                        {reading.value} {reading.unit}
                      </TableCell>
                      <TableCell>
                        <StatusDisplay
                          status={
                            (reading.status?.type ||
                              PrismaStatusType.OK) as unknown as StatusType
                          }
                          glucoseValue={reading.value}
                          unit={reading.unit}
                          isAcknowledged={!!reading.status?.acknowledgedAt}
                        />
                      </TableCell>
                      <TableCell>
                        {reading.source === "dexcom"
                          ? "Dexcom"
                          : reading.source === "manual"
                          ? "Manual"
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {reading.status?.acknowledgedAt
                          ? format(
                              parseISO(reading.status.acknowledgedAt),
                              "PPpp"
                            )
                          : "Not acknowledged"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
