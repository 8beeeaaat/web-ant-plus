/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#525_tab
 * Spec sheet: https://www.thisisant.com/resources/fitness-equipment-device/
 */

import { Constants } from "../constants.js";
import {
  AntPlusScanner,
  AntPlusSensor,
  type ScanState,
  type SensorState,
} from "./base.js";

export type EquipmentTypeValue =
  | "Treadmill"
  | "Elliptical"
  | "Reserved"
  | "Rower"
  | "Climber"
  | "NordicSkier"
  | "Trainer/StationaryBike"
  | "General";

export type HeartRateSourceValue = "HandContact" | "EM" | "ANT+";

export type EquipmentStateValue = "OFF" | "READY" | "IN_USE" | "FINISHED";

export type TargetStatusValue = "OnTarget" | "LowSpeed" | "HighSpeed";

export interface PairedDevice {
  readonly id: number;
  readonly type: number;
  readonly paired: boolean;
}

export interface FitnessEquipmentSensorState extends SensorState {
  /** Internal accumulator for the page 0x19 event count. */
  readonly eventCount0x19?: number;
  /** Internal accumulator for the page 0x1A event count. */
  readonly eventCount0x1A?: number;
  readonly temperature?: number;
  readonly zeroOffset?: number;
  readonly spinDownTime?: number;
  readonly equipmentType?: EquipmentTypeValue;
  readonly elapsedTime?: number;
  readonly distance?: number;
  readonly realSpeed?: number;
  readonly virtualSpeed?: number;
  readonly heartRate?: number;
  readonly heartRateSource?: HeartRateSourceValue;
  readonly state?: EquipmentStateValue;
  readonly cycleLength?: number;
  readonly incline?: number;
  readonly resistance?: number;
  readonly mets?: number;
  readonly caloricBurnRate?: number;
  readonly calories?: number;
  readonly ascendedDistance?: number;
  readonly descendedDistance?: number;
  readonly strides?: number;
  readonly strokes?: number;
  readonly cadence?: number;
  readonly accumulatedPower?: number;
  readonly instantaneousPower?: number;
  readonly averagePower?: number;
  readonly trainerStatus?: number;
  readonly targetStatus?: TargetStatusValue;
  readonly wheelTicks?: number;
  readonly wheelPeriod?: number;
  readonly torque?: number;
  readonly hwVersion?: number;
  readonly manId?: number;
  readonly modelNum?: number;
  readonly swVersion?: number;
  readonly serialNumber?: number;
  readonly pairedDevices?: readonly PairedDevice[];
  readonly receivedAt?: number;
}

export interface FitnessEquipmentScanState
  extends FitnessEquipmentSensorState,
    ScanState {}

type Draft<T> = { -readonly [K in keyof T]?: T[K] };

const RESET_UPDATES: Draft<FitnessEquipmentSensorState> = {
  elapsedTime: undefined,
  distance: undefined,
  realSpeed: undefined,
  virtualSpeed: undefined,
  heartRate: undefined,
  heartRateSource: undefined,
  cycleLength: undefined,
  incline: undefined,
  resistance: undefined,
  mets: undefined,
  caloricBurnRate: undefined,
  calories: undefined,
  eventCount0x19: undefined,
  eventCount0x1A: undefined,
  cadence: undefined,
  accumulatedPower: undefined,
  instantaneousPower: undefined,
  averagePower: undefined,
  trainerStatus: undefined,
  targetStatus: undefined,
  ascendedDistance: undefined,
  descendedDistance: undefined,
  strides: undefined,
  strokes: undefined,
  wheelTicks: undefined,
  wheelPeriod: undefined,
  torque: undefined,
};

/**
 * Clears all session values (accumulators, live measurements) while
 * keeping device identity and static information. Pure: returns a new
 * state object.
 */
export function resetFitnessEquipmentState<
  TState extends FitnessEquipmentSensorState,
>(state: Readonly<TState>): TState {
  return { ...state, ...RESET_UPDATES } as TState;
}

/**
 * Decodes the "FE state" nibble shared by most data pages. Entering the
 * READY state resets the session values, matching the legacy behaviour.
 */
