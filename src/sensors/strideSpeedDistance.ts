/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#528_tab
 * Spec sheet: https://www.thisisant.com/resources/stride-based-speed-and-distance-monitor/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface StrideSpeedDistanceSensorState extends SensorState {
  readonly timeFractional?: number;
  readonly timeInteger?: number;
  readonly distanceInteger?: number;
  readonly distanceFractional?: number;
  readonly speedInteger?: number;
  readonly speedFractional?: number;
  readonly strideCount?: number;
  readonly updateLatency?: number;
  readonly cadenceInteger?: number;
  readonly cadenceFractional?: number;
  readonly status?: number;
  readonly calories?: number;
  readonly receivedAt?: number;
}

export interface StrideSpeedDistanceScanState
  extends StrideSpeedDistanceSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one stride-based speed and distance broadcast page. Pure:
 * returns the next state instead of mutating it.
 */
export function decodeStrideSpeedDistance<
  TState extends StrideSpeedDistanceSensorState,
>(state: Readonly<TState>, data: DataView): TState {
  const updates: Draft<StrideSpeedDistanceSensorState> = {};
  const page = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);

  if (page === Constants.STRIDE_SPEED_DISTANCE_PAGE_TIME_DISTANCE_SPEED) {
    updates.timeFractional = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
    );
    updates.timeInteger = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
    );
    updates.distanceInteger = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
    );
    updates.distanceFractional =
      data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      ) >>> Constants.NIBBLE_BITS;
    updates.speedInteger =
      data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      ) & Constants.NIBBLE_MASK;
    updates.speedFractional = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
    );
    updates.strideCount = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
    );
    updates.updateLatency = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
    );
  } else if (
    page >= Constants.STRIDE_SPEED_DISTANCE_PAGE_COMMON_MIN &&
    page <= Constants.STRIDE_SPEED_DISTANCE_PAGE_COMMON_MAX
  ) {
    updates.cadenceInteger = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
    );
    updates.cadenceFractional =
      data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      ) >>> Constants.NIBBLE_BITS;
    updates.speedInteger =
      data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      ) & Constants.NIBBLE_MASK;
    updates.speedFractional = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
    );
    updates.status = data.getUint8(
      Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
    );

    switch (page) {
      case Constants.STRIDE_SPEED_DISTANCE_PAGE_CALORIES:
        updates.calories = data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        );
        break;
      default:
        break;
    }
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export class StrideSpeedDistanceSensor extends AntPlusSensor<StrideSpeedDistanceSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_STRIDE_SPEED_DISTANCE;

  protected readonly deviceType = StrideSpeedDistanceSensor.deviceType;
  protected readonly period = Constants.PERIOD_STRIDE_SPEED_DISTANCE;

  protected createState(deviceId: number): StrideSpeedDistanceSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<StrideSpeedDistanceSensorState>,
    data: DataView,
  ): StrideSpeedDistanceSensorState {
    return decodeStrideSpeedDistance(state, data);
  }
}

export class StrideSpeedDistanceScanner extends AntPlusScanner<StrideSpeedDistanceScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_STRIDE_SPEED_DISTANCE;

  protected readonly deviceType = StrideSpeedDistanceScanner.deviceType;

  protected createState(deviceId: number): StrideSpeedDistanceScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<StrideSpeedDistanceScanState>,
    data: DataView,
  ): StrideSpeedDistanceScanState {
    return decodeStrideSpeedDistance(state, data);
  }
}
