import {
  Activity,
  Droplet,
  Play,
  RefreshCw,
  Settings,
  StopCircle,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { PrismaStatusType } from "~/types/prisma";

interface UnifiedStatusCardProps {
  athlete: {
    name: string;
    glucose?: {
      value: number;
      unit: string;
      recordedAt: string;
    } | null;
    status?: {
      type: PrismaStatusType;
      acknowledgedAt: string | null;
    } | null;
    glucoseHistory: Array<{
      value: number;
    }>;
  };
  isDexcomConnected: boolean;
  setIsDexcomDialogOpen: (isOpen: boolean) => void;
  isRefreshing: boolean;
  refreshDexcomData: () => void;
  setIsStrobeDialogOpen: (isOpen: boolean) => void;
  isSubmitting: boolean;
  preferences: {
    lowThreshold: number;
    highThreshold: number;
  } | null;
  setIsPreferencesDialogOpen: (isOpen: boolean) => void;
  lastReadingTime?: Date;
  isJobRunning: boolean;
}

export function UnifiedStatusCard({
  athlete,
  isDexcomConnected,
  setIsDexcomDialogOpen,
  isRefreshing,
  refreshDexcomData,
  setIsStrobeDialogOpen,
  isSubmitting,
  preferences,
  setIsPreferencesDialogOpen,
  lastReadingTime,
  isJobRunning,
}: UnifiedStatusCardProps) {
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const fetcher = useFetcher();

  const handleStartJob = () => {
    fetcher.submit({ intent: "start-dexcom-job" }, { method: "post" });
  };

  const handleStopJob = () => {
    setIsStopDialogOpen(true);
  };

  const confirmStopJob = () => {
    fetcher.submit({ intent: "stop-dexcom-job" }, { method: "post" });
    setIsStopDialogOpen(false);
  };

  const formatLastReadingTime = () => {
    if (!lastReadingTime) return "Never";

    const now = new Date();
    const diffMs = now.getTime() - new Date(lastReadingTime).getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const getStatusColor = (status: PrismaStatusType | undefined) => {
    switch (status) {
      case PrismaStatusType.HIGH:
        return "bg-black text-white";
      case PrismaStatusType.LOW:
        return "bg-red-600 text-white";
      default:
        return "bg-green-600 text-white";
    }
  };

  const getTrendIndicator = () => {
    if (!athlete.glucose || athlete.glucoseHistory.length === 0) return null;

    const currentValue = athlete.glucose.value;
    const previousValue = athlete.glucoseHistory[0].value;
    const difference = currentValue - previousValue;

    if (difference > 0) {
      return (
        <div className="flex items-center text-green-600">
          <TrendingUp className="h-4 w-4 mr-1" />
          <span>+{difference}</span>
        </div>
      );
    } else if (difference < 0) {
      return (
        <div className="flex items-center text-red-600">
          <TrendingDown className="h-4 w-4 mr-1" />
          <span>{difference}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Glucose Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Droplet className="h-5 w-5 mr-2 text-blue-600" />
                <CardTitle>Glucose Level</CardTitle>
              </div>
              <div className="flex items-center space-x-2">
                {isDexcomConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDexcomData}
                    disabled={isRefreshing}
                    className="flex items-center"
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1.5 ${
                        isRefreshing ? "animate-spin" : ""
                      }`}
                    />
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPreferencesDialogOpen(true)}
                  className="flex items-center"
                >
                  <Settings className="h-4 w-4 mr-1.5" />
                  Modify Range
                </Button>
              </div>
            </div>
            <CardDescription>
              Last updated:{" "}
              {athlete.glucose
                ? new Date(athlete.glucose.recordedAt).toLocaleTimeString()
                : "No recent readings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-4">
              <div className="text-7xl font-bold mb-2 flex items-center justify-center">
                {athlete.glucose ? (
                  <>
                    <span>{athlete.glucose.value}</span>
                    <span className="text-2xl ml-1 text-gray-500">
                      {athlete.glucose.unit}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">No Reading</span>
                )}
              </div>

              <div className="flex items-center space-x-3 mb-4">
                <Badge
                  variant="outline"
                  className={`px-3 py-1 text-sm font-medium ${getStatusColor(
                    athlete.status?.type
                  )}`}
                >
                  {athlete.status?.type || "OK"}
                </Badge>

                {athlete.glucose && athlete.glucoseHistory.length > 0 && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 mr-1">
                      Previous: {athlete.glucoseHistory[0].value}
                    </span>
                    {getTrendIndicator()}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <div className="w-full grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col items-center">
                <Badge
                  variant="outline"
                  className="w-full bg-red-600 text-white"
                >
                  Low: &lt;{preferences?.lowThreshold || 70}
                </Badge>
                <span className="text-xs text-gray-500 mt-1">Below target</span>
              </div>
              <div className="flex flex-col items-center">
                <Badge
                  variant="outline"
                  className="w-full bg-green-600 text-white"
                >
                  OK: {preferences?.lowThreshold || 70}-
                  {preferences?.highThreshold || 180}
                </Badge>
                <span className="text-xs text-gray-500 mt-1">Target range</span>
              </div>
              <div className="flex flex-col items-center">
                <Badge variant="outline" className="w-full bg-black text-white">
                  High: &gt;{preferences?.highThreshold || 180}
                </Badge>
                <span className="text-xs text-gray-500 mt-1">Above target</span>
              </div>
            </div>
          </CardFooter>
        </Card>

        {/* Dexcom Status Card */}
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-blue-600" />
              <CardTitle>Dexcom Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-grow">
            <div className="space-y-4">
              {/* Status Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Connection Status */}
                <div
                  className={`p-3 rounded-lg ${
                    isDexcomConnected
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Connection</span>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isDexcomConnected ? "bg-green-500" : "bg-red-500"
                      } animate-pulse`}
                    ></div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {isDexcomConnected ? "Active" : "Not Connected"}
                  </div>
                </div>

                {/* Live Data Status */}
                <div
                  className={`p-3 rounded-lg ${
                    isJobRunning
                      ? "bg-green-50 border border-green-200"
                      : "bg-yellow-50 border border-yellow-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Live Data</span>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isJobRunning ? "bg-green-500" : "bg-yellow-500"
                      } animate-pulse`}
                    ></div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {isJobRunning ? "Active" : "Stopped"}
                  </div>
                </div>
              </div>

              {/* Last Reading Time */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="text-sm font-medium">Last Reading</span>
                <span className="text-sm text-gray-600">
                  {formatLastReadingTime()}
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-auto pt-4 border-t">
            <div className="w-full flex flex-col space-y-2">
              {!isDexcomConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDexcomDialogOpen(true)}
                  className="w-full flex items-center justify-center"
                >
                  <Zap className="h-4 w-4 mr-1.5" />
                  Connect Dexcom
                </Button>
              ) : (
                <>
                  {isJobRunning ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopJob}
                      className="w-full flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-50"
                      disabled={fetcher.state !== "idle"}
                    >
                      <StopCircle className="h-4 w-4 mr-1.5" />
                      Stop Live Data
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartJob}
                      className="w-full flex items-center justify-center text-green-600 hover:text-green-800 hover:bg-green-50"
                      disabled={fetcher.state !== "idle"}
                    >
                      <Play className="h-4 w-4 mr-1.5" />
                      Start Live Data
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          "Are you sure you want to disconnect Dexcom? This will remove all Dexcom tokens and stop automatic glucose readings."
                        )
                      ) {
                        fetcher.submit(
                          { intent: "disconnect-dexcom" },
                          { method: "post" }
                        );
                      }
                    }}
                    className="w-full flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-50"
                    disabled={fetcher.state !== "idle"}
                  >
                    <Zap className="h-4 w-4 mr-1.5" />
                    Disconnect Dexcom
                  </Button>
                </>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Stop Job Confirmation Dialog */}
      <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Live Data</DialogTitle>
            <DialogDescription>
              Stopping live data will no longer fetch Dexcom data automatically.
              You may still manually refresh the data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsStopDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmStopJob}>
              Stop Live Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
