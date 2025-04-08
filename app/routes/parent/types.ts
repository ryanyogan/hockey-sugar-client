import { StatusType } from "~/components/status/status-display";

export type GlucoseReading = {
  id: string;
  value: number;
  unit: string;
  recordedAt: string;
  userId: string;
  recordedById: string;
  statusType: StatusType;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source?: "manual" | "dexcom";
};

export type Status = {
  id: string;
  type: StatusType;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Athlete = {
  id: string;
  name: string;
  unreadMessagesCount: number;
  status: {
    type: StatusType;
    acknowledgedAt: string | null;
  } | null;
  glucose?: GlucoseReading | null;
  glucoseHistory: GlucoseReading[];
};

export type DexcomToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type LoaderData = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
  };
  athletes: {
    id: string;
    name: string;
  }[];
  selectedAthlete: Athlete | null;
  dexcomToken: DexcomToken | null;
  preferences: {
    lowThreshold: number;
    highThreshold: number;
  } | null;
};
