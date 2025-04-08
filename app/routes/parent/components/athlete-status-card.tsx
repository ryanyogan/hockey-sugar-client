import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { PrismaStatusType } from "~/types/prisma";
import type { Athlete } from "../types";

interface AthleteStatusCardProps {
  athlete: Athlete;
  isDexcomConnected: boolean;
  setIsDexcomDialogOpen: (isOpen: boolean) => void;
  isRefreshing: boolean;
  refreshDexcomData: () => void;
  setIsStrobeDialogOpen: (isOpen: boolean) => void;
  selectedAthleteId: string | null;
  isSubmitting: boolean;
  preferences: {
    lowThreshold: number;
    highThreshold: number;
  } | null;
  setIsPreferencesDialogOpen: (isOpen: boolean) => void;
}

export function AthleteStatusCard({
  athlete,
  isDexcomConnected,
  setIsDexcomDialogOpen,
  isRefreshing,
  refreshDexcomData,
  setIsStrobeDialogOpen,
  selectedAthleteId,
  isSubmitting,
  preferences,
  setIsPreferencesDialogOpen,
}: AthleteStatusCardProps) {
  return (
    <Card className="border-l-4 border-blue-500">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl">{athlete.name}</CardTitle>
          <CardDescription>Current Status and Latest Reading</CardDescription>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row items-center gap-2 w-full">
          {/* Connection status indicator */}
          {isDexcomConnected ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm w-full sm:w-1/3 justify-center">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Connected to Dexcom</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDexcomDialogOpen(true)}
              className="w-full sm:w-1/2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Connect Dexcom
            </Button>
          )}

          {/* Refresh button */}
          {isDexcomConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshDexcomData}
              disabled={isRefreshing}
              className="w-full sm:w-1/3"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          )}

          {/* Strobe SOS button */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsStrobeDialogOpen(true)}
            disabled={!selectedAthleteId || isSubmitting}
            className="w-full sm:w-1/3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Send SOS
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Glucose value display */}
          <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-gray-50">
            <div className="text-4xl font-bold mb-2">
              {athlete.glucose ? (
                <>
                  <span className="text-5xl">{athlete.glucose.value}</span>
                  <span className="text-2xl ml-1">{athlete.glucose.unit}</span>
                </>
              ) : (
                <span className="text-gray-400">No Reading</span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              {athlete.glucose
                ? `Last updated: ${new Date(
                    athlete.glucose.recordedAt
                  ).toLocaleTimeString()}`
                : "No recent readings"}
            </div>
            {athlete.glucose && athlete.glucoseHistory.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 flex items-center">
                <span className="mr-1">
                  Previous: {athlete.glucoseHistory[0].value}
                </span>
                <span
                  className={`ml-1 ${
                    athlete.glucose.value > athlete.glucoseHistory[0].value
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  (
                  {athlete.glucose.value > athlete.glucoseHistory[0].value
                    ? "+"
                    : ""}
                  {athlete.glucose.value - athlete.glucoseHistory[0].value})
                </span>
              </div>
            )}
          </div>

          {/* Status display */}
          <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-gray-50">
            <div
              className={`text-4xl font-bold mb-2 ${
                athlete.glucose?.statusType === PrismaStatusType.HIGH
                  ? "text-black"
                  : athlete.glucose?.statusType === PrismaStatusType.LOW
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {athlete.glucose?.statusType || "OK"}
            </div>
            {athlete.glucose?.statusType === PrismaStatusType.LOW && (
              <div
                className={`text-sm ${
                  athlete.glucose.acknowledgedAt
                    ? "text-green-600"
                    : "text-red-600 font-medium"
                }`}
              >
                {athlete.glucose.acknowledgedAt
                  ? `Acknowledged at ${new Date(
                      athlete.glucose.acknowledgedAt
                    ).toLocaleTimeString()}`
                  : "⚠️ Not acknowledged yet"}
              </div>
            )}
          </div>
        </div>

        {/* Thresholds legend */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>Low: &lt;{preferences?.lowThreshold || 70}</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600"></div>
            <span>
              OK: {preferences?.lowThreshold || 70}-
              {preferences?.highThreshold || 180}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-black"></div>
            <span>High: &gt;{preferences?.highThreshold || 180}</span>
          </div>
          <div className="col-span-3 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPreferencesDialogOpen(true)}
            >
              Customize Thresholds
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
