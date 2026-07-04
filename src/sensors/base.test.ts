import { describe, expect, it, vi } from "vitest";
import { Constants } from "../constants.js";
import type { ChannelParticipant, USBDriverEvents } from "../driver.js";
import { ChannelStateError } from "../errors.js";
import { TypedEventEmitter } from "../lib/TypedEventEmitter.js";
import type { AntMessage } from "../messages.js";
import * as messages from "../messages.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type AttachOptions,
  type ScanState,
  type SensorState,
} from "./base.js";

interface TestState extends SensorState {
  readonly value?: number;
}

interface TestScanState extends TestState, ScanState {}

class RecordingDriver extends TypedEventEmitter<USBDriverEvents> {
  readonly writes: AntMessage[] = [];
  readonly attached: Array<{ sensor: ChannelParticipant; forScan: boolean }> =
    [];
  readonly detached: ChannelParticipant[] = [];
  maxChannels = 8;
  canScan = true;
  scanning = false;
  attachResult = true;

  attach(sensor: ChannelParticipant, forScan: boolean): boolean {
    if (!this.attachResult) {
      return false;
    }
    this.attached.push({ sensor, forScan });
    if (forScan) {
      this.scanning = true;
    }
    return true;
  }

  detach(sensor: ChannelParticipant): boolean {
    this.detached.push(sensor);
    this.scanning = false;
    return true;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  async write(data: AntMessage): Promise<void> {
    this.writes.push(data);
  }
}

class TestSensor extends AntPlusSensor<TestState> {
  static readonly deviceType = 0x42;
  protected readonly deviceType = TestSensor.deviceType;
  protected readonly period = 0x1234;

  protected createState(deviceId: number): TestState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<TestState>,
    data: DataView,
  ): TestState | undefined {
    const value = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);
    return value === 0xff ? undefined : { ...state, value };
  }

  sendPayload(payload: readonly number[]): Promise<boolean> {
    return this.sendAcknowledgedData(payload);
  }
}

class TestScanner extends AntPlusScanner<TestScanState> {
  static readonly deviceType = 0x42;
  protected readonly deviceType = TestScanner.deviceType;

  protected createState(deviceId: number): TestScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<TestScanState>,
    data: DataView,
  ): TestScanState | undefined {
    const value = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);
    return value === 0xff ? undefined : { ...state, value };
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function emitStatus(
  driver: RecordingDriver,
  message: number,
  code: number = Constants.RESPONSE_NO_ERROR,
  channel: number = 0,
): void {
  driver.emit(
    "read",
    messages.buildMessage(
      [channel, message, code],
      Constants.MESSAGE_CHANNEL_EVENT,
    ),
  );
}

function messageIds(driver: RecordingDriver): number[] {
  return driver.writes.map((write) =>
    write.getUint8(Constants.BUFFER_INDEX_MSG_TYPE),
  );
}

async function attachSensor(
  driver = new RecordingDriver(),
  options: AttachOptions = { channel: 0, deviceId: 123 },
): Promise<TestSensor> {
  const sensor = new TestSensor(driver as unknown as never);
  const attached = sensor.attach(options);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_ASSIGN);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_ID);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_FREQUENCY);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_PERIOD);
  await tick();
  emitStatus(driver, Constants.MESSAGE_LIB_CONFIG);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_OPEN);
  await attached;
  return sensor;
}

async function startScanner(
  driver = new RecordingDriver(),
): Promise<TestScanner> {
  const scanner = new TestScanner(driver as unknown as never);
  const scanning = scanner.scan();
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_ASSIGN);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_ID);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_FREQUENCY);
  await tick();
  emitStatus(driver, Constants.MESSAGE_ENABLE_RX_EXT);
  await tick();
  emitStatus(driver, Constants.MESSAGE_LIB_CONFIG);
  await tick();
  emitStatus(driver, Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN);
  await scanning;
  return scanner;
}

