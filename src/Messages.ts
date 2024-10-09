import { Constants } from "./Constants";

export class Messages {
  static BUFFER_INDEX_MSG_LEN = 1;

  static BUFFER_INDEX_MSG_TYPE = 2;

  static BUFFER_INDEX_CHANNEL_NUM = 3;

  static BUFFER_INDEX_MSG_DATA = 4;

  static BUFFER_INDEX_EXT_MSG_BEGIN = 12;

  resetSystem(): DataView {
    const payload: number[] = [];
    payload.push(0x00);
    return Messages.buildMessage(payload, Constants.MESSAGE_SYSTEM_RESET);
  }

  requestMessage(channel: number, messageID: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload.push(messageID);
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_REQUEST);
  }

  setNetworkKey(): DataView {
    const payload: number[] = [];
    payload.push(Constants.DEFAULT_NETWORK_NUMBER);
    payload.push(0xb9);
    payload.push(0xa5);
    payload.push(0x21);
    payload.push(0xfb);
    payload.push(0xbd);
    payload.push(0x72);
    payload.push(0xc3);
    payload.push(0x45);
    return Messages.buildMessage(payload, Constants.MESSAGE_NETWORK_KEY);
  }

  assignChannel(channel: number, type = "receive"): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    if (type === "receive") {
      payload.push(Constants.CHANNEL_TYPE_TWOWAY_RECEIVE);
    } else if (type === "receive_only") {
      payload.push(Constants.CHANNEL_TYPE_ONEWAY_RECEIVE);
    } else if (type === "receive_shared") {
      payload.push(Constants.CHANNEL_TYPE_SHARED_RECEIVE);
    } else if (type === "transmit") {
      payload.push(Constants.CHANNEL_TYPE_TWOWAY_TRANSMIT);
    } else if (type === "transmit_only") {
      payload.push(Constants.CHANNEL_TYPE_ONEWAY_TRANSMIT);
    } else if (type === "transmit_shared") {
      payload.push(Constants.CHANNEL_TYPE_SHARED_TRANSMIT);
    } else {
      throw "type not allowed";
    }
    payload.push(Constants.DEFAULT_NETWORK_NUMBER);
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_ASSIGN);
  }

  setDevice(
    channel: number,
    deviceID: number,
    deviceType: number,
    transmissionType: number,
  ): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload = payload.concat(Messages.intToLEHexArray(deviceID, 2));
    payload = payload.concat(Messages.intToLEHexArray(deviceType));
    payload = payload.concat(Messages.intToLEHexArray(transmissionType));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_ID);
  }

  searchChannel(channel: number, timeout: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload = payload.concat(Messages.intToLEHexArray(timeout));
    return Messages.buildMessage(
      payload,
      Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT,
    );
  }

  setPeriod(channel: number, period: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload = payload.concat(Messages.intToLEHexArray(period));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_PERIOD);
  }

  setFrequency(channel: number, frequency: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload = payload.concat(Messages.intToLEHexArray(frequency));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_FREQUENCY);
  }

  setRxExt(): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(0));
    payload = payload.concat(Messages.intToLEHexArray(1));
    return Messages.buildMessage(payload, Constants.MESSAGE_ENABLE_RX_EXT);
  }

  libConfig(channel: number, how: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    payload = payload.concat(Messages.intToLEHexArray(how));
    return Messages.buildMessage(payload, Constants.MESSAGE_LIB_CONFIG);
  }

  openRxScan(): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(0));
    payload = payload.concat(Messages.intToLEHexArray(1));
    return Messages.buildMessage(
      payload,
      Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN,
    );
  }

  openChannel(channel: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_OPEN);
  }

  closeChannel(channel: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_CLOSE);
  }

  unassignChannel(channel: number): DataView {
    let payload: number[] = [];
    payload = payload.concat(Messages.intToLEHexArray(channel));
    return Messages.buildMessage(payload, Constants.MESSAGE_CHANNEL_UNASSIGN);
  }

  acknowledgedData(channel: number, payload: number[]): DataView {
    const newPayload = Messages.intToLEHexArray(channel).concat(payload);
    return Messages.buildMessage(
      newPayload,
      Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA,
    );
  }

  broadcastData(channel: number, payload: number[]): DataView {
    const newPayload = Messages.intToLEHexArray(channel).concat(payload);
    return Messages.buildMessage(
      newPayload,
      Constants.MESSAGE_CHANNEL_BROADCAST_DATA,
    );
  }

  static buildMessage(payload: number[] = [], msgID = 0x00): DataView {
    const m: number[] = [];
    m.push(Constants.MESSAGE_TX_SYNC);
    m.push(payload.length);
    m.push(msgID);
    m.push(...payload);
    m.push(Messages.getChecksum(m));
    return new DataView(new Uint8Array(m).buffer);
  }

  static intToLEHexArray(int: number, numBytes = 1): number[] {
    const ret: number[] = [];
    const hexStr = Messages.decimalToHex(int, (numBytes || 1) * 2);
    const b = new DataView(
      new Uint8Array(
        hexStr.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [],
      ).buffer,
    );
    let i = b.byteLength - 1;
    while (i >= 0) {
      ret.push(b.getUint8(i));
      i--;
    }
    return ret;
  }

  static decimalToHex(d: number, numDigits: number): string {
    let hex = Number(d).toString(16);
    while (hex.length < (numDigits || 2)) {
      hex = `0${hex}`;
    }
    return hex;
  }

  static getChecksum(message: number[]): number {
    return message.reduce((acc, byte) => (acc ^ byte) % 0xff, 0);
  }
}
