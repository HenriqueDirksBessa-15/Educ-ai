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

export const milestoneTypeSchema = z.enum([
  "lesson",
  "assessment",
  "event",
  "deadline",
  "other",
]);

export const milestoneCreateSchema = z.object({
  classId: z.uuid(),
  date: z.iso.date(),
  type: milestoneTypeSchema,
  description: z.string().trim().min(1).max(500),
});

export const milestoneUpdateSchema = milestoneCreateSchema
  .omit({ classId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
  });

export const milestoneSchema = milestoneCreateSchema.extend({
  id: z.uuid(),
  className: z.string().min(1),
  isPast: z.boolean(),
  isArchived: z.boolean(),
  hasPublishedContent: z.boolean(),
});

export const materialCategorySchema = z.enum([
  "reading",
  "presentation",
  "video",
  "image",
  "link",
  "other",
]);

export const materialInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).nullable().optional(),
  category: materialCategorySchema,
  classIds: z.array(z.uuid()).min(1),
  bnccSkillIds: z.array(z.uuid()).default([]),
  url: z.url().nullable().optional(),
  fileName: z.string().trim().max(255).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  storageKey: z.string().trim().max(500).nullable().optional(),
});

export const materialSchema = materialInputSchema.extend({
  id: z.uuid(),
  classNames: z.array(z.string().min(1)),
  isArchived: z.boolean(),
  hasPublishedContent: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const materialListQuerySchema = z.object({
  category: materialCategorySchema.optional(),
  archived: z.coerce.boolean().optional(),
});

export const lessonPlanInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  curricularComponent: z.string().trim().min(1).max(100),
  schoolYear: z.string().trim().min(1).max(20),
  objectives: z.string().trim().min(1).max(4_000),
  contents: z.string().trim().min(1).max(4_000),
  methodology: z.string().trim().min(1).max(6_000),
  evaluationStrategy: z.string().trim().min(1).max(4_000),
  classIds: z.array(z.uuid()).min(1),
  syllabusId: z.uuid().nullable().optional(),
  bnccSkillIds: z.array(z.uuid()).default([]),
  materialIds: z.array(z.uuid()).default([]),
});

export const lessonPlanUpdateSchema = lessonPlanInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
  });

export const lessonPlanStatusSchema = z.enum([
  "draft",
  "generated",
  "reviewed",
  "approved",
]);

export const lessonPlanSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  objectives: z.string().trim().min(1).max(4_000),
  contents: z.string().trim().min(1).max(4_000),
  methodology: z.string().trim().min(1).max(6_000),
  evaluationStrategy: z.string().trim().min(1).max(4_000),
});

export const lessonPlanGenerationSchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  version: z.number().int().positive(),
  model: z.string().min(1),
  origin: z.enum(["fixture", "openai"]),
  status: z.enum(["succeeded", "failed"]),
  suggestion: lessonPlanSuggestionSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const lessonPlanReviewSchema = z.object({
  suggestion: lessonPlanSuggestionSchema,
  generationId: z.uuid(),
});

export const lessonPlanSchema = lessonPlanInputSchema.extend({
  id: z.uuid(),
  professorId: z.uuid(),
  classNames: z.array(z.string().min(1)),
  syllabusDescription: z.string().nullable(),
  bnccCodes: z.array(z.string().min(1)),
  materialTitles: z.array(z.string().min(1)),
  isArchived: z.boolean(),
  isLocked: z.boolean(),
  status: lessonPlanStatusSchema,
  reviewedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  latestGeneration: lessonPlanGenerationSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const lessonPlanListQuerySchema = z.object({
  archived: z.coerce.boolean().optional(),
});

export const activityStatusSchema = z.enum(["draft", "published", "finished"]);

export const activityTypeSchema = z.enum(["objective", "discursive", "mixed"]);

export const activityQuestionKindSchema = z.enum(["objective", "discursive"]);

export const activityDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const latePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("blocked") }),
  z.object({
    mode: z.literal("allowed_with_penalty"),
    penaltyPercent: z.number().int().min(0).max(100),
  }),
]);