function channelIdFrame(
  channel: number,
  deviceId: number,
  transmissionType: number,
): AntMessage {
  return messages.buildMessage(
    [
      channel,
      deviceId & Constants.BYTE_MASK,
      (deviceId >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
      TestSensor.deviceType,
      transmissionType,
    ],
    Constants.MESSAGE_CHANNEL_ID,
  );
}

function extendedBroadcast(
  payload: readonly number[],
  options: {
    channel?: number;
    deviceId?: number;
    deviceType?: number;
    flags?: number;
    rssiType?: number;
  } = {},
): DataView {
  const {
    channel = 0,
    deviceId = 456,
    deviceType = TestScanner.deviceType,
    flags = Constants.EXT_MSG_DEVICE_ID_FLAG | Constants.EXT_MSG_RSSI_FLAG,
    rssiType = Constants.EXT_MSG_RSSI_TYPE_DBM,
  } = options;
  return new DataView(
    Uint8Array.from([
      0xa4,
      0x10,
      Constants.MESSAGE_CHANNEL_BROADCAST_DATA,
      channel,
      ...payload,
      flags,
      deviceId & Constants.BYTE_MASK,
      (deviceId >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
      deviceType,
      0,
      rssiType,
      0xf0,
      0xe0,
    ]).buffer,
  );
}

describe("AntPlusSensor", () => {
  it("runs the attach handshake and emits attached", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver, {
      channel: 0,
      deviceId: 123,
      transmissionType: 7,
      timeout: 10,
    });

    expect(sensor.channel).toBe(0);
    expect(sensor.deviceId).toBe(123);
    expect(sensor.transmissionType).toBe(7);
    expect(driver.attached).toEqual([{ sensor, forScan: false }]);
    expect(messageIds(driver)).toEqual([
      Constants.MESSAGE_CHANNEL_ASSIGN,
      Constants.MESSAGE_CHANNEL_ID,
      Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT,
      Constants.MESSAGE_CHANNEL_FREQUENCY,
      Constants.MESSAGE_CHANNEL_PERIOD,
      Constants.MESSAGE_LIB_CONFIG,
      Constants.MESSAGE_CHANNEL_OPEN,
    ]);
  });

  it("rejects attach when already attached or driver refuses the channel", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver);

    await expect(sensor.attach({ channel: 1, deviceId: 1 })).rejects.toThrow(
      ChannelStateError,
    );

    const refusedDriver = new RecordingDriver();
    refusedDriver.attachResult = false;
    await expect(
      new TestSensor(refusedDriver as unknown as never).attach({
        channel: 0,
        deviceId: 1,
      }),
    ).rejects.toThrow("cannot attach");
  });

  it("decodes data, updates the paired device id and ignores other channels", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver, { channel: 0, deviceId: 0 });
    const received: TestState[] = [];
    sensor.on("data", (state) => received.push(state));

    driver.emit("read", channelIdFrame(0, 0x1234, 9));
    await tick();
    driver.emit("read", messages.broadcastData(1, [99, 0, 0, 0, 0, 0, 0, 0]));
    await tick();
    driver.emit("read", messages.broadcastData(0, [42, 0, 0, 0, 0, 0, 0, 0]));
    await tick();
    driver.emit(
      "read",
      messages.acknowledgedData(0, [0xff, 0, 0, 0, 0, 0, 0, 0]),
    );
    await tick();

    expect(sensor.deviceId).toBe(0x1234);
    expect(sensor.transmissionType).toBe(9);
    expect(received).toEqual([{ deviceId: 0x1234, value: 42 }]);
  });

  it("emits unhandled channel events", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver);
    const events: unknown[] = [];
    sensor.on("eventData", (event) => events.push(event));

    emitStatus(driver, Constants.MESSAGE_RF, Constants.EVENT_CHANNEL_COLLISION);
    await tick();

    expect(events).toEqual([
      {
        message: Constants.MESSAGE_RF,
        code: Constants.EVENT_CHANNEL_COLLISION,
      },
    ]);
  });

  it("queues acknowledged messages and resolves from transfer status", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver);
    const before = driver.writes.length;

    const failed = sensor.sendPayload([1, 2, 3, 4, 5, 6, 7, 8]);
    const completed = sensor.sendPayload([8, 7, 6, 5, 4, 3, 2, 1]);
    await tick();

    expect(driver.writes).toHaveLength(before + 1);

    emitStatus(
      driver,
      Constants.MESSAGE_RF,
      Constants.EVENT_TRANSFER_TX_FAILED,
    );
    await tick();

    expect(await failed).toBe(false);
    expect(driver.writes).toHaveLength(before + 2);

    emitStatus(
      driver,
      Constants.MESSAGE_RF,
      Constants.EVENT_TRANSFER_TX_COMPLETED,
    );

    await expect(completed).resolves.toBe(true);
  });

  it("throws when sending acknowledged data before attach", async () => {
    const sensor = new TestSensor(new RecordingDriver() as unknown as never);

    await expect(sensor.sendPayload([1])).rejects.toThrow("not attached");
  });

  it("detaches via close and unassign status, and no-ops when already detached", async () => {
    const driver = new RecordingDriver();
    const sensor = await attachSensor(driver);
    const detached = new Promise<void>((resolve) =>
      sensor.once("detached", resolve),
    );
    const before = driver.writes.length;

    await sensor.detach();
    expect(driver.writes).toHaveLength(before + 1);
    expect(messageIds(driver).at(-1)).toBe(Constants.MESSAGE_CHANNEL_CLOSE);

    emitStatus(driver, Constants.MESSAGE_RF, Constants.EVENT_CHANNEL_CLOSED);
    await tick();
    expect(messageIds(driver).at(-1)).toBe(Constants.MESSAGE_CHANNEL_UNASSIGN);

    emitStatus(driver, Constants.MESSAGE_CHANNEL_UNASSIGN);
    await detached;

    expect(sensor.channel).toBeUndefined();
    expect(driver.detached).toContain(sensor);

    await sensor.detach();
    expect(driver.writes).toHaveLength(before + 2);
  });
});

