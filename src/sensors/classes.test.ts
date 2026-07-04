import { describe, expect, it } from "vitest";
import type { USBDriver } from "../driver.js";
import { TypedEventEmitter } from "../lib/TypedEventEmitter.js";
import type { AntMessage } from "../messages.js";
import * as messages from "../messages.js";
import {
  BicyclePowerScanner,
  type BicyclePowerScanState,
  BicyclePowerSensor,
  type BicyclePowerSensorState,
} from "./bicyclePower.js";
import {
  CadenceScanner,
  type CadenceScanState,
  CadenceSensor,
  type CadenceSensorState,
} from "./cadence.js";
import {
  EnvironmentScanner,
  type EnvironmentScanState,
  EnvironmentSensor,
  type EnvironmentSensorState,
} from "./environment.js";
import {
  FitnessEquipmentScanner,
  type FitnessEquipmentScanState,
  FitnessEquipmentSensor,
  type FitnessEquipmentSensorState,
} from "./fitnessEquipment.js";
import {
  MuscleOxygenScanner,
  type MuscleOxygenScanState,
  MuscleOxygenSensor,
  type MuscleOxygenSensorState,
} from "./muscleOxygen.js";
import {
  SpeedScanner,
  type SpeedScanState,
  SpeedSensor,
  type SpeedSensorState,
} from "./speed.js";
import {
  SpeedCadenceScanner,
  type SpeedCadenceScanState,
  SpeedCadenceSensor,
  type SpeedCadenceSensorState,
} from "./speedCadence.js";
import {
  StrideSpeedDistanceScanner,
  type StrideSpeedDistanceScanState,
  StrideSpeedDistanceSensor,
  type StrideSpeedDistanceSensorState,
} from "./strideSpeedDistance.js";

class MinimalDriver extends TypedEventEmitter<{
  read: [DataView];
  startup: [DataView];
  shutdown: [];
  error: [unknown];
}> {
  async write(_data: AntMessage): Promise<void> {}
  attach(): boolean {
    return true;
  }
  detach(): boolean {
    return true;
  }
  isScanning(): boolean {
    return false;
  }
  canScan = true;
}

const driver = new MinimalDriver() as unknown as USBDriver;
const message = messages.broadcastData(0, [0x10, 1, 0, 90, 0, 0, 100, 0]);

