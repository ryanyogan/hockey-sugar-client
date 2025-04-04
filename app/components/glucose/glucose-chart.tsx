import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusType } from "~/components/status/status-display";

interface GlucoseReading {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  status?: {
    type: StatusType;
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

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-md">
          <p className="text-sm font-medium">{data.fullTime}</p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Glucose:</span> {data.value}
          </p>
          <p className="text-sm">
            <span className="font-medium">Status:</span>{" "}
            <span
              className={
                data.status === StatusType.HIGH
                  ? "text-black font-medium"
                  : data.status === StatusType.LOW
                  ? "text-red-600 font-medium"
                  : "text-green-600"
              }
            >
              {data.status}
            </span>
          </p>
          {data.status === StatusType.LOW && (
            <p className="text-xs text-gray-500">
              {data.acknowledged ? "Acknowledged" : "Not acknowledged"}
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="time" tick={{ fontSize: 12 }} tickMargin={10} />
          <YAxis
            domain={[
              Math.floor(minValue / 10) * 10,
              Math.ceil(maxValue / 10) * 10,
            ]}
            tick={{ fontSize: 12 }}
            tickMargin={10}
            label={{
              value: "Glucose (mg/dL)",
              angle: -90,
              position: "insideLeft",
              dy: 50,
              fontSize: 12,
            }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Reference lines for thresholds */}
          <ReferenceLine
            y={highThreshold}
            stroke="#000000"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
          <ReferenceLine
            y={lowThreshold}
            stroke="#DC2626"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />

          {/* Main line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2563EB"
            strokeWidth={2}
            activeDot={{ r: 8 }}
            dot={{
              stroke: "#2563EB",
              strokeWidth: 1,
              r: 4,
              fill: "#fff",
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex justify-center items-center space-x-6 mt-2">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-black rounded-full mr-2" />
          <span className="text-xs text-gray-600">High ({highThreshold})</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-red-600 rounded-full mr-2" />
          <span className="text-xs text-gray-600">Low ({lowThreshold})</span>
        </div>
      </div>
    </div>
  );
}