const objectiveQuestionInputSchema = z.object({
  kind: z.literal("objective"),
  prompt: z.string().trim().min(1).max(4_000),
  points: z.number().positive().max(1_000),
  alternatives: z.array(z.string().trim().min(1).max(1_000)).min(2).max(10),
  correctAlternativeIndex: z.number().int().nonnegative(),
});

const discursiveQuestionInputSchema = z.object({
  kind: z.literal("discursive"),
  prompt: z.string().trim().min(1).max(4_000),
  points: z.number().positive().max(1_000),
  targetAnswer: z.string().trim().min(1).max(8_000),
  criteria: z.string().trim().min(1).max(8_000),
});

export const activityQuestionInputSchema = z
  .discriminatedUnion("kind", [
    objectiveQuestionInputSchema,
    discursiveQuestionInputSchema,
  ])
  .refine(
    (question) =>
      question.kind !== "objective" ||
      question.correctAlternativeIndex < question.alternatives.length,
    { message: "O gabarito deve apontar para uma alternativa existente." },
  );

const activityInputBaseSchema = z.object({
  lessonPlanId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(6_000),
  type: activityTypeSchema,
  difficulty: activityDifficultySchema,
  dueAt: z.iso.datetime(),
  latePolicy: latePolicySchema,
  questions: z.array(activityQuestionInputSchema).max(100),
});

export const activityInputSchema = activityInputBaseSchema.superRefine(
  (activity, context) => {
    if (activity.questions.length === 0) return;
    const kinds = new Set(activity.questions.map((question) => question.kind));
    const matchesType =
      (activity.type === "objective" &&
        kinds.size === 1 &&
        kinds.has("objective")) ||
      (activity.type === "discursive" &&
        kinds.size === 1 &&
        kinds.has("discursive")) ||
      (activity.type === "mixed" &&
        kinds.has("objective") &&
        kinds.has("discursive"));
    if (!matchesType)
      context.addIssue({
        code: "custom",
        path: ["type"],
        message: "O tipo deve corresponder às questões cadastradas.",
      });
  },
);

export const activityUpdateSchema = activityInputBaseSchema
  .omit({ lessonPlanId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
  });

export const activityQuestionSchema = activityQuestionInputSchema.and(
  z.object({ id: z.uuid(), position: z.number().int().nonnegative() }),
);

export const activitySchema = activityInputBaseSchema
  .omit({ questions: true })
  .extend({
    id: z.uuid(),
    professorId: z.uuid(),
    lessonPlanTitle: z.string().min(1),
    status: activityStatusSchema,
    questions: z.array(activityQuestionSchema),
    totalPoints: z.number().nonnegative(),
    responseCount: z.number().int().nonnegative(),
    publishedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });

export const activityListQuerySchema = z.object({
  status: activityStatusSchema.optional(),
  archived: z.coerce.boolean().optional(),
});

export const activityGenerationRequestSchema = z.object({
  questionCount: z.number().int().min(1).max(100),
});

export const activitySuggestionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(6_000),
    type: activityTypeSchema,
    difficulty: activityDifficultySchema,
    questions: z.array(activityQuestionInputSchema).min(1).max(100),
  })
  .superRefine((activity, context) => {
    const kinds = new Set(activity.questions.map((question) => question.kind));
    const matchesType =
      (activity.type === "objective" &&
        kinds.size === 1 &&
        kinds.has("objective")) ||
      (activity.type === "discursive" &&
        kinds.size === 1 &&
        kinds.has("discursive")) ||
      (activity.type === "mixed" &&
        kinds.has("objective") &&
        kinds.has("discursive"));
    if (!matchesType)
      context.addIssue({
        code: "custom",
        path: ["type"],
        message: "O tipo deve corresponder às questões sugeridas.",
      });
  });

export const activityGenerationStatusSchema = z.enum(["succeeded", "failed"]);
export const activityReviewStatusSchema = z.enum([
  "generated",
  "reviewed",
  "approved",
]);

export const activityGenerationSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  version: z.number().int().positive(),
  model: z.string().min(1),
  origin: z.enum(["fixture", "openai"]),
  status: activityGenerationStatusSchema,
  reviewStatus: activityReviewStatusSchema.nullable(),
  suggestion: activitySuggestionSchema.nullable(),
  errorCode: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const activityReviewSchema = z.object({
  generationId: z.uuid(),
  suggestion: activitySuggestionSchema,
});

