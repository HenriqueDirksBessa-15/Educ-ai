import type { DatabaseClient } from "../database.js";

export class AuditRepository {
  constructor(private readonly database: DatabaseClient) {}

  async record(input: {
    professorId: string | null;
    requestId: string;
    method: string;
    route: string;
    statusCode: number;
  }): Promise<void> {
    const resourceType = resourceFromRoute(input.route);
    await this.database.query(
      `INSERT INTO audit_event
        (professor_id, request_id, method, route, status_code,
         resource_type, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)`,
      [
        input.professorId,
        input.requestId,
        input.method,
        input.route,
        input.statusCode,
        resourceType,
        actionFromMethod(input.method),
      ],
    );
  }
}

function resourceFromRoute(route: string): string {
  const segment = route.split("?")[0]?.split("/").filter(Boolean)[1];
  return (segment || "unknown").slice(0, 80);
}

function actionFromMethod(method: string): string {
  return (
    {
      POST: "create_or_transition",
      PATCH: "update",
      PUT: "replace",
      DELETE: "delete",
    }[method] ?? "mutate"
  );
}
