import { describe, expect, it } from "vitest";
import {
  type BicyclePowerSensorState,
  decodeBicyclePower,
} from "./bicyclePower.js";

/**
 * Builds a raw broadcast message: [sync, len, msgType, channel, ...page].
 * The decoder reads the page starting at BUFFER_INDEX_MSG_DATA = 4.
 */
function antMessage(page: readonly number[]): DataView {
  const bytes = [0xa4, page.length, 0x4e, 0x00, ...page];
  return new DataView(new Uint8Array(bytes).buffer);
}

const initialState: BicyclePowerSensorState = { deviceId: 12345 };

describe("decodeBicyclePower", () => {
  describe("page 0x10 (standard power)", () => {
    it("decodes power, cadence and right/left pedal power", () => {
      // pedalPower = 0x9e -> bit 7 set, value 30 (right), left = 70
      // cadence = 90, accumulatedPower = 0x1234, power = 0x0122
      const data = antMessage([0x10, 0x01, 0x9e, 0x5a, 0x34, 0x12, 0x22, 0x01]);
      const next = decodeBicyclePower(initialState, data);
      expect(next.pedalPower).toBe(30);
      expect(next.rightPedalPower).toBe(30);
      expect(next.leftPedalPower).toBe(70);
      expect(next.cadence).toBe(90);
      expect(next.accumulatedPower).toBe(0x1234);
      expect(next.power).toBe(0x0122);
      expect(typeof next.receivedAt).toBe("number");
    });

    it("clears right/left split when the differentiation bit is unset", () => {
      const state: BicyclePowerSensorState = {
        deviceId: 12345,
        pedalPower: 30,
        rightPedalPower: 30,
        leftPedalPower: 70,
      };
      const data = antMessage([0x10, 0x02, 0x32, 0x5a, 0x00, 0x00, 0x00, 0x00]);
      const next = decodeBicyclePower(state, data);
      expect(next.pedalPower).toBe(50);
      expect(next.rightPedalPower).toBeUndefined();
      expect(next.leftPedalPower).toBeUndefined();
    });

    it("clears pedal power and cadence when marked invalid (0xff)", () => {
      const state: BicyclePowerSensorState = {
        deviceId: 12345,
        pedalPower: 30,
        rightPedalPower: 30,
        leftPedalPower: 70,
        cadence: 90,
      };
      const data = antMessage([0x10, 0x03, 0xff, 0xff, 0x10, 0x00, 0x20, 0x00]);
      const next = decodeBicyclePower(state, data);
      expect(next.pedalPower).toBeUndefined();
      expect(next.rightPedalPower).toBeUndefined();
      expect(next.leftPedalPower).toBeUndefined();
      expect(next.cadence).toBeUndefined();
      expect(next.accumulatedPower).toBe(0x10);
      expect(next.power).toBe(0x20);
    });
  });

  describe("page 0x01 (calibration)", () => {
    it("stores the calibration offset (calID 0x10, param 0x01)", () => {
      const data = antMessage([0x01, 0x10, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]);
      const next = decodeBicyclePower(initialState, data);
      expect(next.offset).toBe(0x0203);
    });

    it("ignores other calibration ids", () => {
      const data = antMessage([0x01, 0x11, 0x01, 0x00, 0x00, 0x00, 0x03, 0x02]);
      const next = decodeBicyclePower(initialState, data);
      expect(next.offset).toBeUndefined();
    });
  });

  describe("page 0x20 (crank torque frequency)", () => {
    // eventCount = 1, slope = 100, timeStamp = 2000, torqueTicks = 500
    const firstEvent = [0x20, 0x01, 0x00, 0x64, 0x07, 0xd0, 0x01, 0xf4];

    it("computes cadence, torque and power on the first event", () => {
      const next = decodeBicyclePower(initialState, antMessage(firstEvent));
      expect(next.eventCount).toBe(1);
      expect(next.slope).toBe(100);
      expect(next.timeStamp).toBe(2000);
      expect(next.torqueTicksStamp).toBe(500);
      // elapsed = 2000 * 0.0005 = 1 s -> cadence = 60 rpm
      expect(next.calculatedCadence).toBe(60);
      // torqueFrequency = 500 Hz, torque = 500 / (100 / 10) = 50 Nm
      expect(next.calculatedTorque).toBeCloseTo(50, 10);
      expect(next.calculatedPower).toBeCloseTo((50 * 60 * Math.PI) / 30, 10);
    });

    it("subtracts the calibration offset from the torque frequency", () => {
      const state: BicyclePowerSensorState = { deviceId: 12345, offset: 500 };
      const next = decodeBicyclePower(state, antMessage(firstEvent));
      // torqueFrequency = 500 - 500 = 0 Hz
      expect(next.calculatedTorque).toBeCloseTo(0, 10);
      expect(next.calculatedPower).toBeCloseTo(0, 10);
    });

    it("handles event count, time stamp and torque ticks rollover", () => {
      const state: BicyclePowerSensorState = {
        deviceId: 12345,
        eventCount: 250,
        timeStamp: 65000,
        torqueTicksStamp: 65000,
      };
      // eventCount = 2, slope = 100, timeStamp = 1000, torqueTicks = 500
      const data = antMessage([0x20, 0x02, 0x00, 0x64, 0x03, 0xe8, 0x01, 0xf4]);
      const next = decodeBicyclePower(state, data);
      // Raw values are stored, adjusted values are used for the math.
      expect(next.eventCount).toBe(2);
      expect(next.timeStamp).toBe(1000);
      expect(next.torqueTicksStamp).toBe(500);
      // eventCount: 2 + 256 = 258 -> delta 8
      // timeStamp: 1000 + 65536 = 66536 -> elapsed (66536 - 65000) * 0.0005 = 0.768 s
      // torqueTicks: 500 + 65536 = 66036 -> delta 1036
      expect(next.calculatedCadence).toBe(Math.round(60 / (0.768 / 8)));
      const torque = 1036 / 0.768 / (100 / 10);
      expect(next.calculatedTorque).toBeCloseTo(torque, 10);
      expect(next.calculatedPower).toBeCloseTo(
        (torque * Math.round(60 / (0.768 / 8)) * Math.PI) / 30,
        10,
      );
    });

    it("keeps calculated values when the event has not advanced", () => {
      const state = decodeBicyclePower(initialState, antMessage(firstEvent));
      const next = decodeBicyclePower(state, antMessage(firstEvent));
      expect(next.eventCount).toBe(state.eventCount);
      expect(next.calculatedCadence).toBe(state.calculatedCadence);
      expect(next.calculatedTorque).toBe(state.calculatedTorque);
      expect(next.calculatedPower).toBe(state.calculatedPower);
    });
  });

  it("returns an updated state for unknown pages without touching data", () => {
    const state: BicyclePowerSensorState = { deviceId: 12345, power: 200 };
    const data = antMessage([0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const next = decodeBicyclePower(state, data);
    expect(next.power).toBe(200);
    expect(typeof next.receivedAt).toBe("number");
  });

  it("does not mutate the input state", () => {
    const state: BicyclePowerSensorState = { deviceId: 12345 };
    const frozen = Object.freeze(state);
    const data = antMessage([0x10, 0x01, 0x9e, 0x5a, 0x34, 0x12, 0x22, 0x01]);
    const next = decodeBicyclePower(frozen, data);
    expect(next).not.toBe(frozen);
    expect(frozen).toEqual({ deviceId: 12345 });
  });
});
