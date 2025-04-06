import { DexcomAuth } from "~/components/dexcom-auth";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";

// RemoveAthleteDialog Component
interface RemoveAthleteDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  athleteToRemove: string | null;
  setAthleteToRemove: (id: string) => void;
  handleRemoveAthlete: () => void;
  isRemoving: boolean;
  athletes: { id: string; name: string }[];
}

export function RemoveAthleteDialog({
  isOpen,
  setIsOpen,
  athleteToRemove,
  setAthleteToRemove,
  handleRemoveAthlete,
  isRemoving,
  athletes,
}: RemoveAthleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Multiple Athletes Detected</DialogTitle>
          <DialogDescription>
            You currently have multiple athletes in your account. Please select
            one to remove.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-4">
            <Label htmlFor="athlete-select">Select Athlete to Remove</Label>
            <Select
              value={athleteToRemove || ""}
              onValueChange={setAthleteToRemove}
            >
              <SelectTrigger id="athlete-select">
                <SelectValue placeholder="Select an athlete" />
              </SelectTrigger>
              <SelectContent>
                {athletes.map((athlete) => (
                  <SelectItem key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isRemoving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRemoveAthlete}
            disabled={!athleteToRemove || isRemoving}
          >
            {isRemoving ? "Removing..." : "Remove Athlete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// PreferencesDialog Component
interface PreferencesDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  lowThreshold: number;
  setLowThreshold: (value: number) => void;
  highThreshold: number;
  setHighThreshold: (value: number) => void;
  updatePreferences: () => void;
}

export function PreferencesDialog({
  isOpen,
  setIsOpen,
  lowThreshold,
  setLowThreshold,
  highThreshold,
  setHighThreshold,
  updatePreferences,
}: PreferencesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Glucose Thresholds</DialogTitle>
          <DialogDescription>
            Set your custom low and high glucose thresholds
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="low-threshold">Low Threshold</Label>
              <span className="text-sm font-medium">{lowThreshold} mg/dL</span>
            </div>
            <Slider
              id="low-threshold"
              min={40}
              max={highThreshold - 1}
              step={1}
              value={[lowThreshold]}
              onValueChange={(value) => setLowThreshold(value[0])}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="high-threshold">High Threshold</Label>
              <span className="text-sm font-medium">{highThreshold} mg/dL</span>
            </div>
            <Slider
              id="high-threshold"
              min={lowThreshold + 1}
              max={300}
              step={1}
              value={[highThreshold]}
              onValueChange={(value) => setHighThreshold(value[0])}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={updatePreferences}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// StrobeDialog Component
interface StrobeDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  athleteName?: string;
  handleSendStrobe: () => void;
}

export function StrobeDialog({
  isOpen,
  setIsOpen,
  athleteName,
  handleSendStrobe,
}: StrobeDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm STROBE Alert</DialogTitle>
          <DialogDescription>
            Are you sure you want to send a STROBE alert to {athleteName}? This
            should only be used in urgent situations and will cause their phone
            to flash.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSendStrobe}>
            Send Alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// DexcomDialog Component
interface DexcomDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onAuthSuccess: (data: { accessToken: string; refreshToken: string }) => void;
}

export function DexcomDialog({
  isOpen,
  setIsOpen,
  onAuthSuccess,
}: DexcomDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Dexcom</DialogTitle>
          <DialogDescription>
            Connect to Dexcom for automatic glucose readings
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <DexcomAuth onAuthSuccess={onAuthSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
