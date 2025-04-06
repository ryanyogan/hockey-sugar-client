import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PrismaStatusType } from "~/types/prisma";

interface GlucoseReading {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  status?: {
    type: PrismaStatusType;
    acknowledgedAt: string | null;
  } | null;
}

interface GlucoseChartProps {
  readings: GlucoseReading[];
  highThreshold?: number;
  lowThreshold?: number;
  className?: string;
}

export function GlucoseChart({
  readings,
  highThreshold = 180,
  lowThreshold = 70,
  className = "",
}: GlucoseChartProps) {
  // Sort readings by date
  const sortedReadings = [...readings].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Format data for the chart
  const chartData = sortedReadings.map((reading) => {
    const date = new Date(reading.recordedAt);
    return {
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      fullTime: date.toLocaleString(),
      value: reading.value,
      status: reading.status?.type || "OK",
      acknowledged: reading.status?.acknowledgedAt !== null,
    };
  });

  // Find min and max values for y-axis
  const minValue = Math.min(
    ...chartData.map((d) => d.value),
    lowThreshold - 20
  );
  const maxValue = Math.max(
    ...chartData.map((d) => d.value),
    highThreshold + 20
  );

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      {readings.length === 0 ? (
        <>
          <svg
            className="w-12 h-12 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-lg font-medium">No glucose readings available</p>
          <p className="text-sm">
            Start tracking glucose levels to see your history
          </p>
        </>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={readings}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="recordedAt"
              tickFormatter={(value) =>
                format(new Date(value), "MMM d, h:mm a")
              }
              stroke="#6b7280"
              tick={{ fontSize: 12 }}
            />
            <YAxis domain={[0, 400]} stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {data.value} {data.unit}
                        </span>
                        {data.status && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              data.status.type === "HIGH"
                                ? "bg-orange-100 text-orange-700"
                                : data.status.type === "LOW"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {data.status.type}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
