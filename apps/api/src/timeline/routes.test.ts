import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import type { AppConfig } from "../config.js";
import { registerTimelineRoutes } from "./routes.js";
import type { TimelineRepository } from "./repository.js";
import type { MaterialService } from "./service.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function build() {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(cookie);
  await app.register(multipart, { throwFileSizeLimit: false });
  const authRepository = {
    resolveSession: vi.fn().mockResolvedValue({
      professorId,
      email: "professor@example.invalid",
      displayName: "Professor Teste",
      provider: "google",
    }),
  };
  const timelineRepository = {
    createMaterialLink: vi.fn().mockResolvedValue("material-id"),
    listMaterials: vi.fn().mockResolvedValue([]),
  };
  const materialService = {
    upload: vi
      .fn()
      .mockImplementation(async (input: { stream: AsyncIterable<unknown> }) => {
        for await (const chunk of input.stream) void chunk;
        return "file-material-id";
      }),
    download: vi.fn().mockResolvedValue({
      fileName: "guia.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      stream: Readable.from(Buffer.from("%PDF")),
    }),
    delete: vi.fn().mockResolvedValue("deleted"),
  };
  registerTimelineRoutes(app, {
    config: {
      nodeEnv: "test",
      materialUploadMaxBytes: 104_857_600,
    } as AppConfig,
    authRepository: authRepository as unknown as AuthRepository,
    timelineRepository: timelineRepository as unknown as TimelineRepository,
    materialService: materialService as unknown as MaterialService,
  });
  return { app, timelineRepository, materialService };
}

describe("material link routes", () => {
  it("creates a validated link for the session professor", async () => {
    const { app, timelineRepository } = await build();
    const payload = {
      title: "Guia",
      category: "reading",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: [],
      url: "https://example.invalid/guia",
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/materials/links",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": "application/json",
      },
      payload: {
        ...payload,
        professorId: "attacker",
        storageKey: "private/key",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(timelineRepository.createMaterialLink).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: "POST",
      url: "/api/materials/links",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": "application/json",
      },
      payload,
    });
    expect(accepted.statusCode).toBe(201);
    expect(timelineRepository.createMaterialLink).toHaveBeenCalledWith(
      professorId,
      payload,
    );
  }, 15_000);
});

describe("private material file routes", () => {
  it("streams an allowed file with server-owned storage metadata", async () => {
    const { app, materialService } = await build();
    const boundary = "educai-upload-boundary";
    const metadata = JSON.stringify({
      title: "Guia privado",
      category: "reading",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: [],
    });
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="guia.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n%PDF\r\n--${boundary}--\r\n`,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/materials/files",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    expect(materialService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        professorId,
        fileName: "guia.pdf",
        mimeType: "application/pdf",
        metadata: expect.objectContaining({ title: "Guia privado" }),
      }),
    );
  });

  it("returns a private attachment only through the authenticated route", async () => {
    const { app, materialService } = await build();
    const response = await app.inject({
      method: "GET",
      url: "/api/materials/21111111-1111-4111-8111-111111111111/file",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(
      'attachment; filename="guia.pdf"',
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toBe("%PDF");
    expect(materialService.download).toHaveBeenCalledWith(
      professorId,
      "21111111-1111-4111-8111-111111111111",
    );
  });

  it("streams files larger than the JSON body limit", async () => {
    const { app } = await build();
    const boundary = "educai-large-upload";
    const metadata = JSON.stringify({
      title: "Apresentação privada",
      category: "presentation",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: [],
    });
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aula.pptx"\r\n` +
        "Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n",
    );
    const body = Buffer.concat([
      prefix,
      Buffer.alloc(2 * 1_048_576, 0x41),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/api/materials/files",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
  });
});
