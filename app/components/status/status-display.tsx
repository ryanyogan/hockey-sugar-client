import { StatusType } from "@prisma/client";
import { useEffect, useState } from "react";

interface StatusDisplayProps {
  status: StatusType;
  glucoseValue?: number;
  unit?: string;
  onAcknowledge?: () => void;
  isAcknowledged?: boolean;
  hasStrobe?: boolean;
}

export function StatusDisplay({
  status,
  glucoseValue,
  unit = "mg/dL",
  onAcknowledge,
  isAcknowledged = false,
  hasStrobe = false,
}: StatusDisplayProps) {
  const [isFlashing, setIsFlashing] = useState(false);
  const [strobeEffect, setStrobeEffect] = useState(false);

  // For the LOW status flashing effect
  useEffect(() => {
    if (status === StatusType.LOW && !isAcknowledged) {
      const interval = setInterval(() => {
        setIsFlashing((prev) => !prev);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setIsFlashing(false);
    }
  }, [status, isAcknowledged]);

  // For the strobe emergency effect
  useEffect(() => {
    if (hasStrobe) {
      const interval = setInterval(() => {
        setStrobeEffect((prev) => !prev);
      }, 100); // Faster strobe effect
      return () => clearInterval(interval);
    } else {
      setStrobeEffect(false);
    }
  }, [hasStrobe]);

  let bgColor = "bg-white";
  let textColor = "text-black";

  if (hasStrobe) {
    bgColor = strobeEffect ? "bg-red-500" : "bg-white";
    textColor = strobeEffect ? "text-white" : "text-red-500";
  } else if (status === StatusType.HIGH) {
    bgColor = "bg-black";
    textColor = "text-white";
  } else if (status === StatusType.LOW) {
    bgColor = isFlashing ? "bg-red-600" : "bg-red-700";
    textColor = "text-white";
  }

  return (
    <div
      className={`flex flex-col items-center justify-center h-screen w-full ${bgColor} transition-colors duration-300`}
      onClick={
        status === StatusType.LOW && !isAcknowledged ? onAcknowledge : undefined
      }
    >
      <div className="text-center p-6">
        <h1 className={`text-8xl font-bold mb-6 ${textColor}`}>{status}</h1>

        {glucoseValue && (
          <p className={`text-5xl mb-8 ${textColor}`}>
            {glucoseValue} {unit}
          </p>
        )}

        {status === StatusType.LOW && !isAcknowledged && (
          <div className="mt-8">
            <button
              onClick={onAcknowledge}
              className="bg-white text-red-600 text-2xl font-bold py-4 px-8 rounded-full animate-pulse"
            >
              TAP TO ACKNOWLEDGE
            </button>
          </div>
        )}

        {status === StatusType.LOW && isAcknowledged && (
          <p className={`text-2xl mt-4 ${textColor}`}>
            Acknowledged - Take glucose immediately
          </p>
        )}
      </div>
    </div>
  );
}