export const activityApprovalSchema = z.object({
  generationId: z.uuid(),
});

export const activityPublicationStatusSchema = z.enum([
  "pending",
  "creating_form",
  "distributing",
  "published",
  "failed",
  "reconciliation_required",
]);

export const activityDistributionStatusSchema = z.enum([
  "pending",
  "published",
  "failed",
]);

export const activityDistributionSchema = z.object({
  classId: z.uuid(),
  className: z.string().min(1),
  googleClassroomId: z.string().nullable(),
  googleCourseWorkId: z.string().nullable(),
  alternateLink: z.url().nullable(),
  status: activityDistributionStatusSchema,
  errorCode: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
});

export const activityPublicationSchema = z.object({
  activityId: z.uuid(),
  status: activityPublicationStatusSchema,
  googleFormId: z.string().nullable(),
  responderUri: z.url().nullable(),
  errorCode: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  collectionScheduledAt: z.iso.datetime().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  distributions: z.array(activityDistributionSchema),
});

export const activitySubmissionStatusSchema = z.enum([
  "collected",
  "objective_graded",
  "manual_review_required",
]);

export const activityAnswerStatusSchema = z.enum([
  "graded",
  "pending_discursive",
  "teacher_reviewed",
  "manual_review_required",
]);

export const submissionCorrectionStatusSchema = z.enum([
  "pending",
  "suggested",
  "manual_required",
  "reviewed",
  "approved",
  "released",
]);

export const classroomReturnStatusSchema = z.enum([
  "pending",
  "not_available",
  "returned",
  "failed",
]);

export const correctionRigourSchema = z.enum([
  "supportive",
  "balanced",
  "strict",
]);

export const discursiveCorrectionSuggestionSchema = z.object({
  pointsAwarded: z.number().nonnegative(),
  comment: z.string().trim().min(1).max(4_000),
  requiresReview: z.boolean(),
});

export const discursiveCorrectionGenerateSchema = z.object({
  answerId: z.uuid(),
  rigour: correctionRigourSchema,
});

export const discursiveAnswerReviewSchema = z.object({
  answerId: z.uuid(),
  pointsAwarded: z.number().nonnegative(),
  comment: z.string().trim().min(1).max(4_000),
});

export const submissionCorrectionReviewSchema = z
  .object({
    answers: z.array(discursiveAnswerReviewSchema).min(1).max(100),
    teacherComment: z.string().trim().min(1).max(8_000),
  })
  .refine(
    (review) =>
      new Set(review.answers.map((answer) => answer.answerId)).size ===
      review.answers.length,
    {
      path: ["answers"],
      message: "Cada resposta deve aparecer uma única vez.",
    },
  );

export const correctionHistorySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  answerId: z.uuid().nullable(),
  action: z.enum([
    "ai_suggestion",
    "ai_failure",
    "teacher_revision",
    "approval",
    "release",
    "release_failure",
  ]),
  origin: z.enum(["fixture", "openai", "teacher", "system"]),
  model: z.string().nullable(),
  pointsAwarded: z.number().nonnegative().nullable(),
  grade: z.number().min(0).max(10).nullable(),
  comment: z.string().nullable(),
  requiresReview: z.boolean().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const activitySubmissionAnswerSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid().nullable(),
  externalQuestionId: z.string().min(1),
  questionPosition: z.number().int().nonnegative().nullable(),
  kind: activityQuestionKindSchema.nullable(),
  prompt: z.string().nullable(),
  answerText: z.string().nullable(),
  status: activityAnswerStatusSchema,
  isCorrect: z.boolean().nullable(),
  pointsAwarded: z.number().nonnegative().nullable(),
  pointsPossible: z.number().nonnegative().nullable(),
  reviewReason: z.string().nullable(),
  suggestedPointsAwarded: z.number().nonnegative().nullable(),
  suggestedComment: z.string().nullable(),
  suggestionRequiresReview: z.boolean().nullable(),
  teacherComment: z.string().nullable(),
});

