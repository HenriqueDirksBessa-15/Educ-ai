import type {
  ApiError,
  AuthSession,
  Identity,
  IntegrationStatus,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import { createCodeChallenge } from "./crypto.js";
import type { AuthRepository } from "./repository.js";
import type { GoogleGateway } from "./types.js";

type AuthRouteDependencies = {
  config: AppConfig;
  repository: AuthRepository;
  gateway: GoogleGateway;
};

type CallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
};

export function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: AuthRouteDependencies,
): void {
  const { config, repository, gateway } = dependencies;
  const cookieName = sessionCookieName(config.nodeEnv);

  app.get("/api/auth/google/start", async (_request, reply) => {
    if (!gateway.configured) {
      return sendError(
        reply,
        503,
        "INTEGRATION_UNAVAILABLE",
        "Login Google ainda não está configurado.",
      );
    }
    const authorization = await repository.createAuthorizationState();
    return reply
      .code(302)
      .header(
        "location",
        gateway.createAuthorizationUrl({
          state: authorization.state,
          codeChallenge: createCodeChallenge(authorization.codeVerifier),
        }),
      )
      .send();
  });

  app.get<{ Querystring: CallbackQuery }>(
    "/api/auth/google/callback",
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error) return redirectAuthResult(reply, config.webOrigin, error);
      if (!code || !state) {
        return redirectAuthResult(reply, config.webOrigin, "invalid_callback");
      }
      const codeVerifier = await repository.consumeAuthorizationState(state);
      if (!codeVerifier) {
        return redirectAuthResult(reply, config.webOrigin, "invalid_state");
      }

      try {
        const result = await gateway.exchangeCode(code, codeVerifier);
        const identity = await repository.upsertProfessor(result.profile);
        await repository.saveCredential(
          identity.professorId,
          result.credential,
        );
        const session = await repository.createSession(identity);
        reply.setCookie(cookieName, session.token, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: config.nodeEnv === "production",
          expires: session.expiresAt,
        });
        return redirectAuthResult(reply, config.webOrigin, "success");
      } catch (callbackError) {
        request.log.warn({ err: callbackError }, "google callback rejected");
        return redirectAuthResult(
          reply,
          config.webOrigin,
          "google_callback_failed",
        );
      }
    },
  );

  app.get(
    "/api/auth/session",
    async (request): Promise<{ data: AuthSession }> => {
      const identity = await resolveIdentity(request, repository, cookieName);
      return {
        data: identity
          ? { authenticated: true, identity }
          : { authenticated: false },
      };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) await repository.revokeSession(token);
    reply.clearCookie(cookieName, { path: "/" });
    return reply.code(204).send();
  });

  app.post("/api/auth/google/revoke", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      repository,
      cookieName,
    );
    if (!identity) return;
    const credential = await repository.getCredential(identity.professorId);
    const token = credential?.refreshToken ?? credential?.accessToken;
    if (token) await gateway.revoke(token);
    await repository.revokeProfessorAccess(identity.professorId);
    reply.clearCookie(cookieName, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/professor/shell", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      repository,
      cookieName,
    );
    if (!identity) return;
    return { data: { identity } };
  });

  app.get(
    "/api/integrations/status",
    async (request, reply): Promise<{ data: IntegrationStatus[] } | void> => {
      const identity = await requireIdentity(
        request,
        reply,
        repository,
        cookieName,
      );
      if (!identity) return;
      const statuses = await repository.latestIntegrationStatuses();
      return {
        data: statuses.map(
          ({ professorId: _professorId, attemptNumber: _attempt, ...status }) =>
            status,
        ),
      };
    },
  );
}

async function resolveIdentity(
  request: FastifyRequest,
  repository: AuthRepository,
  cookieName: string,
): Promise<Identity | null> {
  const token = request.cookies[cookieName];
  return token ? repository.resolveSession(token) : null;
}

export async function requireIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AuthRepository,
  cookieName: string,
): Promise<Identity | null> {
  const identity = await resolveIdentity(request, repository, cookieName);
  if (!identity) {
    sendError(reply, 401, "UNAUTHENTICATED", "Autenticação necessária.");
  }
  return identity;
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiError["error"]["code"],
  message: string,
) {
  const response: ApiError = { error: { code, message } };
  return reply.code(statusCode).send(response);
}

function redirectAuthResult(
  reply: FastifyReply,
  webOrigin: string,
  result: string,
) {
  const url = new URL(webOrigin);
  if (result === "success") url.searchParams.set("auth", "success");
  else url.searchParams.set("auth_error", result);
  return reply.code(302).header("location", url.toString()).send();
}

export function sessionCookieName(
  nodeEnvironment: AppConfig["nodeEnv"],
): string {
  return nodeEnvironment === "production"
    ? "__Host-educai_session"
    : "educai_session";
}
