import {
  materialFileMetadataSchema,
  materialLinkInputSchema,
  materialListQuerySchema,
  milestoneCreateSchema,
  milestoneUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import type { TimelineRepository } from "./repository.js";
import { MaterialUploadError } from "./service.js";
import type { MaterialService } from "./service.js";

export function registerTimelineRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    timelineRepository: TimelineRepository;
    materialService: MaterialService;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = async (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get("/api/timeline/milestones", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return {
      data: await dependencies.timelineRepository.listMilestones(
        user.professorId,
      ),
    };
  });

  app.post<{ Body: unknown }>(
    "/api/timeline/milestones",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = milestoneCreateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      try {
        const id = await dependencies.timelineRepository.createMilestone(
          user.professorId,
          parsed.data,
        );
        return reply.code(201).send({ data: { id } });
      } catch (error) {
        if (error instanceof Error && error.message === "CLASS_NOT_FOUND")
          return notFound(reply, "Turma não encontrada.");
        throw error;
      }
    },
  );

  app.patch<{ Params: { milestoneId: string }; Body: unknown }>(
    "/api/timeline/milestones/:milestoneId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = milestoneUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.timelineRepository.updateMilestone(
        user.professorId,
        request.params.milestoneId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Marco não encontrado.");
      if (result === "past")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Marcos passados não podem ser editados.",
          },
        });
      return { data: { updated: true } };
    },
  );

  app.delete<{
    Params: { milestoneId: string };
    Querystring: { confirm?: string };
  }>("/api/timeline/milestones/:milestoneId", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const result = await dependencies.timelineRepository.deleteMilestone(
      user.professorId,
      request.params.milestoneId,
      request.query.confirm === "true",
    );
    if (result === "not_found") return notFound(reply, "Marco não encontrado.");
    if (result === "confirmation_required")
      return reply.code(409).send({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Confirme a exclusão do marco vinculado a conteúdo publicado.",
        },
      });
    return reply.code(204).send();
  });

  app.get<{ Querystring: unknown }>(
    "/api/materials",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const query = materialListQuerySchema.safeParse(request.query);
      if (!query.success) return validationError(reply);
      return {
        data: await dependencies.timelineRepository.listMaterials(
          user.professorId,
          query.data.category,
          query.data.archived ?? false,
        ),
      };
    },
  );

  const createMaterialLink = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = materialLinkInputSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const id = await dependencies.timelineRepository.createMaterialLink(
        user.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "MATERIAL_RELATION_NOT_FOUND"
      )
        return notFound(reply, "Uma turma ou habilidade não foi encontrada.");
      throw error;
    }
  };

  app.post("/api/materials/links", createMaterialLink);
  app.post("/api/materials", createMaterialLink);

  app.post("/api/materials/files", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    try {
      const upload = await request.file({
        limits: {
          fields: 1,
          files: 1,
          parts: 2,
          fileSize: dependencies.config.materialUploadMaxBytes,
        },
        throwFileSizeLimit: false,
      });
      if (!upload) return validationError(reply);
      const metadataPart = upload.fields.metadata;
      if (
        !metadataPart ||
        Array.isArray(metadataPart) ||
        metadataPart.type !== "field" ||
        typeof metadataPart.value !== "string"
      ) {
        await discard(upload.file);
        return validationError(reply);
      }
      let rawMetadata: unknown;
      try {
        rawMetadata = JSON.parse(metadataPart.value);
      } catch {
        await discard(upload.file);
        return validationError(reply);
      }
      const metadata = materialFileMetadataSchema.safeParse(rawMetadata);
      if (!metadata.success) {
        await discard(upload.file);
        return validationError(reply);
      }
      const id = await dependencies.materialService.upload({
        professorId: user.professorId,
        metadata: metadata.data,
        fileName: upload.filename,
        mimeType: upload.mimetype,
        stream: upload.file,
        wasTruncated: () => upload.file.truncated,
      });
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (error instanceof MaterialUploadError) {
        if (error.code === "MATERIAL_FILE_TOO_LARGE")
          return reply.code(413).send({
            error: {
              code: "VALIDATION_ERROR",
              message: `O arquivo excede o limite configurado de ${formatMegabytes(dependencies.config.materialUploadMaxBytes)} MB.`,
            },
          });
        if (error.code === "MATERIAL_FILE_INVALID")
          return reply.code(415).send({
            error: {
              code: "VALIDATION_ERROR",
              message: "Tipo ou nome de arquivo não permitido.",
            },
          });
        return notFound(reply, "Uma turma ou habilidade não foi encontrada.");
      }
      throw error;
    }
  });

  app.get<{ Params: { materialId: string } }>(
    "/api/materials/:materialId/file",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      if (!z.guid().safeParse(request.params.materialId).success)
        return validationError(reply);
      const file = await dependencies.materialService.download(
        user.professorId,
        request.params.materialId,
      );
      if (!file) return notFound(reply, "Arquivo não encontrado.");
      return reply
        .header("content-type", file.mimeType)
        .header("content-length", file.sizeBytes)
        .header("content-disposition", attachmentHeader(file.fileName))
        .header("cache-control", "private, no-store")
        .send(file.stream);
    },
  );

  app.post<{ Params: { materialId: string } }>(
    "/api/materials/:materialId/archive",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const archived = await dependencies.timelineRepository.archiveMaterial(
        user.professorId,
        request.params.materialId,
      );
      if (!archived) return notFound(reply, "Material não encontrado.");
      return { data: { archived: true } };
    },
  );

  app.delete<{ Params: { materialId: string } }>(
    "/api/materials/:materialId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.materialService.delete(
        user.professorId,
        request.params.materialId,
      );
      if (result === "not_found")
        return notFound(reply, "Material não encontrado.");
      if (result === "linked")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Material vinculado a conteúdo publicado não pode ser apagado.",
          },
        });
      return reply.code(204).send();
    },
  );
}

function attachmentHeader(fileName: string): string {
  const fallback = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function discard(stream: Readable): Promise<void> {
  stream.resume();
  await finished(stream);
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1_048_576).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
}

function validationError(reply: {
  code: (status: number) => { send: (value: unknown) => unknown };
}) {
  return reply
    .code(400)
    .send({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos." } });
}

function notFound(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  message: string,
) {
  return reply.code(404).send({ error: { code: "NOT_FOUND", message } });
}
