/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#2343_tab
 * Spec sheet: https://www.thisisant.com/resources/ant-device-profile-muscle-oxygen/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type BatteryStatusValue,
  type ScanState,
  type SensorState,
} from "./base.js";

export type MeasurementValue = number | "AmbientLightTooHigh" | "Invalid";
export type MeasurementInterval =
  | typeof Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_QUARTER_SECONDS
  | typeof Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_HALF_SECONDS
  | typeof Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_ONE_SECOND
  | typeof Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_TWO_SECONDS;

export interface MuscleOxygenSensorState extends SensorState {
  readonly eventCount?: number;
  readonly utcTimeRequired?: boolean;
  readonly supportANTFS?: boolean;
  readonly measurementInterval?: MeasurementInterval;
  readonly totalHemoglobinConcentration?: MeasurementValue;
  readonly previousSaturatedHemoglobinPercentage?: MeasurementValue;
  readonly currentSaturatedHemoglobinPercentage?: MeasurementValue;
  readonly hwVersion?: number;
  readonly manId?: number;
  readonly modelNum?: number;
  readonly swVersion?: number;
  readonly serialNumber?: number;
  readonly operatingTime?: number;
  readonly batteryId?: number;
  readonly batteryVoltage?: number;
  readonly batteryStatus?: BatteryStatusValue;
  readonly receivedAt?: number;
}

export interface MuscleOxygenScanState
  extends MuscleOxygenSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one muscle oxygen broadcast page. Pure: returns the next
 * state, or undefined when the page is unknown or a data page repeats
 * the previous event count (nothing new to emit).
 */
