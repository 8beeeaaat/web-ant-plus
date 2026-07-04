import { afterEach, describe, expect, it } from "vitest";
import { Constants } from "./constants.js";
import { type ChannelParticipant, USBDriver } from "./driver.js";
import { ProtocolError } from "./errors.js";
import * as messages from "./messages.js";
import {
  FakeUSB,
  FakeUSBDevice,
  type HandshakeOptions,
  installFakeUsb,
} from "./testing/fakeUsb.js";

let restoreNavigator: (() => void) | undefined;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = undefined;
});

function installDevices(devices: readonly FakeUSBDevice[]): void {
  restoreNavigator = installFakeUsb(new FakeUSB(devices));
}

async function openDriver(
  options?: HandshakeOptions,
): Promise<{ device: FakeUSBDevice; driver: USBDriver }> {
  const device = new FakeUSBDevice();
  device.respondToHandshake(options);
  const driver = USBDriver.fromDevice(device.asDevice());
  await driver.open();
  return { device, driver };
}

function fakeSensor(): ChannelParticipant {
  return { detach: async () => {} };
}

describe("USBDriver.getPairedDevices", () => {
  it("returns only devices matching both vendor and product id", async () => {
    // Regression: the legacy v2 filter was mis-parenthesized and accepted
    // any device with productId 0x1009, regardless of vendor.
    installDevices([
      new FakeUSBDevice(0x0fcf, 0x1008),
      new FakeUSBDevice(0x0fcf, 0x1009),
      new FakeUSBDevice(0x1234, 0x1009),
      new FakeUSBDevice(0x0fcf, 0x9999),
    ]);

    const paired = await USBDriver.getPairedDevices();

    expect(paired.map((device) => [device.vendorId, device.productId])).toEqual(
      [
        [0x0fcf, 0x1008],
        [0x0fcf, 0x1009],
      ],
    );
  });

  it("fromPairedDevice returns the first paired driver or undefined", async () => {
    const device = new FakeUSBDevice();
    installDevices([device]);

    const driver = await USBDriver.fromPairedDevice();

    expect(driver?.device).toBe(device.asDevice());

    installDevices([]);
    await expect(USBDriver.fromPairedDevice()).resolves.toBeUndefined();
  });
});

describe("USBDriver.requestDevice", () => {
  it("requests a supported device using the supported filters", async () => {
    const device = new FakeUSBDevice();
    installDevices([device]);

    const driver = await USBDriver.requestDevice();

    expect(driver.device).toBe(device.asDevice());
  });
});

describe("USBDriver.open", () => {
  it("resolves after the handshake and applies the capabilities frame", async () => {
    const { device, driver } = await openDriver({
      maxChannels: 4,
      canScan: true,
    });

    expect(driver.maxChannels).toBe(4);
    expect(driver.canScan).toBe(true);
    // reset -> capabilities request -> network key
    expect(device.sentMessageIds).toEqual([0x4a, 0x4d, 0x46]);
  });

  it("reports canScan false when the capabilities bits are unset", async () => {
    const { driver } = await openDriver({ maxChannels: 8, canScan: false });

    expect(driver.maxChannels).toBe(8);
    expect(driver.canScan).toBe(false);
  });

  it("throws when the interface is missing", async () => {
    const device = new FakeUSBDevice();
    Object.defineProperty(device, "configuration", {
      value: { interfaces: [] },
    });
    const driver = USBDriver.fromDevice(device.asDevice());

    await expect(driver.open()).rejects.toThrow("No interface found");
  });

  it("throws when endpoints are missing", async () => {
    const device = new FakeUSBDevice();
    Object.defineProperty(device, "configuration", {
      value: {
        interfaces: [
          {
            interfaceNumber: Constants.USB_INTERFACE_NUMBER,
            alternate: { endpoints: [] },
          },
        ],
      },
    });
    const driver = USBDriver.fromDevice(device.asDevice());

    await expect(driver.open()).rejects.toThrow("No endpoints found");
  });
});

