/*
 * ANT+ Environment profile spec sheet:
 * https://www.thisisant.com/resources/environment/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface EnvironmentSensorState extends SensorState {
  readonly eventCount?: number;
  readonly temperature?: number;
  readonly receivedAt?: number;
}

export interface EnvironmentScanState
  extends EnvironmentSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one environment broadcast page. Pure: returns the next state
 * instead of mutating it.
 */
export function decodeEnvironment<TState extends EnvironmentSensorState>(
  state: Readonly<TState>,
  data: DataView,
): TState {
  const updates: Draft<EnvironmentSensorState> = {};
  const page = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);

  if (page === Constants.ENVIRONMENT_PAGE_DEFAULT) {
    updates.eventCount = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
    );
    updates.temperature =
      data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        true,
      ) / Constants.ENVIRONMENT_TEMPERATURE_SCALE;
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export class EnvironmentSensor extends AntPlusSensor<EnvironmentSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_ENVIRONMENT;

  protected readonly deviceType = EnvironmentSensor.deviceType;
  protected readonly period = Constants.PERIOD_ENVIRONMENT;

  protected createState(deviceId: number): EnvironmentSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<EnvironmentSensorState>,
    data: DataView,
  ): EnvironmentSensorState {
    return decodeEnvironment(state, data);
  }
}

export class EnvironmentScanner extends AntPlusScanner<EnvironmentScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_ENVIRONMENT;

  protected readonly deviceType = EnvironmentScanner.deviceType;

  protected createState(deviceId: number): EnvironmentScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<EnvironmentScanState>,
    data: DataView,
  ): EnvironmentScanState {
    return decodeEnvironment(state, data);
  }
}
