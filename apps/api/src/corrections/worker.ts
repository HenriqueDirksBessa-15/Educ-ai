import type { FastifyBaseLogger } from "fastify";

import type { ActivityCollectionService } from "./collection.js";
import type { CorrectionsRepository } from "./repository.js";

export class ActivityCollectionWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: CorrectionsRepository,
    private readonly service: ActivityCollectionService,
    private readonly intervalMs: number,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.runCycle();
    this.timer = setInterval(() => void this.runCycle(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.repository.listDueCollections();
      for (const job of due) {
        const result = await this.service.collect(
          job.professorId,
          job.activityId,
        );
        if (result.status === "failed")
          this.logger.warn(
            { activityId: job.activityId, errorCode: result.errorCode },
            "activity collection failed",
          );
      }
    } catch (error) {
      this.logger.error({ err: error }, "activity collection cycle failed");
    } finally {
      this.running = false;
    }
  }
}
