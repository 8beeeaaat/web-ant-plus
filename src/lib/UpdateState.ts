import type { Page } from "../ant";
import type { BicyclePowerScanState } from "../sensors/BicyclePowerScanState";
import type { BicyclePowerScanner } from "../sensors/BicyclePowerScanner";
import type { BicyclePowerSensor } from "../sensors/BicyclePowerSensor";
import type { BicyclePowerSensorState } from "../sensors/BicyclePowerSensorState";
import type { CadenceScanState } from "../sensors/CadenceScanState";
import type { CadenceScanner } from "../sensors/CadenceScanner";
import type { CadenceSensor } from "../sensors/CadenceSensor";
import type { CadenceSensorState } from "../sensors/CadenceSensorState";
import type { EnvironmentScanState } from "../sensors/EnvironmentScanState";
import type { EnvironmentScanner } from "../sensors/EnvironmentScanner";
import type { EnvironmentSensor } from "../sensors/EnvironmentSensor";
import type { EnvironmentSensorState } from "../sensors/EnvironmentSensorState";
import type { FitnessEquipmentScanState } from "../sensors/FitnessEquipmentScanState";
import type { FitnessEquipmentScanner } from "../sensors/FitnessEquipmentScanner";
import type { FitnessEquipmentSensor } from "../sensors/FitnessEquipmentSensor";
import type { FitnessEquipmentSensorState } from "../sensors/FitnessEquipmentSensorState";
import type { HeartRateScanState } from "../sensors/HeartRateScanState";
import type { HeartRateScanner } from "../sensors/HeartRateScanner";
import type { HeartRateSensor } from "../sensors/HeartRateSensor";
import type { HeartRateSensorState } from "../sensors/HeartRateSensorState";
import type { MuscleOxygenScanState } from "../sensors/MuscleOxygenScanState";
import type { MuscleOxygenScanner } from "../sensors/MuscleOxygenScanner";
import type { MuscleOxygenSensor } from "../sensors/MuscleOxygenSensor";
import type { MuscleOxygenSensorState } from "../sensors/MuscleOxygenSensorState";
import type { SpeedCadenceScanState } from "../sensors/SpeedCadenceScanState";
import type { SpeedCadenceScanner } from "../sensors/SpeedCadenceScanner";
import type { SpeedCadenceSensor } from "../sensors/SpeedCadenceSensor";
import type { SpeedCadenceSensorState } from "../sensors/SpeedCadenceSensorState";
import type { SpeedScanState } from "../sensors/SpeedScanState";
import type { SpeedScanner } from "../sensors/SpeedScanner";
import type { SpeedSensor } from "../sensors/SpeedSensor";
import type { SpeedSensorState } from "../sensors/SpeedSensorState";
import type { StrideSpeedDistanceScanState } from "../sensors/StrideSpeedDistanceScanState";
import type { StrideSpeedDistanceScanner } from "../sensors/StrideSpeedDistanceScanner";
import type { StrideSpeedDistanceSensor } from "../sensors/StrideSpeedDistanceSensor";
import type { StrideSpeedDistanceSensorState } from "../sensors/StrideSpeedDistanceSensorState";

export function updateBicyclePowerSensorState(
  sensor: BicyclePowerSensor | BicyclePowerScanner,
  state: BicyclePowerSensorState | BicyclePowerScanState,
  data: DataView,
) {
  sensor.emit("powerData", state.updateState(data));
}

export function updateCadenceSensorState(
  sensor: CadenceSensor | CadenceScanner,
  state: CadenceSensorState | CadenceScanState,
  data: DataView,
) {
  sensor.emit("cadenceData", state.updateState(data));
}

export function updateEnvironmentSensorState(
  sensor: EnvironmentSensor | EnvironmentScanner,
  state: EnvironmentSensorState | EnvironmentScanState,
  data: DataView,
) {
  const updatedState = state.updateState(data);
  sensor.emit("envdata", updatedState);
  sensor.emit("envData", updatedState);
}

export function updateFitnessEquipmentSensorState(
  sensor: FitnessEquipmentSensor | FitnessEquipmentScanner,
  state: FitnessEquipmentSensorState | FitnessEquipmentScanState,
  data: DataView,
) {
  sensor.emit("fitnessData", state.updateState(data));
}

export function resetFitnessEquipmentSensorState(
  state: FitnessEquipmentSensorState | FitnessEquipmentScanState,
) {
  state.resetState();
}

export function updateHeartRateSensorState(
  sensor: HeartRateSensor | HeartRateScanner,
  state: HeartRateSensorState | HeartRateScanState,
  data: DataView,
  page: Page,
) {
  const updatedState = state.updateState(data, page);
  sensor.emit("hbdata", updatedState);
  sensor.emit("hbData", updatedState);
}

export function updateMuscleOxygenSensorState(
  sensor: MuscleOxygenSensor | MuscleOxygenScanner,
  state: MuscleOxygenSensorState | MuscleOxygenScanState,
  data: DataView,
) {
  const updatedState = state.updateState(data);
  if (updatedState) {
    sensor.emit("oxygenData", updatedState);
  }
}

export function updateSpeedCadenceSensorState(
  sensor: SpeedCadenceSensor | SpeedCadenceScanner,
  state: SpeedCadenceSensorState | SpeedCadenceScanState,
  data: DataView,
) {
  const { updatedState, resultType } = state.updateState(
    data,
    sensor.wheelCircumference,
  );
  switch (resultType) {
    case "both":
      sensor.emit("cadenceData", updatedState);
      sensor.emit("speedData", updatedState);
      break;
    case "cadence":
      sensor.emit("cadenceData", updatedState);
      break;
    case "speed":
      sensor.emit("speedData", updatedState);
      break;
    default:
      break;
  }
}

export function updateSpeedSensorState(
  sensor: SpeedSensor | SpeedScanner,
  state: SpeedSensorState | SpeedScanState,
  data: DataView,
) {
  const updatedState = state.updateState(data, sensor.wheelCircumference);
  if (updatedState) {
    sensor.emit("speedData", updatedState);
  }
}

export function updateStrideSpeedDistanceSensorState(
  sensor: StrideSpeedDistanceSensor | StrideSpeedDistanceScanner,
  state: StrideSpeedDistanceSensorState | StrideSpeedDistanceScanState,
  data: DataView,
) {
  const updatedState = state.updateState(data);
  sensor.emit("ssddata", updatedState);
  sensor.emit("ssdData", updatedState);
}