describe("AntPlusScanner", () => {
  it("runs the scan handshake and records scanned states with RSSI", async () => {
    const driver = new RecordingDriver();
    const scanner = await startScanner(driver);
    const received: TestScanState[] = [];
    scanner.on("data", (state) => received.push(state));

    driver.emit("read", extendedBroadcast([24, 0, 0, 0, 0, 0, 0, 0]));
    await tick();

    expect(driver.attached).toEqual([{ sensor: scanner, forScan: true }]);
    expect(messageIds(driver)).toEqual([
      Constants.MESSAGE_CHANNEL_ASSIGN,
      Constants.MESSAGE_CHANNEL_ID,
      Constants.MESSAGE_CHANNEL_FREQUENCY,
      Constants.MESSAGE_ENABLE_RX_EXT,
      Constants.MESSAGE_LIB_CONFIG,
      Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN,
    ]);
    expect(received).toEqual([
      { deviceId: 456, rssi: -16, threshold: -32, value: 24 },
    ]);
    expect(scanner.states.get(456)).toEqual(received[0]);
  });

  it("emits attached immediately when the driver is already scanning", async () => {
    const driver = new RecordingDriver();
    driver.scanning = true;
    const scanner = new TestScanner(driver as unknown as never);

    await scanner.scan();

    expect(driver.attached).toEqual([]);
    expect(scanner.channel).toBe(0);
  });

  it("rejects scan when unsupported or when the driver refuses attachment", async () => {
    const unsupported = new RecordingDriver();
    unsupported.canScan = false;
    await expect(
      new TestScanner(unsupported as unknown as never).scan(),
    ).rejects.toThrow("stick cannot scan");

    const refused = new RecordingDriver();
    refused.attachResult = false;
    await expect(
      new TestScanner(refused as unknown as never).scan(),
    ).rejects.toThrow("cannot attach");
  });

  it("ignores malformed, mismatched and unchanged scan messages", async () => {
    const driver = new RecordingDriver();
    const scanner = await startScanner(driver);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const received: TestScanState[] = [];
    scanner.on("data", (state) => received.push(state));

    driver.emit("read", messages.broadcastData(0, [1, 0, 0, 0, 0, 0, 0, 0]));
    await tick();
    driver.emit(
      "read",
      extendedBroadcast([2, 0, 0, 0, 0, 0, 0, 0], { deviceType: 0x99 }),
    );
    await tick();
    driver.emit(
      "read",
      extendedBroadcast([0xff, 0, 0, 0, 0, 0, 0, 0], {
        flags: Constants.EXT_MSG_DEVICE_ID_FLAG,
        rssiType: 0,
      }),
    );
    await tick();

    expect(warn).toHaveBeenCalledOnce();
    expect(received).toEqual([]);
    expect(scanner.states.get(456)).toEqual({ deviceId: 456 });

    warn.mockRestore();
  });

  it("rejects scan when already attached", async () => {
    const driver = new RecordingDriver();
    const scanner = await startScanner(driver);

    await expect(scanner.scan()).rejects.toThrow("already attached");
  });
});
