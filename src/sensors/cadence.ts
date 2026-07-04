/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type BatteryStatusValue,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface CadenceSensorState extends SensorState {
  readonly cadenceEventTime?: number;
  readonly cumulativeCadenceRevolutionCount?: number;
  readonly calculatedCadence?: number;
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

export interface CadenceScanState extends CadenceSensorState, ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one bike cadence broadcast page. Pure: returns the next
 * state instead of mutating it.
 */
export function decodeCadence<TState extends CadenceSensorState>(
  state: Readonly<TState>,
  data: DataView,
): TState {
  const updates: Draft<CadenceSensorState> = {};
  const pageNum = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);

  switch (pageNum & ~Constants.TOGGLE_MASK) {
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
      updates.batteryVoltage =
        (batteryStatus & Constants.BATTERY_VOLTAGE_INTEGER_MASK) +
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

  // The default cadence data (last four bytes of every page).
  const oldCadenceTime = state.cadenceEventTime;
  const oldCadenceCount = state.cumulativeCadenceRevolutionCount;

  let cadenceTime = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
    true,
  );
  let cadenceCount = data.getUint16(
    Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
    true,
  );

  if (cadenceTime !== oldCadenceTime) {
    updates.cadenceEventTime = cadenceTime;
    updates.cumulativeCadenceRevolutionCount = cadenceCount;

    if (oldCadenceTime && oldCadenceTime > cadenceTime) {
      // Hit rollover value.
      cadenceTime +=
        Constants.BIKE_EVENT_TIME_RESOLUTION *
        Constants.BIKE_EVENT_ROLLOVER_BLOCKS;
    }

    if (oldCadenceCount && oldCadenceCount > cadenceCount) {
      // Hit rollover value.
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
    }
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export class CadenceSensor extends AntPlusSensor<CadenceSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_CADENCE;

  protected readonly deviceType = CadenceSensor.deviceType;
  protected readonly period = Constants.PERIOD_BICYCLE_SPEED_CADENCE;

  protected createState(deviceId: number): CadenceSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<CadenceSensorState>,
    data: DataView,
  ): CadenceSensorState {
    return decodeCadence(state, data);
  }
}

export class CadenceScanner extends AntPlusScanner<CadenceScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_CADENCE;

  protected readonly deviceType = CadenceScanner.deviceType;

  protected createState(deviceId: number): CadenceScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<CadenceScanState>,
    data: DataView,
  ): CadenceScanState {
    return decodeCadence(state, data);
  }
}
