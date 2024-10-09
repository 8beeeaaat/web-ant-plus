import { Constants } from "../Constants";
import { Messages } from "../Messages";
import type { USBDriver } from "../USBDriver";
import type { SendCallback } from "../ant";
import { EventEmitter } from "../lib/EventEmitter";

export type AttachProps = {
  channel: number;
  deviceID: number;
  type?: string;
  deviceType?: number;
  transmissionType?: number;
  timeout?: number;
  period?: number;
};

export abstract class BaseSensor extends EventEmitter {
  channel: number | undefined;
  deviceID: number | undefined;
  transmissionType: number | undefined;

  private msgQueue: { msg: DataView; cbk?: SendCallback }[] = [];

  protected decodeDataCbk: ((data: DataView) => void) | undefined;
  protected statusCbk:
    | ((status: { msg: number; code: number }) => Promise<boolean>)
    | undefined;

  protected abstract updateState(deviceId: number, data: DataView): void;

  constructor(public stick: USBDriver) {
    super();
    this.stick = stick;
    this.stick.on("read", this.handleEventMessages.bind(this));
  }

  protected async scan(type: string, frequency: number) {
    if (this.channel !== undefined) {
      throw "already attached";
    }

    if (!this.stick.canScan) {
      throw "stick cannot scan";
    }

    const channel = 0;
    const mc = this.msgQueue.shift();
    const onStatus = async (status: { msg: number; code: number }) => {
      switch (status.msg) {
        case Constants.MESSAGE_RF:
          switch (status.code) {
            case Constants.EVENT_CHANNEL_CLOSED:
            case Constants.EVENT_RX_FAIL_GO_TO_SEARCH:
              await this.write(this.stick.messages.unassignChannel(channel));
              return true;
            case Constants.EVENT_TRANSFER_TX_COMPLETED:
            case Constants.EVENT_TRANSFER_TX_FAILED:
            case Constants.EVENT_RX_FAIL:
            case Constants.INVALID_SCAN_TX_CHANNEL:
              if (mc?.cbk) {
                mc.cbk(status.code === Constants.EVENT_TRANSFER_TX_COMPLETED);
              }
              if (this.msgQueue.length) {
                await this.write(this.msgQueue[0].msg);
              }
              return true;
            default:
              break;
          }
          break;
        case Constants.MESSAGE_CHANNEL_ASSIGN:
          await this.write(this.stick.messages.setDevice(channel, 0, 0, 0));
          return true;
        case Constants.MESSAGE_CHANNEL_ID:
          await this.write(
            this.stick.messages.setFrequency(channel, frequency),
          );
          return true;
        case Constants.MESSAGE_CHANNEL_FREQUENCY:
          await this.write(this.stick.messages.setRxExt());
          return true;
        case Constants.MESSAGE_ENABLE_RX_EXT:
          await this.write(this.stick.messages.libConfig(channel, 0xe0));
          return true;
        case Constants.MESSAGE_LIB_CONFIG:
          await this.write(this.stick.messages.openRxScan());
          return true;
        case Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN:
          queueMicrotask(() => this.emit("attached"));
          return true;
        case Constants.MESSAGE_CHANNEL_CLOSE:
          return true;
        case Constants.MESSAGE_CHANNEL_UNASSIGN:
          this.statusCbk = undefined;
          this.channel = undefined;
          queueMicrotask(() => this.emit("detached"));
          return true;
        case Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA:
          return status.code === Constants.TRANSFER_IN_PROGRESS;
        default:
          break;
      }
      return false;
    };

    if (this.stick.isScanning()) {
      this.channel = channel;
      this.deviceID = 0;
      this.transmissionType = 0;

      this.statusCbk = onStatus;

      queueMicrotask(() => this.emit("attached"));
    } else if (this.stick.attach(this, true)) {
      this.channel = channel;
      this.deviceID = 0;
      this.transmissionType = 0;

      this.statusCbk = onStatus;

      await this.write(this.stick.messages.assignChannel(channel, type));
    } else {
      throw "cannot attach";
    }
  }

