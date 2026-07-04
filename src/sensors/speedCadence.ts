/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface SpeedCadenceSensorState extends SensorState {
  readonly cadenceEventTime?: number;
  readonly cumulativeCadenceRevolutionCount?: number;
  readonly speedEventTime?: number;
  readonly cumulativeSpeedRevolutionCount?: number;
  readonly calculatedCadence?: number;
  readonly calculatedDistance?: number;
  readonly calculatedSpeed?: number;
  readonly receivedAt?: number;
}

export interface SpeedCadenceScanState
  extends SpeedCadenceSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one combined speed & cadence broadcast page. Pure: returns
 * the next state, or undefined when neither the cadence nor the speed
 * data changed.
 */
export function decodeSpeedCadence<TState extends SpeedCadenceSensorState>(
  state: Readonly<TState>,
  data: DataView,
  wheelCircumference: number,
): TState | undefined {
  const updates: Draft<SpeedCadenceSensorState> = {};

  // get old state for calculating cumulative values
  const oldCadenceTime = state.cadenceEventTime;
  const oldCadenceCount = state.cumulativeCadenceRevolutionCount;
  const oldSpeedTime = state.speedEventTime;
  const oldSpeedCount = state.cumulativeSpeedRevolutionCount;

  let cadenceTime = data.getUint16(Constants.BUFFER_INDEX_MSG_DATA, true);
  let cadenceCount = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
    true,
  );
  let speedEventTime = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
    true,
  );
  let speedRevolutionCount = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
    true,
  );

  let cadenceDataChanged = false;
  let speedDataChanged = false;

  if (cadenceTime !== oldCadenceTime) {
    updates.cadenceEventTime = cadenceTime;
    updates.cumulativeCadenceRevolutionCount = cadenceCount;

    if (oldCadenceTime && oldCadenceTime > cadenceTime) {
      // Hit rollover value
      cadenceTime +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    if (oldCadenceCount && oldCadenceCount > cadenceCount) {
      // Hit rollover value
      cadenceCount +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    const cadence =
      (Constants.BIKE_MINUTES_PER_HOUR *
        (cadenceCount - (oldCadenceCount || Constants.DEFAULT_CHANNEL)) *
        Constants.BIKE_EVENT_TIME_RESOLUTION) /
      (cadenceTime - (oldCadenceTime || Constants.DEFAULT_CHANNEL));
    if (!Number.isNaN(cadence)) {
      updates.calculatedCadence = cadence;
      cadenceDataChanged = true;
    }
  }

  if (speedEventTime !== oldSpeedTime) {
    updates.speedEventTime = speedEventTime;
    updates.cumulativeSpeedRevolutionCount = speedRevolutionCount;

    if (oldSpeedTime && oldSpeedTime > speedEventTime) {
      // Hit rollover value
      speedEventTime +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    if (oldSpeedCount && oldSpeedCount > speedRevolutionCount) {
      // Hit rollover value
      speedRevolutionCount +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    const distance =
      wheelCircumference *
      (speedRevolutionCount - (oldSpeedCount || Constants.DEFAULT_CHANNEL));
    updates.calculatedDistance = distance;

    // speed in m/sec
    const speed =
      (distance * Constants.BIKE_EVENT_TIME_RESOLUTION) /
      (speedEventTime - (oldSpeedTime || Constants.DEFAULT_CHANNEL));
    if (!Number.isNaN(speed)) {
      updates.calculatedSpeed = speed;
      speedDataChanged = true;
    }
  }

  if (!cadenceDataChanged && !speedDataChanged) {
    return undefined;
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export class SpeedCadenceSensor extends AntPlusSensor<SpeedCadenceSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_SPEED_CADENCE;

  protected readonly deviceType = SpeedCadenceSensor.deviceType;
  protected readonly period = Constants.PERIOD_BICYCLE_SPEED_CADENCE;

  wheelCircumference: number = Constants.DEFAULT_WHEEL_CIRCUMFERENCE;

  protected createState(deviceId: number): SpeedCadenceSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<SpeedCadenceSensorState>,
    data: DataView,
  ): SpeedCadenceSensorState | undefined {
    return decodeSpeedCadence(state, data, this.wheelCircumference);
  }
}

export class SpeedCadenceScanner extends AntPlusScanner<SpeedCadenceScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_SPEED_CADENCE;

  protected readonly deviceType = SpeedCadenceScanner.deviceType;

  wheelCircumference: number = Constants.DEFAULT_WHEEL_CIRCUMFERENCE;

  protected createState(deviceId: number): SpeedCadenceScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<SpeedCadenceScanState>,
    data: DataView,
  ): SpeedCadenceScanState | undefined {
    return decodeSpeedCadence(state, data, this.wheelCircumference);
  }
}
