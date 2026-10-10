export type BulletinEmail = {
  to: string;
  subject: string;
  text: string;
  fileName: string;
  pdf: Uint8Array;
};

export interface BulletinEmailSender {
  readonly isFixture: boolean;
  send(message: BulletinEmail): Promise<void>;
}

export class FixtureBulletinEmailSender implements BulletinEmailSender {
  readonly isFixture = true;
  async send(_message: BulletinEmail): Promise<void> {}
}

export class UnavailableBulletinEmailSender implements BulletinEmailSender {
  readonly isFixture = false;
  async send(_message: BulletinEmail): Promise<void> {
    throw new BulletinEmailError("EMAIL_PROVIDER_NOT_CONFIGURED");
  }
}

export class BulletinEmailError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BulletinEmailError";
  }
}
