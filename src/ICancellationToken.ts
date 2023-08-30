export interface ICancellationToken {
  cancelled(): void;
  cancel(): void;
}

export class CancellationToken implements ICancellationToken {
  get isCancelled(): boolean {
    return this._isCancelled;
  }
  _isCancelled: boolean = false;
  constructor() {}
  cancelled() {
    if (this._isCancelled) {
      this._isCancelled = false;
      throw new CancellationError();
    }
  }
  cancel() {
    this._isCancelled = true;
  }
}

export class CancellationError extends Error {
  constructor(message?: string) {
    super(message ?? "Operation was cancelled");
    this.name = "CancellationError";
  }
}
