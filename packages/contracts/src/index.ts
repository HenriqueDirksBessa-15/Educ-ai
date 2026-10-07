import { z } from "zod";

export const errorCodeSchema = z.enum([
  "CONFIGURATION_ERROR",
  "DATABASE_UNAVAILABLE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
});

export const identitySchema = z.object({
  professorId: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1),
  provider: z.literal("google"),
});

export const notificationPreferenceSchema = z.enum(["visual", "email", "both"]);

export const professorProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
  email: z.email(),
  profileImageUrl: z.url().nullable(),
  notificationPreference: notificationPreferenceSchema,
  createdAt: z.iso.datetime(),
});

export const curriculumReferenceSchema = z.object({
  id: z.uuid(),
  curricularComponent: z.string().min(1),
  schoolYear: z.string().min(1),
  sourceLabel: z.string().min(1),
  isFixture: z.boolean(),
});

export const classSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  schoolYear: z.string().min(1),
  source: z.enum(["local", "google"]),
});

export const enrollmentStatusSchema = z.enum([
  "active",
  "restricted",
  "pending",
]);

export const studentSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  origin: z.enum(["google", "spreadsheet", "access_code"]),
  status: enrollmentStatusSchema,
});

export const dependencyStatusSchema = z.enum(["available", "unavailable"]);

export const liveResponseSchema = z.object({
  status: z.literal("alive"),
  service: z.literal("educai-api"),
  timestamp: z.iso.datetime(),
});

export const readyResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.literal("educai-api"),
  database: dependencyStatusSchema,
  timestamp: z.iso.datetime(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type ProfessorProfile = z.infer<typeof professorProfileSchema>;
export type CurriculumReference = z.infer<typeof curriculumReferenceSchema>;
export type ClassSummary = z.infer<typeof classSummarySchema>;
export type StudentSummary = z.infer<typeof studentSummarySchema>;
export type LiveResponse = z.infer<typeof liveResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export function successSchema<T extends z.ZodType>(data: T) {
  return z.object({ data });
}
