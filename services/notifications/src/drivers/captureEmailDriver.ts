import type { EmailDriver, EmailMessage } from './emailDriver';

export class CaptureEmailDriver implements EmailDriver {
  private readonly _sent: EmailMessage[] = [];

  send(msg: EmailMessage): Promise<void> {
    this._sent.push({ ...msg });
    return Promise.resolve();
  }

  get sent(): readonly EmailMessage[] {
    return this._sent;
  }

  clear(): void {
    this._sent.length = 0;
  }
}
