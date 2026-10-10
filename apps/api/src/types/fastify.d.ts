import type { Identity } from "@educai/contracts";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedIdentity?: Identity;
  }
}