class ExposedBicyclePowerSensor extends BicyclePowerSensor {
  create(id: number): BicyclePowerSensorState {
    return super.createState(id);
  }
  decode(state: BicyclePowerSensorState): BicyclePowerSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedBicyclePowerScanner extends BicyclePowerScanner {
  create(id: number): BicyclePowerScanState {
    return super.createState(id);
  }
  decode(state: BicyclePowerScanState): BicyclePowerScanState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedCadenceSensor extends CadenceSensor {
  create(id: number): CadenceSensorState {
    return super.createState(id);
  }
  decode(state: CadenceSensorState): CadenceSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedCadenceScanner extends CadenceScanner {
  create(id: number): CadenceScanState {
    return super.createState(id);
  }
  decode(state: CadenceScanState): CadenceScanState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedEnvironmentSensor extends EnvironmentSensor {
  create(id: number): EnvironmentSensorState {
    return super.createState(id);
  }
  decode(state: EnvironmentSensorState): EnvironmentSensorState | undefined {
    return super.decodeState(
      state,
      messages.broadcastData(0, [1, 0, 7, 0, 0, 0, 0x10, 0x27]),
    );
  }
}

class ExposedEnvironmentScanner extends EnvironmentScanner {
  create(id: number): EnvironmentScanState {
    return super.createState(id);
  }
  decode(state: EnvironmentScanState): EnvironmentScanState | undefined {
    return super.decodeState(
      state,
      messages.broadcastData(0, [1, 0, 7, 0, 0, 0, 0x10, 0x27]),
    );
  }
}

class ExposedFitnessEquipmentSensor extends FitnessEquipmentSensor {
  create(id: number): FitnessEquipmentSensorState {
    return super.createState(id);
  }
  decode(
    state: FitnessEquipmentSensorState,
  ): FitnessEquipmentSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedFitnessEquipmentScanner extends FitnessEquipmentScanner {
  create(id: number): FitnessEquipmentScanState {
    return super.createState(id);
  }
  decode(
    state: FitnessEquipmentScanState,
  ): FitnessEquipmentScanState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedMuscleOxygenSensor extends MuscleOxygenSensor {
  create(id: number): MuscleOxygenSensorState {
    return super.createState(id);
  }
  decode(state: MuscleOxygenSensorState): MuscleOxygenSensorState | undefined {
    return super.decodeState(
      state,
      messages.broadcastData(0, [0x50, 0, 0, 3, 1, 0, 2, 0]),
    );
  }
}

class ExposedMuscleOxygenScanner extends MuscleOxygenScanner {
  create(id: number): MuscleOxygenScanState {
    return super.createState(id);
  }
  decode(state: MuscleOxygenScanState): MuscleOxygenScanState | undefined {
    return super.decodeState(
      state,
      messages.broadcastData(0, [0x50, 0, 0, 3, 1, 0, 2, 0]),
    );
  }
}

class ExposedSpeedSensor extends SpeedSensor {
  create(id: number): SpeedSensorState {
    return super.createState(id);
  }
  decode(state: SpeedSensorState): SpeedSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedSpeedScanner extends SpeedScanner {
  create(id: number): SpeedScanState {
    return super.createState(id);
  }
  decode(state: SpeedScanState): SpeedScanState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedSpeedCadenceSensor extends SpeedCadenceSensor {
  create(id: number): SpeedCadenceSensorState {
    return super.createState(id);
  }
  decode(state: SpeedCadenceSensorState): SpeedCadenceSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedSpeedCadenceScanner extends SpeedCadenceScanner {
  create(id: number): SpeedCadenceScanState {
    return super.createState(id);
  }
  decode(state: SpeedCadenceScanState): SpeedCadenceScanState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedStrideSpeedDistanceSensor extends StrideSpeedDistanceSensor {
  create(id: number): StrideSpeedDistanceSensorState {
    return super.createState(id);
  }
  decode(
    state: StrideSpeedDistanceSensorState,
  ): StrideSpeedDistanceSensorState | undefined {
    return super.decodeState(state, message);
  }
}

class ExposedStrideSpeedDistanceScanner extends StrideSpeedDistanceScanner {
  create(id: number): StrideSpeedDistanceScanState {
    return super.createState(id);
  }
  decode(
    state: StrideSpeedDistanceScanState,
  ): StrideSpeedDistanceScanState | undefined {
    return super.decodeState(state, message);
  }
}

describe("sensor and scanner class wrappers", () => {
  it.each([
    new ExposedBicyclePowerSensor(driver),
    new ExposedBicyclePowerScanner(driver),
    new ExposedCadenceSensor(driver),
    new ExposedCadenceScanner(driver),
    new ExposedEnvironmentSensor(driver),
    new ExposedEnvironmentScanner(driver),
    new ExposedFitnessEquipmentSensor(driver),
    new ExposedFitnessEquipmentScanner(driver),
    new ExposedMuscleOxygenSensor(driver),
    new ExposedMuscleOxygenScanner(driver),
    new ExposedSpeedSensor(driver),
    new ExposedSpeedScanner(driver),
    new ExposedSpeedCadenceSensor(driver),
    new ExposedSpeedCadenceScanner(driver),
    new ExposedStrideSpeedDistanceSensor(driver),
    new ExposedStrideSpeedDistanceScanner(driver),
  ])("creates and decodes through %s", (sensor) => {
    const state = sensor.create(123);

    expect(state.deviceId).toBe(123);
    expect(sensor.decode(state)).toBeDefined();
  });

  it("executes acknowledged command wrappers before rejecting unattached sends", async () => {
    const fitness = new FitnessEquipmentSensor(driver);
    await expect(fitness.setUserConfiguration()).rejects.toThrow(
      "not attached",
    );
    await expect(fitness.setBasicResistance(50)).rejects.toThrow(
      "not attached",
    );
    await expect(fitness.setTargetPower(200)).rejects.toThrow("not attached");
    await expect(fitness.setWindResistance()).rejects.toThrow("not attached");
    await expect(fitness.setTrackResistance()).rejects.toThrow("not attached");

    const muscleOxygen = new MuscleOxygenSensor(driver);
    await expect(muscleOxygen.setUTCTime()).rejects.toThrow("not attached");
    await expect(muscleOxygen.startSession()).rejects.toThrow("not attached");
    await expect(muscleOxygen.stopSession()).rejects.toThrow("not attached");
    await expect(muscleOxygen.setLap()).rejects.toThrow("not attached");
  });
});