export const activitySubmissionSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  studentId: z.uuid().nullable(),
  studentName: z.string().nullable(),
  externalResponseId: z.string().min(1),
  respondentEmail: z.email().nullable(),
  submittedAt: z.iso.datetime(),
  status: activitySubmissionStatusSchema,
  manualReviewReason: z.string().nullable(),
  objectivePointsAwarded: z.number().nonnegative(),
  objectivePointsPossible: z.number().nonnegative(),
  grade: z.number().min(0).max(10).nullable(),
  correctionStatus: submissionCorrectionStatusSchema,
  teacherComment: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  releasedAt: z.iso.datetime().nullable(),
  classroomReturnStatus: classroomReturnStatusSchema,
  classroomReturnErrorCode: z.string().nullable(),
  correctionHistory: z.array(correctionHistorySchema),
  answers: z.array(activitySubmissionAnswerSchema),
});

export const activityCollectionSummarySchema = z.object({
  activityId: z.uuid(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  scheduledAt: z.iso.datetime(),
  attemptCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  submissionCount: z.number().int().nonnegative(),
  gradedCount: z.number().int().nonnegative(),
  manualReviewCount: z.number().int().nonnegative(),
  submissions: z.array(activitySubmissionSchema),
});

export const feedbackScopeSchema = z.enum(["individual", "global"]);
export const feedbackStatusSchema = z.enum([
  "draft",
  "generated",
  "reviewed",
  "sent",
  "deleted",
]);

export const feedbackLinkInputSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: z.url(),
});

const feedbackInputBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(8_000),
  teacherObservation: z.string().trim().max(8_000).nullable().optional(),
  links: z.array(feedbackLinkInputSchema).max(20).default([]),
  materialIds: z
    .array(z.uuid())
    .max(20)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Cada material deve aparecer uma única vez.",
    }),
});

export const feedbackCreateSchema = z.discriminatedUnion("scope", [
  feedbackInputBaseSchema.extend({
    scope: z.literal("individual"),
    submissionId: z.uuid(),
  }),
  feedbackInputBaseSchema.extend({
    scope: z.literal("global"),
    classId: z.uuid(),
  }),
]);

export const feedbackUpdateSchema = feedbackInputBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo editável.",
  });

export const feedbackSuggestionSchema = z.object({
  strengths: z.array(z.string().trim().min(1).max(1_000)).min(1).max(10),
  improvements: z.array(z.string().trim().min(1).max(1_000)).min(1).max(10),
  message: z.string().trim().min(1).max(8_000),
});

export const feedbackReviewSchema = z.object({
  generationId: z.uuid(),
  content: z.string().trim().min(1).max(8_000),
  teacherObservation: z.string().trim().min(1).max(8_000),
});

export const feedbackGenerationSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  model: z.string().min(1),
  origin: z.enum(["fixture", "openai"]),
  status: z.enum(["succeeded", "failed"]),
  suggestion: feedbackSuggestionSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const feedbackHistorySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  action: z.enum([
    "created",
    "ai_suggestion",
    "ai_failure",
    "teacher_revision",
    "teacher_edit",
    "sent",
    "deleted",
  ]),
  origin: z.enum(["teacher", "fixture", "openai", "system"]),
  createdAt: z.iso.datetime(),
});

export const feedbackSchema = z.object({
  id: z.uuid(),
  scope: feedbackScopeSchema,
  submissionId: z.uuid().nullable(),
  studentId: z.uuid().nullable(),
  studentName: z.string().nullable(),
  activityId: z.uuid().nullable(),
  activityTitle: z.string().nullable(),
  classId: z.uuid().nullable(),
  className: z.string().nullable(),
  title: z.string().min(1),
  content: z.string().min(1),
  teacherObservation: z.string().nullable(),
  origin: z.enum(["manual", "fixture", "openai"]),
  status: feedbackStatusSchema,
  editableUntil: z.iso.datetime(),
  canEdit: z.boolean(),
  sentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  links: z.array(feedbackLinkInputSchema.extend({ id: z.uuid() })),
  attachments: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().min(1),
      category: materialCategorySchema,
    }),
  ),
  latestGeneration: feedbackGenerationSchema.nullable(),
  history: z.array(feedbackHistorySchema),
  notification: z
    .object({
      channel: z.enum(["google_classroom", "email"]),
      status: z.enum(["pending", "sent", "failed"]),
      errorCode: z.string().nullable(),
    })
    .nullable(),
});

