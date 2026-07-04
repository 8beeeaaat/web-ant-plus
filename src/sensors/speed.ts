/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type BatteryStatusValue,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface SpeedSensorState extends SensorState {
  readonly speedEventTime?: number;
  readonly cumulativeSpeedRevolutionCount?: number;
  readonly calculatedDistance?: number;
  readonly calculatedSpeed?: number;
  readonly operatingTime?: number;
  readonly manId?: number;
  readonly serialNumber?: number;
  readonly hwVersion?: number;
  readonly swVersion?: number;
  readonly modelNum?: number;
  readonly batteryVoltage?: number;
  readonly batteryStatus?: BatteryStatusValue;
  readonly motion?: boolean;
  readonly receivedAt?: number;
}

export interface SpeedScanState extends SpeedSensorState, ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one bicycle speed broadcast page. Pure: returns the next
 * state instead of mutating, or undefined when no new speed event has
 * been recorded since the previous state.
 */
export function decodeSpeed<TState extends SpeedSensorState>(
  state: Readonly<TState>,
  data: DataView,
  wheelCircumference: number,
): TState | undefined {
  const updates: Draft<SpeedSensorState> = {};
  const pageNum = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);

  switch (
    pageNum & ~Constants.TOGGLE_MASK // check the new pages and remove the toggle bit
  ) {
    case Constants.DATA_PAGE_OPERATING_TIME: {
      // Cumulative operating time.
      let operatingTime = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      operatingTime |=
        data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
        ) << Constants.BYTE_BITS;
      operatingTime |=
        data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        ) << Constants.UINT16_BITS;
      updates.operatingTime =
        operatingTime * Constants.BIKE_OPERATING_TIME_SCALE;
      break;
    }
    case Constants.DATA_PAGE_MANUFACTURER_INFO: {
      // Manufacturer id and the 4 byte serial number.
      updates.manId = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      updates.serialNumber =
        (state.deviceId |
          (data.getUint16(
            Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
            true,
          ) <<
            Constants.UINT16_BITS)) >>>
        Constants.DEFAULT_CHANNEL;
      break;
    }
    case Constants.DATA_PAGE_PRODUCT_INFO:
      // HW version, SW version and model number.
      updates.hwVersion = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      updates.swVersion = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      updates.modelNum = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      break;
    case Constants.DATA_PAGE_BATTERY_STATUS: {
      const batteryFrac = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      const batteryStatus = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const batteryVoltageInteger =
        batteryStatus & Constants.BATTERY_VOLTAGE_INTEGER_MASK;
      updates.batteryVoltage =
        batteryVoltageInteger === Constants.BATTERY_VOLTAGE_INTEGER_INVALID
          ? undefined
          : batteryVoltageInteger +
            batteryFrac / Constants.BATTERY_VOLTAGE_FRACTION_SCALE;
      const batteryFlags =
        (batteryStatus & Constants.BATTERY_STATUS_MASK) >>>
        Constants.BATTERY_STATUS_SHIFT;
      switch (batteryFlags) {
        case Constants.BATTERY_STATUS_NEW:
          updates.batteryStatus = "New";
          break;
        case Constants.BATTERY_STATUS_GOOD:
          updates.batteryStatus = "Good";
          break;
        case Constants.BATTERY_STATUS_OK:
          updates.batteryStatus = "Ok";
          break;
        case Constants.BATTERY_STATUS_LOW:
          updates.batteryStatus = "Low";
          break;
        case Constants.BATTERY_STATUS_CRITICAL:
          updates.batteryStatus = "Critical";
          break;
        default:
          updates.batteryVoltage = undefined;
          updates.batteryStatus = "Invalid";
          break;
      }
      break;
    }
    case Constants.DATA_PAGE_MOTION:
      updates.motion =
        (data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
        ) &
          Constants.MOTION_FLAG) ===
        Constants.MOTION_FLAG;
      break;
    default:
      break;
  }

  // Old state for calculating cumulative values.
  const oldSpeedTime = state.speedEventTime;
  const oldSpeedCount = state.cumulativeSpeedRevolutionCount;

  let speedEventTime = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
    true,
  );
  let speedRevolutionCount = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
    true,
  );

  if (speedEventTime !== oldSpeedTime) {
    updates.speedEventTime = speedEventTime;
    updates.cumulativeSpeedRevolutionCount = speedRevolutionCount;

    if (oldSpeedTime && oldSpeedTime > speedEventTime) {
      // Hit rollover value.
      speedEventTime +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    if (oldSpeedCount && oldSpeedCount > speedRevolutionCount) {
      // Hit rollover value.
      speedRevolutionCount +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    const distance =
      wheelCircumference *
      (speedRevolutionCount - (oldSpeedCount || Constants.DEFAULT_CHANNEL));
    updates.calculatedDistance = distance;

    // Speed in m/sec.
    const speed =
      (distance * Constants.BIKE_EVENT_TIME_RESOLUTION) /
      (speedEventTime - (oldSpeedTime || Constants.DEFAULT_CHANNEL));
    if (!Number.isNaN(speed)) {
      updates.calculatedSpeed = speed;
      updates.receivedAt = Date.now();
      return { ...state, ...updates } as TState;
    }
  }

  return undefined;
}

export class SpeedSensor extends AntPlusSensor<SpeedSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_SPEED;

  protected readonly deviceType = SpeedSensor.deviceType;
  protected readonly period = Constants.PERIOD_BICYCLE_SPEED;

  wheelCircumference: number = Constants.DEFAULT_WHEEL_CIRCUMFERENCE; // default 70cm wheel

  protected createState(deviceId: number): SpeedSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<SpeedSensorState>,
    data: DataView,
  ): SpeedSensorState | undefined {
    return decodeSpeed(state, data, this.wheelCircumference);
  }
}

export class SpeedScanner extends AntPlusScanner<SpeedScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_SPEED;

  protected readonly deviceType = SpeedScanner.deviceType;

  wheelCircumference: number = Constants.DEFAULT_WHEEL_CIRCUMFERENCE; // default 70cm wheel

  protected createState(deviceId: number): SpeedScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<SpeedScanState>,
    data: DataView,
  ): SpeedScanState | undefined {
    return decodeSpeed(state, data, this.wheelCircumference);
  }
}