  protected async attach(
    props: AttachProps & {
      frequency: number;
    },
  ) {
    const {
      channel,
      deviceID,
      type,
      deviceType,
      transmissionType,
      timeout,
      period,
      frequency,
    } = props;
    if (this.channel !== undefined) {
      throw "already attached";
    }
    if (!this.stick.attach(this, false)) {
      throw "cannot attach";
    }

    this.channel = channel;
    this.deviceID = deviceID;
    this.transmissionType = transmissionType;

    const mc = this.msgQueue.shift();
    const onStatus = async (status: { msg: number; code: number }) => {
      switch (status.msg) {
        case Constants.MESSAGE_RF:
          switch (status.code) {
            case Constants.EVENT_CHANNEL_CLOSED:
            case Constants.EVENT_RX_FAIL_GO_TO_SEARCH:
              await this.write(this.stick.messages.unassignChannel(channel));
              return true;
            case Constants.EVENT_TRANSFER_TX_COMPLETED:
            case Constants.EVENT_TRANSFER_TX_FAILED:
            case Constants.EVENT_RX_FAIL:
            case Constants.INVALID_SCAN_TX_CHANNEL:
              if (mc?.cbk) {
                mc.cbk(status.code === Constants.EVENT_TRANSFER_TX_COMPLETED);
              }
              if (this.msgQueue.length) {
                await this.write(this.msgQueue[0].msg);
              }
              return true;
            default:
              break;
          }
          break;
        case Constants.MESSAGE_CHANNEL_ASSIGN:
          if (deviceType === undefined) {
            throw "deviceType required";
          }
          if (transmissionType === undefined) {
            throw "transmissionType required";
          }
          await this.write(
            this.stick.messages.setDevice(
              channel,
              deviceID,
              deviceType,
              transmissionType,
            ),
          );
          return true;
        case Constants.MESSAGE_CHANNEL_ID:
          if (timeout === undefined) {
            throw "timeout required";
          }
          await this.write(this.stick.messages.searchChannel(channel, timeout));
          return true;
        case Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT:
          await this.write(
            this.stick.messages.setFrequency(channel, frequency),
          );
          return true;
        case Constants.MESSAGE_CHANNEL_FREQUENCY:
          if (period === undefined) {
            throw "period required";
          }
          await this.write(this.stick.messages.setPeriod(channel, period));
          return true;
        case Constants.MESSAGE_CHANNEL_PERIOD:
          await this.write(this.stick.messages.libConfig(channel, 0xe0));
          return true;
        case Constants.MESSAGE_LIB_CONFIG:
          await this.write(this.stick.messages.openChannel(channel));
          return true;
        case Constants.MESSAGE_CHANNEL_OPEN:
          queueMicrotask(() => this.emit("attached"));
          return true;
        case Constants.MESSAGE_CHANNEL_CLOSE:
          return true;
        case Constants.MESSAGE_CHANNEL_UNASSIGN:
          this.statusCbk = undefined;
          this.channel = undefined;
          queueMicrotask(() => this.emit("detached"));
          return true;
        case Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA:
          return status.code === Constants.TRANSFER_IN_PROGRESS;
        default:
          break;
      }
      return false;
    };

    this.statusCbk = onStatus;

    await this.write(this.stick.messages.assignChannel(channel, type));
  }

  public async detach() {
    if (this.channel === undefined) {
      return;
    }
    await this.write(this.stick.messages.closeChannel(this.channel));
    if (!this.stick.detach(this)) {
      throw "error detaching";
    }
    this.channel = undefined;
  }

  protected async write(data: DataView) {
    await this.stick.write(data);
  }

  private async handleEventMessages(data: DataView) {
    const messageID = data.getUint8(Messages.BUFFER_INDEX_MSG_TYPE);
    const channel = data.getUint8(Messages.BUFFER_INDEX_CHANNEL_NUM);
    if (channel === this.channel) {
      if (messageID === Constants.MESSAGE_CHANNEL_EVENT) {
        const status = {
          msg: data.getUint8(Messages.BUFFER_INDEX_MSG_DATA),
          code: data.getUint8(Messages.BUFFER_INDEX_MSG_DATA + 1),
        };

        const handled = this.statusCbk && (await this.statusCbk(status));
        if (!handled) {
          this.emit("eventData", {
            message: data.getUint8(Messages.BUFFER_INDEX_MSG_DATA),
            code: data.getUint8(Messages.BUFFER_INDEX_MSG_DATA + 1),
          });
        }
      } else if (this.decodeDataCbk) {
        this.decodeDataCbk(data);
      }
    }
  }

  protected async send(data: DataView, cbk?: SendCallback) {
    this.msgQueue.push({ msg: data, cbk });
    if (this.msgQueue.length === 1) {
      await this.write(data);
    }
  }
}
