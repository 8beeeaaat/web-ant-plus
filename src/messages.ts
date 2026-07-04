import { Constants } from "./constants.js";

/** An encoded ANT message, always backed by a plain ArrayBuffer. */
export type AntMessage = DataView<ArrayBuffer>;

export const BUFFER_INDEX_MSG_LEN = Constants.BUFFER_INDEX_MSG_LEN;
export const BUFFER_INDEX_MSG_TYPE = Constants.BUFFER_INDEX_MSG_TYPE;
export const BUFFER_INDEX_CHANNEL_NUM = Constants.BUFFER_INDEX_CHANNEL_NUM;
export const BUFFER_INDEX_MSG_DATA = Constants.BUFFER_INDEX_MSG_DATA;
export const BUFFER_INDEX_EXT_MSG_BEGIN = Constants.BUFFER_INDEX_EXT_MSG_BEGIN;

export type ChannelType =
  | "receive"
  | "receive_only"
  | "receive_shared"
  | "transmit"
  | "transmit_only"
  | "transmit_shared";

const CHANNEL_TYPE_CODES: Record<ChannelType, number> = {
  receive: Constants.CHANNEL_TYPE_TWOWAY_RECEIVE,
  receive_only: Constants.CHANNEL_TYPE_ONEWAY_RECEIVE,
  receive_shared: Constants.CHANNEL_TYPE_SHARED_RECEIVE,
  transmit: Constants.CHANNEL_TYPE_TWOWAY_TRANSMIT,
  transmit_only: Constants.CHANNEL_TYPE_ONEWAY_TRANSMIT,
  transmit_shared: Constants.CHANNEL_TYPE_SHARED_TRANSMIT,
};

export function getChecksum(message: ArrayLike<number>): number {
  let checksum = Constants.DEFAULT_CHANNEL;
  for (let i = Constants.DEFAULT_CHANNEL; i < message.length; i++) {
    checksum ^= message[i] ?? Constants.DEFAULT_CHANNEL;
  }
  return checksum;
}

export function buildMessage(
  payload: readonly number[],
  messageId: number,
): AntMessage {
  const message = [
    Constants.MESSAGE_TX_SYNC,
    payload.length,
    messageId,
    ...payload,
  ];
  message.push(getChecksum(message));
  return new DataView(new Uint8Array(message).buffer);
}

/** Encodes an unsigned integer as little-endian bytes of a fixed width. */
export function intToLEByteArray(
  value: number,
  numBytes: number = Constants.DEFAULT_INT_BYTE_LENGTH,
): number[] {
  const bytes: number[] = [];
  for (let i = Constants.DEFAULT_CHANNEL; i < numBytes; i++) {
    bytes.push((value >>> (Constants.BYTE_BITS * i)) & Constants.BYTE_MASK);
  }
  return bytes;
}

export function resetSystem(): AntMessage {
  return buildMessage(
    [Constants.DEFAULT_CHANNEL],
    Constants.MESSAGE_SYSTEM_RESET,
  );
}

export function requestMessage(channel: number, messageId: number): AntMessage {
  return buildMessage([channel, messageId], Constants.MESSAGE_CHANNEL_REQUEST);
}

export function setNetworkKey(): AntMessage {
  return buildMessage(
    [Constants.DEFAULT_NETWORK_NUMBER, ...Constants.ANT_NETWORK_KEY],
    Constants.MESSAGE_NETWORK_KEY,
  );
}

export function assignChannel(
  channel: number,
  type: ChannelType = "receive",
): AntMessage {
  return buildMessage(
    [channel, CHANNEL_TYPE_CODES[type], Constants.DEFAULT_NETWORK_NUMBER],
    Constants.MESSAGE_CHANNEL_ASSIGN,
  );
}

export function setDevice(
  channel: number,
  deviceId: number,
  deviceType: number,
  transmissionType: number,
): AntMessage {
  return buildMessage(
    [
      channel,
      ...intToLEByteArray(deviceId, Constants.UINT16_BYTE_LENGTH),
      deviceType,
      transmissionType,
    ],
    Constants.MESSAGE_CHANNEL_ID,
  );
}

export function searchChannel(channel: number, timeout: number): AntMessage {
  return buildMessage(
    [channel, timeout],
    Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT,
  );
}

export function setPeriod(channel: number, period: number): AntMessage {
  return buildMessage(
    [channel, ...intToLEByteArray(period, Constants.UINT16_BYTE_LENGTH)],
    Constants.MESSAGE_CHANNEL_PERIOD,
  );
}

export function setFrequency(channel: number, frequency: number): AntMessage {
  return buildMessage(
    [channel, frequency],
    Constants.MESSAGE_CHANNEL_FREQUENCY,
  );
}

export function setRxExt(): AntMessage {
  return buildMessage(
    [Constants.DEFAULT_CHANNEL, Constants.CAPABILITIES_LED_ENABLED],
    Constants.MESSAGE_ENABLE_RX_EXT,
  );
}

export function libConfig(channel: number, how: number): AntMessage {
  return buildMessage([channel, how], Constants.MESSAGE_LIB_CONFIG);
}

export function openRxScan(): AntMessage {
  return buildMessage(
    [Constants.DEFAULT_CHANNEL, Constants.CAPABILITIES_LED_ENABLED],
    Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN,
  );
}

export function openChannel(channel: number): AntMessage {
  return buildMessage([channel], Constants.MESSAGE_CHANNEL_OPEN);
}

export function closeChannel(channel: number): AntMessage {
  return buildMessage([channel], Constants.MESSAGE_CHANNEL_CLOSE);
}

export function unassignChannel(channel: number): AntMessage {
  return buildMessage([channel], Constants.MESSAGE_CHANNEL_UNASSIGN);
}

export function acknowledgedData(
  channel: number,
  payload: readonly number[],
): AntMessage {
  return buildMessage(
    [channel, ...payload],
    Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA,
  );
}

export function broadcastData(
  channel: number,
  payload: readonly number[],
): AntMessage {
  return buildMessage(
    [channel, ...payload],
    Constants.MESSAGE_CHANNEL_BROADCAST_DATA,
  );
}