export const eligibleFeedbackSubmissionSchema = z.object({
  id: z.uuid(),
  studentName: z.string().min(1),
  activityTitle: z.string().min(1),
  grade: z.number().min(0).max(10),
  correctionStatus: z.enum(["approved", "released"]),
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
export type MilestoneType = z.infer<typeof milestoneTypeSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type MilestoneCreate = z.infer<typeof milestoneCreateSchema>;
export type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema>;
export type MaterialCategory = z.infer<typeof materialCategorySchema>;
export type Material = z.infer<typeof materialSchema>;
export type MaterialInput = z.infer<typeof materialInputSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type LessonPlanInput = z.infer<typeof lessonPlanInputSchema>;
export type LessonPlanUpdate = z.infer<typeof lessonPlanUpdateSchema>;
export type LessonPlanStatus = z.infer<typeof lessonPlanStatusSchema>;
export type LessonPlanSuggestion = z.infer<typeof lessonPlanSuggestionSchema>;
export type LessonPlanGeneration = z.infer<typeof lessonPlanGenerationSchema>;
export type LessonPlanReview = z.infer<typeof lessonPlanReviewSchema>;
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ActivityDifficulty = z.infer<typeof activityDifficultySchema>;
export type LatePolicy = z.infer<typeof latePolicySchema>;
export type ActivityQuestionInput = z.infer<typeof activityQuestionInputSchema>;
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;
export type ActivityQuestion = z.infer<typeof activityQuestionSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type ActivitySuggestion = z.infer<typeof activitySuggestionSchema>;
export type ActivityGenerationRequest = z.infer<
  typeof activityGenerationRequestSchema
>;
export type ActivityGeneration = z.infer<typeof activityGenerationSchema>;
export type ActivityReview = z.infer<typeof activityReviewSchema>;
export type ActivityApproval = z.infer<typeof activityApprovalSchema>;
export type ActivityPublication = z.infer<typeof activityPublicationSchema>;
export type ActivitySubmissionStatus = z.infer<
  typeof activitySubmissionStatusSchema
>;
export type ActivityAnswerStatus = z.infer<typeof activityAnswerStatusSchema>;
export type SubmissionCorrectionStatus = z.infer<
  typeof submissionCorrectionStatusSchema
>;
export type ClassroomReturnStatus = z.infer<typeof classroomReturnStatusSchema>;
export type CorrectionRigour = z.infer<typeof correctionRigourSchema>;
export type DiscursiveCorrectionSuggestion = z.infer<
  typeof discursiveCorrectionSuggestionSchema
>;
export type DiscursiveCorrectionGenerate = z.infer<
  typeof discursiveCorrectionGenerateSchema
>;
export type SubmissionCorrectionReview = z.infer<
  typeof submissionCorrectionReviewSchema
>;
export type CorrectionHistory = z.infer<typeof correctionHistorySchema>;
export type ActivitySubmissionAnswer = z.infer<
  typeof activitySubmissionAnswerSchema
>;
export type ActivitySubmission = z.infer<typeof activitySubmissionSchema>;
export type ActivityCollectionSummary = z.infer<
  typeof activityCollectionSummarySchema
>;
export type FeedbackScope = z.infer<typeof feedbackScopeSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackLinkInput = z.infer<typeof feedbackLinkInputSchema>;
export type FeedbackCreate = z.infer<typeof feedbackCreateSchema>;
export type FeedbackUpdate = z.infer<typeof feedbackUpdateSchema>;
export type FeedbackSuggestion = z.infer<typeof feedbackSuggestionSchema>;
export type FeedbackReview = z.infer<typeof feedbackReviewSchema>;
export type FeedbackGeneration = z.infer<typeof feedbackGenerationSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type EligibleFeedbackSubmission = z.infer<
  typeof eligibleFeedbackSubmissionSchema
>;
export type LiveResponse = z.infer<typeof liveResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export function successSchema<T extends z.ZodType>(data: T) {
  return z.object({ data });
}
