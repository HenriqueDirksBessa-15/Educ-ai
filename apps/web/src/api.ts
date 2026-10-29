import { errorMessage } from "./labels.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

// Error whose message is already safe to show to the teacher; `code` keeps
// the API code for callers that need a more specific message.
export class ApiError extends Error {
  constructor(
    readonly code: string | undefined,
    // Mensagem da API, para recusas de regra de negócio que já dizem o que fazer.
    readonly serverMessage?: string,
  ) {
    super(errorMessage(code));
    this.name = "ApiError";
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) throw new ApiError(body?.error?.code, body?.error?.message);
  return body?.data as T;
}

export const json = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
