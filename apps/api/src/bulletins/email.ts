export type EmailAttachment = {
  fileName: string;
  contentType: string;
  content: Uint8Array;
};

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
  attachments?: EmailAttachment[];
};

export interface TransactionalEmailSender {
  readonly isFixture: boolean;
  send(message: TransactionalEmail): Promise<void>;
}

export type BulletinEmailSender = TransactionalEmailSender;

export class FixtureBulletinEmailSender implements TransactionalEmailSender {
  readonly isFixture = true;
  async send(_message: TransactionalEmail): Promise<void> {}
}

export class UnavailableBulletinEmailSender
  implements TransactionalEmailSender
{
  readonly isFixture = false;
  async send(_message: TransactionalEmail): Promise<void> {
    throw new BulletinEmailError("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
}

export class ResendEmailSender implements TransactionalEmailSender {
  readonly isFixture = false;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async send(message: TransactionalEmail): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          attachments: message.attachments?.map((attachment) => ({
            filename: attachment.fileName,
            content: Buffer.from(attachment.content).toString("base64"),
            content_type: attachment.contentType,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new BulletinEmailError("EMAIL_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok)
      throw new BulletinEmailError(normalizeResendStatus(response.status));
  }
}

export class BulletinEmailError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BulletinEmailError";
  }
}

function normalizeResendStatus(status: number): string {
  if (status === 401 || status === 403) return "EMAIL_CREDENTIAL_INVALID";
  if (status === 422) return "EMAIL_MESSAGE_INVALID";
  if (status === 429) return "EMAIL_RATE_LIMITED";
  return status >= 500
    ? "EMAIL_PROVIDER_UNAVAILABLE"
    : "EMAIL_DELIVERY_REJECTED";
}
