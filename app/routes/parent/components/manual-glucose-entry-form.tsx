import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface ManualGlucoseEntryFormProps {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  athleteName: string;
  isSubmitting: boolean;
}

export function ManualGlucoseEntryForm({
  handleSubmit,
  athleteName,
  isSubmitting,
}: ManualGlucoseEntryFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Glucose Entry</CardTitle>
        <CardDescription>
          Enter a new glucose reading for {athleteName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="intent" value="update-glucose" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Glucose Value Input */}
            <div className="space-y-2">
              <label
                htmlFor="value"
                className="text-sm font-medium text-gray-700"
              >
                Glucose Value
              </label>
              <Input
                type="number"
                name="value"
                id="value"
                required
                min="20"
                max="500"
                placeholder="Enter value (e.g. 120)"
                className="w-full"
              />
            </div>

            {/* Unit Selection */}
            <div className="space-y-2">
              <label
                htmlFor="unit"
                className="text-sm font-medium text-gray-700"
              >
                Unit
              </label>
              <Select name="unit" defaultValue="mg/dL">
                <SelectTrigger id="unit" className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mg/dL">mg/dL</SelectItem>
                  <SelectItem value="mmol/L">mmol/L</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-2">
            <label
              htmlFor="notes"
              className="text-sm font-medium text-gray-700"
            >
              Notes (optional)
            </label>
            <Input
              type="text"
              name="notes"
              id="notes"
              placeholder="Any additional information (e.g. after meal, exercise)"
              className="w-full"
            />
          </div>

          {/* Submit Button */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Submitting..." : "Submit Reading"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
