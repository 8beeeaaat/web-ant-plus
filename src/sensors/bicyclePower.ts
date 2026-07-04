/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-power/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type ScanState,
  type SensorState,
} from "./base.js";

export interface BicyclePowerSensorState extends SensorState {
  readonly pedalPower?: number;
  readonly rightPedalPower?: number;
  readonly leftPedalPower?: number;
  readonly cadence?: number;
  readonly accumulatedPower?: number;
  readonly power?: number;
  /** Calibration offset received on page 0x01. Defaults to 0. */
  readonly offset?: number;
  readonly eventCount?: number;
  readonly timeStamp?: number;
  readonly slope?: number;
  readonly torqueTicksStamp?: number;
  readonly calculatedCadence?: number;
  readonly calculatedTorque?: number;
  readonly calculatedPower?: number;
  readonly receivedAt?: number;
}

export interface BicyclePowerScanState
  extends BicyclePowerSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Decodes one bicycle power broadcast page. Pure: returns the next
 * state instead of mutating the given one.
 */
export function decodeBicyclePower<TState extends BicyclePowerSensorState>(
  state: Readonly<TState>,
  data: DataView,
): TState {
  const updates: Draft<BicyclePowerSensorState> = {};
  const page = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);
  switch (page) {
    case Constants.BICYCLE_POWER_PAGE_CALIBRATION: {
      const calID = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      if (calID === Constants.BICYCLE_POWER_CAL_ID_CTF) {
        const calParam = data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
        );
        if (calParam === Constants.BICYCLE_POWER_CAL_PARAM_AUTO_ZERO_SUPPORT) {
          updates.offset = data.getUint16(
            Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
            true,
          );
        }
      }
      break;
    }
    case Constants.BICYCLE_POWER_PAGE_STANDARD_POWER: {
      const pedalPower = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      if (pedalPower !== Constants.INVALID_BYTE) {
        if (pedalPower & Constants.BICYCLE_POWER_PEDAL_RIGHT_FLAG) {
          updates.pedalPower = pedalPower & Constants.LOWER_7_BITS_MASK;
          updates.rightPedalPower = updates.pedalPower;
          updates.leftPedalPower =
            Constants.PERCENT_MAX - updates.rightPedalPower;
        } else {
          updates.pedalPower = pedalPower & Constants.LOWER_7_BITS_MASK;
          updates.rightPedalPower = undefined;
          updates.leftPedalPower = undefined;
        }
      } else {
        updates.pedalPower = undefined;
        updates.rightPedalPower = undefined;
        updates.leftPedalPower = undefined;
      }
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      } else {
        updates.cadence = undefined;
      }
      updates.accumulatedPower = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      updates.power = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        true,
      );
      break;
    }
    case Constants.BICYCLE_POWER_PAGE_TORQUE: {
      const oldEventCount = state.eventCount;
      const oldTimeStamp = state.timeStamp;
      const oldTorqueTicksStamp = state.torqueTicksStamp;

      let eventCount = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      const slope = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        true,
      );
      let timeStamp = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      let torqueTicksStamp = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
        true,
      );

      if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
        updates.eventCount = eventCount;
        if (oldEventCount && oldEventCount > eventCount) {
          // Hit rollover value
          eventCount += Constants.BICYCLE_POWER_EVENT_COUNT_ROLLOVER;
        }

        updates.timeStamp = timeStamp;
        if (oldTimeStamp && oldTimeStamp > timeStamp) {
          // Hit rollover value
          timeStamp += Constants.BICYCLE_POWER_TIMESTAMP_ROLLOVER;
        }

        updates.slope = slope;
        updates.torqueTicksStamp = torqueTicksStamp;
        if (oldTorqueTicksStamp && oldTorqueTicksStamp > torqueTicksStamp) {
          // Hit rollover value
          torqueTicksStamp += Constants.BICYCLE_POWER_TORQUE_TICKS_ROLLOVER;
        }

        const elapsedTime =
          (timeStamp - (oldTimeStamp || Constants.DEFAULT_CHANNEL)) *
          Constants.BICYCLE_POWER_TIME_RESOLUTION_SECONDS;
        const torqueTicks =
          torqueTicksStamp - (oldTorqueTicksStamp || Constants.DEFAULT_CHANNEL);

        const cadencePeriod =
          elapsedTime /
          (eventCount - (oldEventCount || Constants.DEFAULT_CHANNEL)); // s
        const cadence = Math.round(
          Constants.BICYCLE_POWER_CADENCE_MINUTES_PER_HOUR / cadencePeriod,
        ); // rpm
        updates.calculatedCadence = cadence;

        const torqueFrequency =
          Constants.DEFAULT_INT_BYTE_LENGTH / (elapsedTime / torqueTicks) -
          (state.offset ?? Constants.DEFAULT_CHANNEL); // Hz
        const torque =
          torqueFrequency / (slope / Constants.BICYCLE_POWER_SLOPE_SCALE); // Nm
        updates.calculatedTorque = torque;

        updates.calculatedPower =
          (torque * cadence * Math.PI) / Constants.BICYCLE_POWER_POWER_DIVISOR; // Watts
      }
      break;
    }
    default:
      break;
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export class BicyclePowerSensor extends AntPlusSensor<BicyclePowerSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_BICYCLE_POWER;

  protected readonly deviceType = BicyclePowerSensor.deviceType;
  protected readonly period = Constants.PERIOD_BICYCLE_POWER;

  protected createState(deviceId: number): BicyclePowerSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<BicyclePowerSensorState>,
    data: DataView,
  ): BicyclePowerSensorState {
    return decodeBicyclePower(state, data);
  }
}

export class BicyclePowerScanner extends AntPlusScanner<BicyclePowerScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_BICYCLE_POWER;

  protected readonly deviceType = BicyclePowerScanner.deviceType;

  protected createState(deviceId: number): BicyclePowerScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<BicyclePowerScanState>,
    data: DataView,
  ): BicyclePowerScanState {
    return decodeBicyclePower(state, data);
  }
}