export function decodeMuscleOxygen<TState extends MuscleOxygenSensorState>(
  state: Readonly<TState>,
  data: DataView,
): TState | undefined {
  const updates: Draft<MuscleOxygenSensorState> = {};
  const oldEventCount = state.eventCount || Constants.DEFAULT_CHANNEL;
  let newEventCount = oldEventCount;

  const page = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);
  switch (page) {
    case Constants.MUSCLE_OXYGEN_PAGE_DATA: {
      const eventCount = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      const notifications = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      const capabilities = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        true,
      );
      const total =
        data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
          true,
        ) & Constants.MUSCLE_OXYGEN_TOTAL_MASK;
      const previous =
        (data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
          true,
        ) >>
          Constants.MUSCLE_OXYGEN_PREVIOUS_PERCENTAGE_SHIFT) &
        Constants.MUSCLE_OXYGEN_PERCENTAGE_MASK;
      const current =
        (data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
          true,
        ) >>
          Constants.MUSCLE_OXYGEN_CURRENT_PERCENTAGE_SHIFT) &
        Constants.MUSCLE_OXYGEN_PERCENTAGE_MASK;

      if (eventCount !== oldEventCount) {
        newEventCount = eventCount;
        updates.eventCount = eventCount;
      }

      updates.utcTimeRequired =
        (notifications & Constants.MUSCLE_OXYGEN_NOTIFICATION_UTC_REQUIRED) ===
        Constants.MUSCLE_OXYGEN_NOTIFICATION_UTC_REQUIRED;

      updates.supportANTFS =
        (capabilities & Constants.MUSCLE_OXYGEN_CAPABILITY_ANTFS) ===
        Constants.MUSCLE_OXYGEN_CAPABILITY_ANTFS;

      switch (
        (capabilities >> Constants.MUSCLE_OXYGEN_INTERVAL_SHIFT) &
        Constants.MUSCLE_OXYGEN_INTERVAL_MASK
      ) {
        case Constants.MUSCLE_OXYGEN_INTERVAL_QUARTER_SECONDS:
          updates.measurementInterval =
            Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_QUARTER_SECONDS;
          break;
        case Constants.MUSCLE_OXYGEN_INTERVAL_HALF_SECONDS:
          updates.measurementInterval =
            Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_HALF_SECONDS;
          break;
        case Constants.MUSCLE_OXYGEN_INTERVAL_ONE_SECOND:
          updates.measurementInterval =
            Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_ONE_SECOND;
          break;
        case Constants.MUSCLE_OXYGEN_INTERVAL_TWO_SECONDS:
          updates.measurementInterval =
            Constants.MUSCLE_OXYGEN_MEASUREMENT_INTERVAL_TWO_SECONDS;
          break;
        default:
          updates.measurementInterval = undefined;
      }

      switch (total) {
        case Constants.MUSCLE_OXYGEN_TOTAL_AMBIENT_LIGHT_TOO_HIGH:
          updates.totalHemoglobinConcentration = "AmbientLightTooHigh";
          break;
        case Constants.MUSCLE_OXYGEN_TOTAL_INVALID:
          updates.totalHemoglobinConcentration = "Invalid";
          break;
        default:
          updates.totalHemoglobinConcentration = total;
      }

      switch (previous) {
        case Constants.MUSCLE_OXYGEN_PERCENTAGE_AMBIENT_LIGHT_TOO_HIGH:
          updates.previousSaturatedHemoglobinPercentage = "AmbientLightTooHigh";
          break;
        case Constants.MUSCLE_OXYGEN_PERCENTAGE_INVALID:
          updates.previousSaturatedHemoglobinPercentage = "Invalid";
          break;
        default:
          updates.previousSaturatedHemoglobinPercentage = previous;
      }

      switch (current) {
        case Constants.MUSCLE_OXYGEN_PERCENTAGE_AMBIENT_LIGHT_TOO_HIGH:
          updates.currentSaturatedHemoglobinPercentage = "AmbientLightTooHigh";
          break;
        case Constants.MUSCLE_OXYGEN_PERCENTAGE_INVALID:
          updates.currentSaturatedHemoglobinPercentage = "Invalid";
          break;
        default:
          updates.currentSaturatedHemoglobinPercentage = current;
      }

      break;
    }
    case Constants.DATA_PAGE_COMMON_MANUFACTURER_INFO: {
      updates.hwVersion = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      updates.manId = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      updates.modelNum = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        true,
      );
      break;
    }
    case Constants.DATA_PAGE_COMMON_PRODUCT_INFO: {
      const swRevSup = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      const swRevMain = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const serial = data.getInt32(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );

      updates.swVersion = swRevMain;

      if (swRevSup !== Constants.INVALID_BYTE) {
        updates.swVersion += swRevSup / Constants.MUSCLE_OXYGEN_SW_SUP_SCALE;
      }

      if (serial !== Constants.INVALID_UINT32) {
        updates.serialNumber = serial;
      }

      break;
    }
    case Constants.DATA_PAGE_COMMON_BATTERY_STATUS: {
      updates.batteryId = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      const operatingTime =
        data.getUint32(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
          true,
        ) & Constants.MUSCLE_OXYGEN_OPERATING_TIME_MASK;
      const batteryFrac = data.getInt32(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        true,
      );
      const batteryStatus = data.getInt32(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
        true,
      );

      updates.operatingTime =
        operatingTime *
        ((batteryStatus & Constants.MUSCLE_OXYGEN_OPERATING_TIME_2S_FLAG) ===
        Constants.MUSCLE_OXYGEN_OPERATING_TIME_2S_FLAG
          ? Constants.MUSCLE_OXYGEN_OPERATING_TIME_2S_SCALE
          : Constants.MUSCLE_OXYGEN_OPERATING_TIME_16S_SCALE);
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
    default:
      return undefined;
  }

  updates.receivedAt = Date.now();
  if (
    page !== Constants.MUSCLE_OXYGEN_PAGE_DATA ||
    newEventCount !== oldEventCount
  ) {
    return { ...state, ...updates } as TState;
  }
  return undefined;
}

export type TimeCommand =
  | typeof Constants.MUSCLE_OXYGEN_TIME_COMMAND_SET_UTC
  | typeof Constants.MUSCLE_OXYGEN_TIME_COMMAND_START_SESSION
  | typeof Constants.MUSCLE_OXYGEN_TIME_COMMAND_STOP_SESSION
  | typeof Constants.MUSCLE_OXYGEN_TIME_COMMAND_SET_LAP;

