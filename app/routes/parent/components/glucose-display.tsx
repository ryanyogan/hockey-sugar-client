import { GlucoseChart } from "~/components/glucose/glucose-chart";
import { StatusType } from "~/components/status/status-display";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { PrismaStatusType } from "~/types/prisma";
import type { Athlete } from "../types";

interface GlucoseDataDisplayProps {
  athlete: Athlete;
}

export function GlucoseDataDisplay({ athlete }: GlucoseDataDisplayProps) {
  // Sort readings by recorded date
  const sortedReadings = [
    ...(athlete.glucoseHistory || []),
    ...(athlete.glucose ? [athlete.glucose] : []),
  ].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Glucose Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Glucose History</CardTitle>
          <CardDescription>
            Recent glucose readings for {athlete.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <GlucoseChart
              readings={sortedReadings.map((reading) => ({
                ...reading,
                recordedAt: reading.recordedAt,
                status: reading.status
                  ? {
                      type: reading.status.type as StatusType,
                      acknowledgedAt: reading.status.acknowledgedAt || null,
                    }
                  : null,
              }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Glucose Readings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Glucose Readings</CardTitle>
          <CardDescription>
            Detailed list of recent glucose readings for {athlete.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Time</th>
                  <th className="py-2 text-left">Value</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(athlete.glucoseHistory || []),
                  ...(athlete.glucose ? [athlete.glucose] : []),
                ]
                  .sort(
                    (a, b) =>
                      new Date(b.recordedAt).getTime() -
                      new Date(a.recordedAt).getTime()
                  )
                  .slice(0, 10)
                  .map((reading) => (
                    <tr key={reading.id} className="border-b">
                      <td className="py-2">
                        {new Date(reading.recordedAt).toLocaleString()}
                      </td>
                      <td className="py-2">
                        {reading.value} {reading.unit}
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            reading.status?.type === PrismaStatusType.HIGH
                              ? "bg-black text-white"
                              : reading.status?.type === PrismaStatusType.LOW
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {reading.status?.type || "OK"}
                        </span>
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            reading.source === "dexcom"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {reading.source === "dexcom"
                            ? "From Dexcom"
                            : "Manual Entry"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
