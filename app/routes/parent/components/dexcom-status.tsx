import {
  AlertCircle,
  CheckCircle,
  Play,
  RefreshCw,
  StopCircle,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface DexcomStatusProps {
  isConnected: boolean;
  lastReadingTime?: Date;
  isJobRunning: boolean;
  onRefresh: () => void;
}

export function DexcomStatus({
  isConnected,
  lastReadingTime,
  isJobRunning,
  onRefresh,
}: DexcomStatusProps) {
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

  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Dexcom Status</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-700 mr-2">
              Connection:
            </span>
            {isConnected ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                <span>Connected</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <AlertCircle className="h-4 w-4 mr-1" />
                <span>Not Connected</span>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={!isConnected}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-700 mr-2">
              Background Job:
            </span>
            {isJobRunning ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                <span>Running</span>
              </div>
            ) : (
              <div className="flex items-center text-yellow-600">
                <AlertCircle className="h-4 w-4 mr-1" />
                <span>Stopped</span>
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            {isJobRunning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopJob}
                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                disabled={fetcher.state !== "idle"}
              >
                <StopCircle className="h-4 w-4 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartJob}
                className="text-green-600 hover:text-green-800 hover:bg-green-50"
                disabled={fetcher.state !== "idle"}
              >
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700 mr-2">
            Last Reading:
          </span>
          <span className="text-sm text-gray-600">
            {formatLastReadingTime()}
          </span>
        </div>
      </div>

      {/* Stop Job Confirmation Dialog */}
      <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Background Job</DialogTitle>
            <DialogDescription>
              Stopping the background job will no longer fetch Dexcom data
              automatically. You may still manually refresh the data.
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
              Stop Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