export interface TimeCommandOptions {
  /** The wall clock time to encode. Defaults to the current time. */
  readonly time?: Date;
}

/**
 * Builds the "set time" command payload (data page 0x10). The UTC
 * timestamp counts seconds since the ANT+ epoch (1989-12-31T00:00Z)
 * and the local time offset is encoded in 15 minute steps.
 */
export function buildTimeCommandPayload(cmd: TimeCommand, now: Date): number[] {
  const utc = Math.round(
    (now.getTime() -
      Date.UTC(
        Constants.MUSCLE_OXYGEN_ANT_EPOCH_YEAR,
        Constants.MUSCLE_OXYGEN_ANT_EPOCH_MONTH,
        Constants.MUSCLE_OXYGEN_ANT_EPOCH_DAY,
        Constants.DEFAULT_CHANNEL,
        Constants.DEFAULT_CHANNEL,
        Constants.DEFAULT_CHANNEL,
        Constants.DEFAULT_CHANNEL,
      )) /
      Constants.MUSCLE_OXYGEN_SECONDS_PER_MILLISECOND,
  );
  const offset = -Math.round(
    now.getTimezoneOffset() / Constants.MUSCLE_OXYGEN_TIMEZONE_STEP_MINUTES,
  );
  return [
    Constants.DATA_PAGE_TIME_COMMAND,
    cmd & Constants.BYTE_MASK,
    Constants.INVALID_BYTE,
    offset & Constants.BYTE_MASK,
    (utc >> Constants.DEFAULT_CHANNEL) & Constants.BYTE_MASK,
    (utc >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
    (utc >> Constants.UINT16_BITS) & Constants.BYTE_MASK,
    (utc >> Constants.UINT24_BITS) & Constants.BYTE_MASK,
  ];
}

export class MuscleOxygenSensor extends AntPlusSensor<MuscleOxygenSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_MUSCLE_OXYGEN;

  protected readonly deviceType = MuscleOxygenSensor.deviceType;
  protected readonly period = Constants.PERIOD_MUSCLE_OXYGEN;

  protected createState(deviceId: number): MuscleOxygenSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<MuscleOxygenSensorState>,
    data: DataView,
  ): MuscleOxygenSensorState | undefined {
    return decodeMuscleOxygen(state, data);
  }

  #sendTimeCommand(
    cmd: TimeCommand,
    options: TimeCommandOptions,
  ): Promise<boolean> {
    return this.sendAcknowledgedData(
      buildTimeCommandPayload(cmd, options.time ?? new Date()),
    );
  }

  /** Sends the device the current UTC time. */
  setUTCTime(options: TimeCommandOptions = {}): Promise<boolean> {
    return this.#sendTimeCommand(
      Constants.MUSCLE_OXYGEN_TIME_COMMAND_SET_UTC,
      options,
    );
  }

  /** Starts a new session on the device. */
  startSession(options: TimeCommandOptions = {}): Promise<boolean> {
    return this.#sendTimeCommand(
      Constants.MUSCLE_OXYGEN_TIME_COMMAND_START_SESSION,
      options,
    );
  }

  /** Stops the current session on the device. */
  stopSession(options: TimeCommandOptions = {}): Promise<boolean> {
    return this.#sendTimeCommand(
      Constants.MUSCLE_OXYGEN_TIME_COMMAND_STOP_SESSION,
      options,
    );
  }

  /** Marks a lap in the current session. */
  setLap(options: TimeCommandOptions = {}): Promise<boolean> {
    return this.#sendTimeCommand(
      Constants.MUSCLE_OXYGEN_TIME_COMMAND_SET_LAP,
      options,
    );
  }
}

export class MuscleOxygenScanner extends AntPlusScanner<MuscleOxygenScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_MUSCLE_OXYGEN;

  protected readonly deviceType = MuscleOxygenScanner.deviceType;

  protected createState(deviceId: number): MuscleOxygenScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<MuscleOxygenScanState>,
    data: DataView,
  ): MuscleOxygenScanState | undefined {
    return decodeMuscleOxygen(state, data);
  }
}
