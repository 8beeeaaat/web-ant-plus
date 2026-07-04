import { describe, expect, it } from "vitest";
import { CancellationError, CancellationToken } from "./CancellationToken.js";

describe("CancellationToken", () => {
  it("throws once after cancellation and then clears the flag", () => {
    const token = new CancellationToken();

    expect(token.isCancelled).toBe(false);

    token.cancel();

    expect(token.isCancelled).toBe(true);
    expect(() => token.throwIfCancelled()).toThrow(CancellationError);
    expect(token.isCancelled).toBe(false);
    expect(() => token.throwIfCancelled()).not.toThrow();
  });

  it("uses the default cancellation error name and message", () => {
    const error = new CancellationError();

    expect(error.name).toBe("CancellationError");
    expect(error.message).toBe("Operation was cancelled");
  });
});
