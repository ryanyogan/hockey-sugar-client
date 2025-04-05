import type { User as PrismaUser } from "@prisma/client";

export type Role = "ADMIN" | "PARENT" | "COACH" | "ATHLETE";

export type User = PrismaUser;