describe("channel bookkeeping", () => {
  it("attach succeeds up to maxChannels and detach frees a slot", async () => {
    const { driver } = await openDriver({ maxChannels: 2 });
    const first = fakeSensor();
    const second = fakeSensor();
    const third = fakeSensor();

    expect(driver.attach(first, false)).toBe(true);
    expect(driver.attach(second, false)).toBe(true);
    expect(driver.attach(third, false)).toBe(false);

    expect(driver.detach(second)).toBe(true);
    expect(driver.attach(third, false)).toBe(true);
  });

  it("scan attach only succeeds when no channels are in use", async () => {
    const { driver } = await openDriver({ maxChannels: 2 });
    const regular = fakeSensor();
    const scanner = fakeSensor();

    expect(driver.attach(regular, false)).toBe(true);
    expect(driver.attach(scanner, true)).toBe(false);

    expect(driver.detach(regular)).toBe(true);
    expect(driver.attach(scanner, true)).toBe(true);
    expect(driver.isScanning()).toBe(true);
    expect(driver.attach(regular, false)).toBe(false);

    expect(driver.detach(scanner)).toBe(true);
    expect(driver.isScanning()).toBe(false);
    expect(driver.attach(regular, false)).toBe(true);
  });

  it("detach returns false for a sensor that was never attached", async () => {
    const { driver } = await openDriver({ maxChannels: 2 });

    expect(driver.detach(fakeSensor())).toBe(false);
  });
});

describe("USBDriver.write", () => {
  it("throws before the device has been opened", async () => {
    const driver = USBDriver.fromDevice(new FakeUSBDevice().asDevice());

    await expect(driver.write(messages.openChannel(0))).rejects.toThrow(
      "No out endpoint",
    );
  });

  it("sends the exact frame bytes to the out endpoint", async () => {
    const { device, driver } = await openDriver();

    await driver.write(messages.openChannel(0));

    expect(Array.from(device.sentMessages.at(-1) ?? [])).toEqual([
      0xa4, 0x01, 0x4b, 0x00, 0xee,
    ]);
  });
});

describe("USBDriver.close", () => {
  it("resets, closes the device and emits shutdown", async () => {
    const { device, driver } = await openDriver();
    const shutdown = new Promise<void>((resolve) => {
      driver.once("shutdown", resolve);
    });

    await driver.close();

    await shutdown;
    expect(device.opened).toBe(false);
    expect(device.sentMessageIds).toContain(Constants.MESSAGE_SYSTEM_RESET);
  });

  it("returns after reset when the device is already closed", async () => {
    const { device, driver } = await openDriver();

    await device.close();
    await driver.close();

    expect(device.opened).toBe(false);
  });
});

describe("read loop", () => {
  it("emits a queued broadcast frame via the read event", async () => {
    const { device, driver } = await openDriver();
    const read = new Promise<DataView>((resolve) => {
      driver.once("read", resolve);
    });

    device.queueResponse(messages.broadcastData(0, [1, 2, 3, 4, 5, 6, 7, 8]));

    const data = await read;
    expect(Array.from(new Uint8Array(data.buffer))).toEqual([
      0xa4, 0x09, 0x4e, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 0xeb,
    ]);
  });

  it("rejects a frame with an invalid checksum", async () => {
    const { device, driver } = await openDriver();
    const error = new Promise<unknown>((resolve) => {
      driver.once("error", resolve);
    });
    const frame = new Uint8Array(
      messages.broadcastData(0, [1, 2, 3, 4, 5, 6, 7, 8]).buffer,
    );
    frame[frame.length - 1] = (frame[frame.length - 1] ?? 0) ^ 0xff;

    device.queueResponse(new DataView(frame.buffer));

    await expect(error).resolves.toBeInstanceOf(ProtocolError);
  });

  it("reports a missing sync byte as a protocol error", async () => {
    const { device, driver } = await openDriver();
    const error = new Promise<unknown>((resolve) => {
      driver.once("error", resolve);
    });

    device.queueResponse(new DataView(Uint8Array.from([0x00]).buffer));

    await expect(error).resolves.toBeInstanceOf(ProtocolError);
  });

  it("combines a leftover partial frame with the next transfer", async () => {
    const { device, driver } = await openDriver();
    const read = new Promise<DataView>((resolve) => {
      driver.once("read", resolve);
    });
    const frame = new Uint8Array(
      messages.broadcastData(0, [1, 2, 3, 4, 5, 6, 7, 8]).buffer,
    );

    device.queueResponse(new DataView(frame.buffer.slice(0, 3)));
    device.queueResponse(new DataView(frame.buffer.slice(3)));

    await expect(read).resolves.toBeInstanceOf(DataView);
  });

  it("stores a one byte leftover at the end of a transfer", async () => {
    const { device, driver } = await openDriver();
    const read = new Promise<DataView>((resolve) => {
      driver.once("read", resolve);
    });
    const frame = new Uint8Array(
      messages.broadcastData(0, [1, 2, 3, 4, 5, 6, 7, 8]).buffer,
    );
    const combined = new Uint8Array(frame.length + 1);
    combined.set(frame);
    combined[combined.length - 1] = Constants.MESSAGE_TX_SYNC;

    device.queueResponse(new DataView(combined.buffer));

    await expect(read).resolves.toBeInstanceOf(DataView);
  });
});
