import { z } from "zod";

export const errorCodeSchema = z.enum([
  "CONFIGURATION_ERROR",
  "DATABASE_UNAVAILABLE",
  "INTEGRATION_UNAVAILABLE",
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

export const authSessionSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }),
  z.object({ authenticated: z.literal(true), identity: identitySchema }),
]);

export const integrationServiceSchema = z.enum([
  "google_oauth",
  "google_classroom",
  "google_forms",
  "openai",
]);

export const integrationStatusSchema = z.object({
  service: integrationServiceSchema,
  status: z.enum(["active", "inactive"]),
  checkedAt: z.iso.datetime(),
  errorCode: z.string().nullable(),
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

export const professorProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    notificationPreference: notificationPreferenceSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
  });

export const curriculumReferenceSchema = z.object({
  id: z.uuid(),
  curricularComponent: z.string().min(1),
  schoolYear: z.string().min(1),
  sourceLabel: z.string().min(1),
  isFixture: z.boolean(),
});

export const curriculumSkillSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  thematicUnit: z.string().nullable(),
  knowledgeObject: z.string().min(1),
  description: z.string().min(1),
  sourceLabel: z.string().min(1),
  isOfficial: z.boolean(),
  isFixture: z.boolean(),
});

export const curriculumSyllabusSchema = z.object({
  id: z.uuid(),
  areaName: z.string().min(1),
  curricularComponent: z.string().min(1),
  schoolYear: z.string().min(1),
  description: z.string().min(1),
  sourceLabel: z.string().min(1),
  isFixture: z.boolean(),
  skills: z.array(curriculumSkillSchema),
});

export const curriculumSearchQuerySchema = z.object({
  component: z.string().trim().min(1).optional(),
  schoolYear: z.string().trim().min(1).optional(),
  skillCode: z.string().trim().min(1).optional(),
});

export const curriculumSearchResponseSchema = z.object({
  data: z.array(curriculumSyllabusSchema),
  reviewRequired: z.boolean(),
  reason: z.enum(["SKILL_NOT_FOUND", "NO_CURRICULUM_MATCH"]).nullable(),
});

export const openAiAvailabilitySchema = z.object({
  status: z.enum(["missing", "deferred", "available", "unavailable"]),
  errorCode: z.string().nullable(),
});

export const classSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  schoolYear: z.string().min(1),
  source: z.enum(["local", "google"]),
});

export const classCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  schoolYear: z.string().trim().min(1).max(20),
  localAccessCode: z.string().trim().min(4).max(40),
  generalNotice: z.string().trim().max(2_000).nullable().optional(),
});

export const classUpdateSchema = classCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
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

export const studentEnrollmentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  origin: z.enum(["spreadsheet", "access_code"]),
  status: enrollmentStatusSchema.optional(),
});

export const enrolledStudentSchema = studentSummarySchema.extend({
  id: z.uuid(),
  isInconsistent: z.boolean(),
  inconsistencyReason: z.string().nullable(),
});

export const classDetailSchema = classSummarySchema.extend({
  generalNotice: z.string().nullable(),
  syncStatus: z.enum(["never", "active", "failed"]),
  lastSyncedAt: z.iso.datetime().nullable(),
  students: z.array(enrolledStudentSchema),
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
export type AuthSession = z.infer<typeof authSessionSchema>;
export type IntegrationService = z.infer<typeof integrationServiceSchema>;
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type ProfessorProfile = z.infer<typeof professorProfileSchema>;
export type ProfessorProfileUpdate = z.infer<
  typeof professorProfileUpdateSchema
>;
export type CurriculumReference = z.infer<typeof curriculumReferenceSchema>;
export type CurriculumSkill = z.infer<typeof curriculumSkillSchema>;
export type CurriculumSyllabus = z.infer<typeof curriculumSyllabusSchema>;
export type CurriculumSearchQuery = z.infer<typeof curriculumSearchQuerySchema>;
export type CurriculumSearchResponse = z.infer<
  typeof curriculumSearchResponseSchema
>;
export type OpenAiAvailability = z.infer<typeof openAiAvailabilitySchema>;
export type ClassSummary = z.infer<typeof classSummarySchema>;
export type ClassCreate = z.infer<typeof classCreateSchema>;
export type ClassUpdate = z.infer<typeof classUpdateSchema>;
export type StudentEnrollmentInput = z.infer<
  typeof studentEnrollmentInputSchema
>;
export type EnrolledStudent = z.infer<typeof enrolledStudentSchema>;
export type ClassDetail = z.infer<typeof classDetailSchema>;
export type StudentSummary = z.infer<typeof studentSummarySchema>;
export type LiveResponse = z.infer<typeof liveResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export function successSchema<T extends z.ZodType>(data: T) {
  return z.object({ data });
}
