import { describe, expect, it } from "vitest";
import { Constants } from "../constants.js";
import { buildMessage } from "../messages.js";
import { FakeUSB, FakeUSBDevice, installFakeUsb } from "./fakeUsb.js";

describe("FakeUSBDevice", () => {
  it("queues responses until transferIn consumes them", async () => {
    const device = new FakeUSBDevice();
    const response = buildMessage([0x01], Constants.MESSAGE_STARTUP);

    device.queueResponse(response);

    await expect(device.transferIn(1, 64)).resolves.toEqual({
      status: "ok",
      data: response,
    });
  });

  it("resolves a pending transferIn when a response is queued", async () => {
    const device = new FakeUSBDevice();
    const pending = device.transferIn(1, 64);
    const response = buildMessage([0x01], Constants.MESSAGE_STARTUP);

    device.queueResponse(response);

    await expect(pending).resolves.toEqual({ status: "ok", data: response });
  });

  it("rejects pending reads when closed", async () => {
    const device = new FakeUSBDevice();
    const pending = device.transferIn(1, 64);

    await device.close();

    await expect(pending).rejects.toThrow("The device was disconnected.");
  });

  it("records transferOut from ArrayBuffer inputs", async () => {
    const device = new FakeUSBDevice();
    const data = Uint8Array.from([1, 2]).buffer;

    await expect(device.transferOut(2, data)).resolves.toEqual({
      bytesWritten: 2,
      status: "ok",
    });

    expect(device.sentMessages).toEqual([Uint8Array.from([1, 2])]);
    expect(device.sentMessageIds).toEqual([
      Constants.USB_TRANSFER_MISSING_MESSAGE_ID,
    ]);
  });
});

describe("FakeUSB", () => {
  it("returns the first matching requested device and rejects when none match", async () => {
    const matching = new FakeUSBDevice(0x0fcf, 0x1008);
    const usb = new FakeUSB([new FakeUSBDevice(0x1234, 0x9999), matching]);

    await expect(
      usb.requestDevice({ filters: [{ vendorId: 0x0fcf }] }),
    ).resolves.toBe(matching.asDevice());
    await expect(
      usb.requestDevice({ filters: [{ vendorId: 0xabcd }] }),
    ).rejects.toThrow("No device selected.");
  });

  it("matches any device when filters are empty", async () => {
    const device = new FakeUSBDevice(0x1234, 0x9999);
    const usb = new FakeUSB([device]);

    await expect(usb.requestDevice({ filters: [] })).resolves.toBe(
      device.asDevice(),
    );
  });
});

describe("installFakeUsb", () => {
  it("restores an existing navigator descriptor", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const restore = installFakeUsb(new FakeUSB([]));

    expect(navigator.usb).toBeDefined();

    restore();

    expect(Object.getOwnPropertyDescriptor(globalThis, "navigator")).toEqual(
      original,
    );
  });

  it("removes navigator when there was no previous descriptor", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "navigator");
    const restore = installFakeUsb(new FakeUSB([]));

    restore();

    expect(Object.getOwnPropertyDescriptor(globalThis, "navigator")).toBe(
      undefined,
    );
    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    }
  });
});
