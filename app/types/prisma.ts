export type PrismaStatusType = "OK" | "HIGH" | "LOW";

export const PrismaStatusType = {
  OK: "OK",
  HIGH: "HIGH",
  LOW: "LOW",
} as const;