function applyEquipmentState(
  updates: Draft<FitnessEquipmentSensorState>,
  stateBits: number,
): void {
  switch (stateBits) {
    case Constants.FITNESS_STATE_OFF:
      updates.state = "OFF";
      break;
    case Constants.FITNESS_STATE_READY:
      updates.state = "READY";
      Object.assign(updates, RESET_UPDATES);
      break;
    case Constants.FITNESS_STATE_IN_USE:
      updates.state = "IN_USE";
      break;
    case Constants.FITNESS_STATE_FINISHED:
      updates.state = "FINISHED";
      break;
    default:
      updates.state = undefined;
      break;
  }
}

/**
 * Decodes one fitness equipment broadcast page. Pure: returns the next
 * state instead of mutating the given one.
 */
export function decodeFitnessEquipment<
  TState extends FitnessEquipmentSensorState,
>(state: Readonly<TState>, data: DataView): TState {
  const updates: Draft<FitnessEquipmentSensorState> = {};
  const page = data.getUint8(Constants.BUFFER_INDEX_MSG_DATA);
  switch (page) {
    case Constants.FITNESS_PAGE_CALIBRATION: {
      // Calibration request/response.
      const temperature = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      if (temperature !== Constants.INVALID_BYTE) {
        updates.temperature =
          Constants.FITNESS_TEMP_OFFSET +
          temperature * Constants.FITNESS_TEMP_SCALE;
      }
      const calBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      if (calBF & Constants.FITNESS_ZERO_OFFSET_FLAG) {
        updates.zeroOffset = data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
          true,
        );
      }
      if (calBF & Constants.FITNESS_SPIN_DOWN_TIME_FLAG) {
        updates.spinDownTime = data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
          true,
        );
      }
      break;
    }
    case Constants.FITNESS_PAGE_GENERAL_FE: {
      // General FE data.
      const equipmentTypeBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      switch (equipmentTypeBF & Constants.FITNESS_EQUIPMENT_TYPE_MASK) {
        case Constants.FITNESS_EQUIPMENT_TYPE_TREADMILL:
          updates.equipmentType = "Treadmill";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_ELLIPTICAL:
          updates.equipmentType = "Elliptical";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_RESERVED:
          updates.equipmentType = "Reserved";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_ROWER:
          updates.equipmentType = "Rower";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_CLIMBER:
          updates.equipmentType = "Climber";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_NORDIC_SKIER:
          updates.equipmentType = "NordicSkier";
          break;
        case Constants.FITNESS_EQUIPMENT_TYPE_TRAINER:
          updates.equipmentType = "Trainer/StationaryBike";
          break;
        default:
          updates.equipmentType = "General";
          break;
      }
      let elapsedTime = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      let distance = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const speed = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      const heartRate = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
      );
      const capStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );
      if (heartRate !== Constants.INVALID_BYTE) {
        switch (capStateBF & Constants.FITNESS_HEART_RATE_SOURCE_MASK) {
          case Constants.FITNESS_HEART_RATE_SOURCE_HAND_CONTACT: {
            updates.heartRate = heartRate;
            updates.heartRateSource = "HandContact";
            break;
          }
          case Constants.FITNESS_HEART_RATE_SOURCE_EM: {
            updates.heartRate = heartRate;
            updates.heartRateSource = "EM";
            break;
          }
          case Constants.FITNESS_HEART_RATE_SOURCE_ANT_PLUS: {
            updates.heartRate = heartRate;
            updates.heartRateSource = "ANT+";
            break;
          }
          default: {
            updates.heartRate = undefined;
            updates.heartRateSource = undefined;
            break;
          }
        }
      }

      elapsedTime /= Constants.FITNESS_ELAPSED_TIME_SCALE;
      const oldElapsedTime =
        (state.elapsedTime || 0) % Constants.FITNESS_ELAPSED_TIME_ROLLOVER;
      if (elapsedTime !== oldElapsedTime) {
        if (oldElapsedTime > elapsedTime) {
          // Hit rollover value
          elapsedTime += Constants.FITNESS_ELAPSED_TIME_ROLLOVER;
        }
      }
      updates.elapsedTime =
        (state.elapsedTime || 0) + elapsedTime - oldElapsedTime;

      if (capStateBF & Constants.FITNESS_DISTANCE_ENABLED_FLAG) {
        const oldDistance =
          (state.distance || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (distance !== oldDistance) {
          if (oldDistance > distance) {
            // Hit rollover value
            distance += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.distance = (state.distance || 0) + distance - oldDistance;
      } else {
        updates.distance = undefined;
      }
      if (capStateBF & Constants.FITNESS_VIRTUAL_SPEED_FLAG) {
        updates.virtualSpeed = speed / Constants.FITNESS_SPEED_SCALE;
        updates.realSpeed = undefined;
      } else {
        updates.virtualSpeed = undefined;
        updates.realSpeed = speed / Constants.FITNESS_SPEED_SCALE;
      }
      applyEquipmentState(
        updates,
        (capStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (capStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }
      break;
    }
    case Constants.FITNESS_PAGE_GENERAL_SETTINGS: {
      // General settings.
      const cycleLen = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const incline = data.getInt16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      const resistance = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
      );
      const capStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );
      if (cycleLen !== Constants.INVALID_BYTE) {
        updates.cycleLength = cycleLen / Constants.FITNESS_CYCLE_LENGTH_SCALE;
      }
      if (
        incline >= Constants.FITNESS_INCLINE_MIN &&
        incline <= Constants.FITNESS_INCLINE_MAX
      ) {
        updates.incline = incline / Constants.FITNESS_INCLINE_SCALE;
      }
      if (resistance !== Constants.INVALID_BYTE) {
        updates.resistance = resistance;
      }
      applyEquipmentState(
        updates,
        (capStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (capStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }
      break;
    }
    case Constants.FITNESS_PAGE_METABOLIC_DATA: {
      // General FE metabolic data.
      const mets = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
        true,
      );
      const caloricbr = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      const calories = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
      );
      const capStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );
      if (mets !== Constants.INVALID_UINT16) {
        updates.mets = mets / Constants.FITNESS_METS_SCALE;
      }
      if (caloricbr !== Constants.INVALID_UINT16) {
        updates.caloricBurnRate =
          caloricbr / Constants.FITNESS_CALORIC_BURN_RATE_SCALE;
      }
      if (capStateBF & Constants.FITNESS_CALORIES_FLAG) {
        updates.calories = calories;
      }
      applyEquipmentState(
        updates,
        (capStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (capStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }
      break;
    }
    case Constants.FITNESS_PAGE_TREADMILL: {
      // Treadmill-specific data.
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      );
      let negDistance = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
      );
      let posDistance = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (flagStateBF & Constants.FITNESS_NEG_DISTANCE_FLAG) {
        const oldNegDistance =
          (state.descendedDistance || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (negDistance !== oldNegDistance) {
          if (oldNegDistance > negDistance) {
            negDistance += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.descendedDistance =
          (state.descendedDistance || 0) + negDistance - oldNegDistance;
      }

      if (flagStateBF & Constants.FITNESS_POS_DISTANCE_FLAG) {
        const oldPosDistance =
          (state.ascendedDistance || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (posDistance !== oldPosDistance) {
          if (oldPosDistance > posDistance) {
            posDistance += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.ascendedDistance =
          (state.ascendedDistance || 0) + posDistance - oldPosDistance;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.FITNESS_PAGE_ELLIPTICAL: {
      // Elliptical-specific data.
      let posDistance = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      let strides = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      );
      const power = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (power !== Constants.INVALID_UINT16) {
        updates.instantaneousPower = power;
      }

      if (flagStateBF & Constants.FITNESS_NEG_DISTANCE_FLAG) {
        const oldPosDistance =
          (state.ascendedDistance || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (posDistance !== oldPosDistance) {
          if (oldPosDistance > posDistance) {
            posDistance += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.ascendedDistance =
          (state.ascendedDistance || 0) + posDistance - oldPosDistance;
      }

      if (flagStateBF & Constants.FITNESS_POS_DISTANCE_FLAG) {
        const oldStrides =
          (state.strides || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (strides !== oldStrides) {
          if (oldStrides > strides) {
            strides += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.strides = (state.strides || 0) + strides - oldStrides;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.FITNESS_PAGE_ROWER: {
      // Rower-specific data.
      let strokes = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      );
      const power = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (power !== Constants.INVALID_UINT16) {
        updates.instantaneousPower = power;
      }

      if (flagStateBF & Constants.FITNESS_POS_DISTANCE_FLAG) {
        const oldStrokes =
          (state.strokes || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (strokes !== oldStrokes) {
          if (oldStrokes > strokes) {
            strokes += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.strokes = (state.strokes || 0) + strokes - oldStrokes;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.FITNESS_PAGE_CLIMBER: {
      // Climber-specific data.
      let strides = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      );
      const power = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (power !== Constants.INVALID_UINT16) {
        updates.instantaneousPower = power;
      }

      if (flagStateBF & Constants.FITNESS_POS_DISTANCE_FLAG) {
        const oldStrides =
          (state.strides || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (strides !== oldStrides) {
          if (oldStrides > strides) {
            strides += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.strides = (state.strides || 0) + strides - oldStrides;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.FITNESS_PAGE_NORDIC_SKIER: {
      // Nordic skier-specific data.
      let strides = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
      );
      const power = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (power !== Constants.INVALID_UINT16) {
        updates.instantaneousPower = power;
      }

      if (flagStateBF & Constants.FITNESS_POS_DISTANCE_FLAG) {
        const oldStrides =
          (state.strides || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
        if (strides !== oldStrides) {
          if (oldStrides > strides) {
            strides += Constants.FITNESS_DISTANCE_ROLLOVER;
          }
        }
        updates.strides = (state.strides || 0) + strides - oldStrides;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.FITNESS_PAGE_TRAINER_POWER: {
      // Trainer/stationary bike-specific data (power).
      const oldEventCount = state.eventCount0x19 || 0;

      let eventCount = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      const cadence = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      let accPower = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        true,
      );
      const power =
        data.getUint16(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
          true,
        ) & Constants.FITNESS_POWER_MASK;
      const trainerStatus =
        data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_6,
        ) >> Constants.FITNESS_TRAINER_STATUS_SHIFT;
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (eventCount !== oldEventCount) {
        updates.eventCount0x19 = eventCount;
        if (oldEventCount > eventCount) {
          // Hit rollover value
          eventCount += Constants.FITNESS_EVENT_COUNT_ROLLOVER;
        }
      }

      if (cadence !== Constants.INVALID_BYTE) {
        updates.cadence = cadence;
      }

      if (power !== Constants.INVALID_UINT12) {
        updates.instantaneousPower = power;

        const oldAccPower =
          (state.accumulatedPower || 0) % Constants.UINT16_ROLLOVER;
        if (accPower !== oldAccPower) {
          if (oldAccPower > accPower) {
            accPower += Constants.UINT16_ROLLOVER;
          }
        }
        updates.accumulatedPower =
          (state.accumulatedPower || 0) + accPower - oldAccPower;

        updates.averagePower =
          (accPower - oldAccPower) / (eventCount - oldEventCount);
      }

      updates.trainerStatus = trainerStatus;

      switch (flagStateBF & Constants.FITNESS_TARGET_STATUS_MASK) {
        case Constants.FITNESS_TARGET_STATUS_ON_TARGET:
          updates.targetStatus = "OnTarget";
          break;
        case Constants.FITNESS_TARGET_STATUS_LOW_SPEED:
          updates.targetStatus = "LowSpeed";
          break;
        case Constants.FITNESS_TARGET_STATUS_HIGH_SPEED:
          updates.targetStatus = "HighSpeed";
          break;
        default:
          updates.targetStatus = undefined;
          break;
      }

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }
      break;
    }
    case Constants.FITNESS_PAGE_TRAINER_TORQUE: {
      // Trainer/stationary bike-specific data (torque).
      const oldEventCount = state.eventCount0x1A || 0;

      let eventCount = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      let wheelTicks = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      let accWheelPeriod = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        true,
      );
      let accTorque = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_5,
        true,
      );
      const flagStateBF = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      if (eventCount !== oldEventCount) {
        updates.eventCount0x1A = eventCount;
        if (oldEventCount > eventCount) {
          // Hit rollover value
          eventCount += Constants.FITNESS_EVENT_COUNT_ROLLOVER;
        }
      }

      const oldWheelTicks =
        (state.wheelTicks || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
      if (wheelTicks !== oldWheelTicks) {
        if (oldWheelTicks > wheelTicks) {
          wheelTicks += Constants.UINT16_ROLLOVER;
        }
      }
      updates.wheelTicks = (state.wheelTicks || 0) + wheelTicks - oldWheelTicks;

      const oldWheelPeriod =
        (state.wheelPeriod || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
      if (accWheelPeriod !== oldWheelPeriod) {
        if (oldWheelPeriod > accWheelPeriod) {
          accWheelPeriod += Constants.UINT16_ROLLOVER;
        }
      }
      updates.wheelPeriod =
        (state.wheelPeriod || 0) + accWheelPeriod - oldWheelPeriod;

      const oldTorque =
        (state.torque || 0) % Constants.FITNESS_DISTANCE_ROLLOVER;
      if (accTorque !== oldTorque) {
        if (oldTorque > accTorque) {
          accTorque += Constants.UINT16_ROLLOVER;
        }
      }
      updates.torque = (state.torque || 0) + accTorque - oldTorque;

      applyEquipmentState(
        updates,
        (flagStateBF & Constants.FITNESS_STATE_MASK) >>
          Constants.FITNESS_STATE_SHIFT,
      );
      if (flagStateBF & Constants.FITNESS_LAP_FLAG) {
        // lap
      }

      break;
    }
    case Constants.DATA_PAGE_COMMON_MANUFACTURER_INFO: {
      // Manufacturer's information.
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
      // Product information.
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
    case Constants.FITNESS_PAGE_PAIRED_DEVICES: {
      // Paired devices.
      const idx = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_1,
      );
      const tot = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_2,
      );
      const chState = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
      );
      const devId = data.getUint16(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_4,
        true,
      );
      const devType = data.getUint8(
        Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_7,
      );

      let pairedDevices = state.pairedDevices ?? [];

      if (idx === Constants.DEFAULT_CHANNEL) {
        pairedDevices = [];
      }

      if (tot > Constants.DEFAULT_CHANNEL) {
        pairedDevices = [
          ...pairedDevices,
          {
            id: devId,
            type: devType,
            paired: !!(chState & Constants.TOGGLE_MASK),
          },
        ];
      }

      updates.pairedDevices = pairedDevices;

      break;
    }
    default:
      break;
  }

  updates.receivedAt = Date.now();

  return { ...state, ...updates } as TState;
}

export interface UserConfigurationOptions {
  /** User weight in kg. */
  userWeight?: number;
  /** Bicycle weight in kg. */
  bikeWeight?: number;
  /** Bicycle wheel diameter in m. */
  wheelDiameter?: number;
  /** Front-to-rear gear ratio. */
  gearRatio?: number;
}

export interface WindResistanceOptions {
  /** Wind resistance coefficient in kg/m. */
  windCoeff?: number;
  /** Wind speed in km/h (head wind positive, tail wind negative). */
  windSpeed?: number;
  /** Drafting factor from 0 to 1. */
  draftFactor?: number;
}

export interface TrackResistanceOptions {
  /** Grade in %. */
  slope?: number;
  /** Coefficient of rolling resistance. */
  rollingResistanceCoeff?: number;
}

/** Builds the page 0x37 (user configuration) payload. */
export function buildUserConfigurationPayload(
  options: UserConfigurationOptions = {},
): number[] {
  const { userWeight, bikeWeight, wheelDiameter, gearRatio } = options;
  const m =
    userWeight === undefined
      ? Constants.INVALID_UINT16
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_USER_WEIGHT_MAX,
            Math.round(userWeight * Constants.FITNESS_USER_WEIGHT_SCALE),
          ),
        );
  const df =
    wheelDiameter === undefined
      ? Constants.INVALID_BYTE
      : Math.round(
          wheelDiameter * Constants.FITNESS_WHEEL_DIAMETER_FRACTION_SCALE,
        ) % Constants.FITNESS_WHEEL_DIAMETER_FRACTION_MODULO;
  const mb =
    bikeWeight === undefined
      ? Constants.INVALID_UINT12
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_BIKE_WEIGHT_MAX,
            Math.round(bikeWeight * Constants.FITNESS_BIKE_WEIGHT_SCALE),
          ),
        );
  const d =
    wheelDiameter === undefined
      ? Constants.INVALID_BYTE
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_WHEEL_DIAMETER_MAX,
            Math.round(wheelDiameter),
          ),
        );
  const gr =
    gearRatio === undefined
      ? Constants.DEFAULT_CHANNEL
      : Math.max(
          Constants.FITNESS_GEAR_RATIO_MIN_ENCODED,
          Math.min(
            Constants.FITNESS_GEAR_RATIO_MAX_ENCODED,
            Math.round(gearRatio / Constants.FITNESS_GEAR_RATIO_SCALE),
          ),
        );
  return [
    Constants.FITNESS_PAGE_USER_CONFIGURATION,
    m & Constants.BYTE_MASK,
    (m >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
    Constants.INVALID_BYTE,
    (df & Constants.NIBBLE_MASK) |
      ((mb & Constants.NIBBLE_MASK) << Constants.NIBBLE_BITS),
    (mb >> Constants.NIBBLE_BITS) & Constants.NIBBLE_MASK,
    d & Constants.BYTE_MASK,
    gr & Constants.BYTE_MASK,
  ];
}

/** Builds the page 0x30 (basic resistance) payload. */
export function buildBasicResistancePayload(resistance: number): number[] {
  const res = Math.max(
    Constants.DEFAULT_CHANNEL,
    Math.min(
      Constants.FITNESS_BASIC_RESISTANCE_MAX_ENCODED,
      Math.round(resistance * Constants.FITNESS_BASIC_RESISTANCE_SCALE),
    ),
  );
  return [
    Constants.FITNESS_PAGE_BASIC_RESISTANCE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    res & Constants.BYTE_MASK,
  ];
}

/** Builds the page 0x31 (target power) payload. */
export function buildTargetPowerPayload(power: number): number[] {
  const p = Math.max(
    Constants.DEFAULT_CHANNEL,
    Math.min(
      Constants.FITNESS_TARGET_POWER_MAX_ENCODED,
      Math.round(power * Constants.FITNESS_TARGET_POWER_SCALE),
    ),
  );
  return [
    Constants.FITNESS_PAGE_TARGET_POWER,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    p & Constants.BYTE_MASK,
    (p >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
  ];
}

/** Builds the page 0x32 (wind resistance) payload. */
export function buildWindResistancePayload(
  options: WindResistanceOptions = {},
): number[] {
  const { windCoeff, windSpeed, draftFactor } = options;
  const wc =
    windCoeff === undefined
      ? Constants.INVALID_BYTE
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_WIND_COEFF_MAX_ENCODED,
            Math.round(windCoeff * Constants.FITNESS_WIND_COEFF_SCALE),
          ),
        );
  const ws =
    windSpeed === undefined
      ? Constants.INVALID_BYTE
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_WIND_SPEED_MAX_ENCODED,
            Math.round(windSpeed + Constants.FITNESS_WIND_SPEED_OFFSET),
          ),
        );
  const df =
    draftFactor === undefined
      ? Constants.INVALID_BYTE
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_DRAFT_FACTOR_MAX_ENCODED,
            Math.round(draftFactor * Constants.FITNESS_DRAFT_FACTOR_SCALE),
          ),
        );
  return [
    Constants.FITNESS_PAGE_WIND_RESISTANCE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    wc & Constants.BYTE_MASK,
    ws & Constants.BYTE_MASK,
    df & Constants.BYTE_MASK,
  ];
}

/** Builds the page 0x33 (track resistance) payload. */
export function buildTrackResistancePayload(
  options: TrackResistanceOptions = {},
): number[] {
  const { slope, rollingResistanceCoeff } = options;
  const s =
    slope === undefined
      ? Constants.INVALID_UINT16
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_TRACK_SLOPE_MAX_ENCODED,
            Math.round(
              (slope + Constants.FITNESS_TRACK_SLOPE_OFFSET) *
                Constants.FITNESS_TRACK_SLOPE_SCALE,
            ),
          ),
        );
  const rr =
    rollingResistanceCoeff === undefined
      ? Constants.INVALID_BYTE
      : Math.max(
          Constants.DEFAULT_CHANNEL,
          Math.min(
            Constants.FITNESS_ROLLING_RESISTANCE_MAX_ENCODED,
            Math.round(
              rollingResistanceCoeff *
                Constants.FITNESS_ROLLING_RESISTANCE_SCALE,
            ),
          ),
        );
  return [
    Constants.FITNESS_PAGE_TRACK_RESISTANCE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    Constants.INVALID_BYTE,
    s & Constants.BYTE_MASK,
    (s >> Constants.BYTE_BITS) & Constants.BYTE_MASK,
    rr & Constants.BYTE_MASK,
  ];
}

export class FitnessEquipmentSensor extends AntPlusSensor<FitnessEquipmentSensorState> {
  static readonly deviceType = Constants.DEVICE_TYPE_FITNESS_EQUIPMENT;

  protected readonly deviceType = FitnessEquipmentSensor.deviceType;
  protected readonly period = Constants.PERIOD_FITNESS_EQUIPMENT;

  protected createState(deviceId: number): FitnessEquipmentSensorState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<FitnessEquipmentSensorState>,
    data: DataView,
  ): FitnessEquipmentSensorState {
    return decodeFitnessEquipment(state, data);
  }

  /**
   * Sends the user configuration (page 0x37). Resolves with the
   * delivery result reported by the stick.
   */
  setUserConfiguration(
    options: UserConfigurationOptions = {},
  ): Promise<boolean> {
    return this.sendAcknowledgedData(buildUserConfigurationPayload(options));
  }

  /**
   * Sets the basic resistance (page 0x30) as a percentage from 0 to
   * 100. Resolves with the delivery result reported by the stick.
   */
  setBasicResistance(resistance: number): Promise<boolean> {
    return this.sendAcknowledgedData(buildBasicResistancePayload(resistance));
  }

  /**
   * Sets the target power (page 0x31) in watts. Resolves with the
   * delivery result reported by the stick.
   */
  setTargetPower(power: number): Promise<boolean> {
    return this.sendAcknowledgedData(buildTargetPowerPayload(power));
  }

  /**
   * Sets the wind resistance simulation parameters (page 0x32).
   * Resolves with the delivery result reported by the stick.
   */
  setWindResistance(options: WindResistanceOptions = {}): Promise<boolean> {
    return this.sendAcknowledgedData(buildWindResistancePayload(options));
  }

  /**
   * Sets the track resistance simulation parameters (page 0x33).
   * Resolves with the delivery result reported by the stick.
   */
  setTrackResistance(options: TrackResistanceOptions = {}): Promise<boolean> {
    return this.sendAcknowledgedData(buildTrackResistancePayload(options));
  }
}

export class FitnessEquipmentScanner extends AntPlusScanner<FitnessEquipmentScanState> {
  static readonly deviceType = Constants.DEVICE_TYPE_FITNESS_EQUIPMENT;

  protected readonly deviceType = FitnessEquipmentScanner.deviceType;

  protected createState(deviceId: number): FitnessEquipmentScanState {
    return { deviceId };
  }

  protected decodeState(
    state: Readonly<FitnessEquipmentScanState>,
    data: DataView,
  ): FitnessEquipmentScanState {
    return decodeFitnessEquipment(state, data);
  }
}
