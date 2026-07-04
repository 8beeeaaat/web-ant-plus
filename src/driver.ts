import { Constants } from "./constants.js";
import { DeviceNotFoundError, ProtocolError } from "./errors.js";
import {
  CancellationError,
  CancellationToken,
} from "./lib/CancellationToken.js";
import { TypedEventEmitter } from "./lib/TypedEventEmitter.js";
import type { AntMessage } from "./messages.js";
import * as messages from "./messages.js";

export interface SupportedDevice {
  vendor: number;
  product: number;
  name: string;
}

/** The subset of a sensor the driver needs for channel bookkeeping. */
export interface ChannelParticipant {
  detach(): Promise<void>;
}

export type USBDriverEvents = {
  startup: [DataView];
  shutdown: [];
  read: [DataView];
  error: [unknown];
};

export class USBDriver extends TypedEventEmitter<USBDriverEvents> {
  static readonly supportedDevices: readonly SupportedDevice[] = [
    {
      vendor: Constants.DYNASTREAM_USB_VENDOR_ID,
      product: Constants.GARMIN_STICK_2_PRODUCT_ID,
      name: "GarminStick2",
    },
    {
      vendor: Constants.DYNASTREAM_USB_VENDOR_ID,
      product: Constants.GARMIN_STICK_3_PRODUCT_ID,
      name: "GarminStick3",
    },
  ];

  #device: USBDevice;
  #inEndpoint: USBEndpoint | undefined;
  #outEndpoint: USBEndpoint | undefined;
  #leftover: DataView | undefined;
  #usedChannels: number = Constants.DEFAULT_CHANNEL;
  #attachedSensors: ChannelParticipant[] = [];
  #readCancellation = new CancellationToken();

  maxChannels: number = Constants.DEFAULT_CHANNEL;
  canScan = false;

  private constructor(device: USBDevice) {
    super();
    this.#device = device;
  }

  static isSupported(device: USBDevice): boolean {
    return USBDriver.supportedDevices.some(
      (supported) =>
        supported.vendor === device.vendorId &&
        supported.product === device.productId,
    );
  }

  /** Gets the previously paired (permitted) ANT+ USB sticks, if any. */
  static async getPairedDevices(): Promise<USBDevice[]> {
    const devices = await navigator.usb.getDevices();
    return devices.filter((device) => USBDriver.isSupported(device));
  }

  /**
   * Creates a driver from an already paired (and permitted) device.
   * If more than one ANT+ stick is paired, the first one is used.
   */
  static async fromPairedDevice(): Promise<USBDriver | undefined> {
    const device = (await USBDriver.getPairedDevices())[
      Constants.DEFAULT_CHANNEL
    ];
    return device === undefined ? undefined : new USBDriver(device);
  }

  /**
   * Starts the pairing process by opening the browser device picker,
   * filtered to supported ANT+ sticks.
   */
  static async requestDevice(): Promise<USBDriver> {
    const device = await navigator.usb.requestDevice({
      filters: USBDriver.supportedDevices.map((supported) => ({
        vendorId: supported.vendor,
        productId: supported.product,
      })),
    });
    return new USBDriver(device);
  }

  /**
   * Creates a driver from the given device.
   * Does not check whether the device is in fact an ANT+ stick.
   */
  static fromDevice(device: USBDevice): USBDriver {
    return new USBDriver(device);
  }

  get device(): USBDevice {
    return this.#device;
  }

  /**
   * Opens the device, performs the ANT+ startup handshake and starts
   * reading in the background. Resolves once the stick is ready for
   * sensors to attach.
   */
  async open(): Promise<void> {
    await this.#device.open();
    const iface =
      this.#device.configuration?.interfaces[Constants.USB_INTERFACE_NUMBER];
    if (iface === undefined) {
      throw new DeviceNotFoundError("No interface found");
    }
    await this.#device.claimInterface(iface.interfaceNumber);
    this.#inEndpoint = iface.alternate.endpoints.find(
      (endpoint) => endpoint.direction === "in",
    );
    this.#outEndpoint = iface.alternate.endpoints.find(
      (endpoint) => endpoint.direction === "out",
    );
    if (!this.#inEndpoint || !this.#outEndpoint) {
      throw new DeviceNotFoundError("No endpoints found");
    }

    const startup = new Promise<void>((resolve) => {
      this.once("startup", () => resolve());
    });
    await this.reset();
    void this.#readLoop();
    await startup;
  }

  async close(): Promise<void> {
    this.#readCancellation.cancel();
    await this.reset();
    if (!this.#device.opened) {
      return;
    }
    await this.#device.close();
    this.emit("shutdown");
  }

  async reset(): Promise<void> {
    await this.detachAll();
    this.maxChannels = Constants.DEFAULT_CHANNEL;
    this.#usedChannels = Constants.DEFAULT_CHANNEL;
    await this.write(messages.resetSystem());
  }

  isScanning(): boolean {
    return this.#usedChannels === Constants.SCANNING_CHANNEL_SENTINEL;
  }

  attach(sensor: ChannelParticipant, forScan: boolean): boolean {
    if (this.#usedChannels < Constants.DEFAULT_CHANNEL) {
      return false;
    }
    if (forScan) {
      if (this.#usedChannels !== Constants.DEFAULT_CHANNEL) {
        return false;
      }
      this.#usedChannels = Constants.SCANNING_CHANNEL_SENTINEL;
    } else {
      if (this.maxChannels <= this.#usedChannels) {
        return false;
      }
      ++this.#usedChannels;
    }
    this.#attachedSensors.push(sensor);
    return true;
  }

  detach(sensor: ChannelParticipant): boolean {
    const index = this.#attachedSensors.indexOf(sensor);
    if (index < Constants.DEFAULT_CHANNEL) {
      return false;
    }
    if (this.#usedChannels < Constants.DEFAULT_CHANNEL) {
      this.#usedChannels = Constants.DEFAULT_CHANNEL;
    } else {
      --this.#usedChannels;
    }
    this.#attachedSensors.splice(index, Constants.DEFAULT_INT_BYTE_LENGTH);
    return true;
  }

  detachAll(): Promise<unknown> {
    return Promise.all(
      [...this.#attachedSensors].map((sensor) => sensor.detach()),
    );
  }

  async write(data: AntMessage): Promise<void> {
    if (this.#outEndpoint === undefined) {
      throw new DeviceNotFoundError("No out endpoint");
    }
    await this.#device.transferOut(this.#outEndpoint.endpointNumber, data);
  }

  async #readLoop(): Promise<void> {
    while (this.#device.opened && this.#inEndpoint !== undefined) {
      try {
        this.#readCancellation.throwIfCancelled();
        const result = await this.#device.transferIn(
          this.#inEndpoint.endpointNumber,
          this.#inEndpoint.packetSize,
        );
        if (!result.data) {
          return;
        }
        let data = result.data;
        if (this.#leftover) {
          const merged = new Uint8Array(
            this.#leftover.byteLength + data.byteLength,
          );
          merged.set(
            new Uint8Array(this.#leftover.buffer),
            Constants.DEFAULT_CHANNEL,
          );
          merged.set(new Uint8Array(data.buffer), this.#leftover.byteLength);
          data = new DataView(merged.buffer);
          this.#leftover = undefined;
        }
        if (
          data.getUint8(Constants.DEFAULT_CHANNEL) !== Constants.MESSAGE_TX_SYNC
        ) {
          throw new ProtocolError("SYNC missing");
        }
        if (result.status === "ok") {
          this.#splitAndDispatch(data);
        }
      } catch (error) {
        if (error instanceof CancellationError) {
          return;
        }
        if (!this.#device.opened) {
          return;
        }
        this.emit("error", error);
        return;
      }
    }
  }

  #splitAndDispatch(data: DataView): void {
    const length = data.byteLength;
    let beginBlock: number = Constants.DEFAULT_CHANNEL;
    while (beginBlock < length) {
      if (beginBlock + Constants.DEFAULT_INT_BYTE_LENGTH === length) {
        this.#leftover = new DataView(data.buffer.slice(beginBlock));
        break;
      }
      const blockLength = data.getUint8(
        beginBlock + Constants.BUFFER_INDEX_MSG_LEN,
      );
      const endBlock =
        beginBlock + blockLength + Constants.MESSAGE_FRAME_OVERHEAD_BYTES;
      if (endBlock > length) {
        this.#leftover = new DataView(data.buffer.slice(beginBlock));
        break;
      }
      void this.#handleMessage(
        new DataView(data.buffer.slice(beginBlock, endBlock)),
      );
      beginBlock = endBlock;
    }
  }

  async #handleMessage(data: DataView): Promise<void> {
    const messageId = data.getUint8(messages.BUFFER_INDEX_MSG_TYPE);
    if (messageId === Constants.MESSAGE_STARTUP) {
      await this.write(
        messages.requestMessage(
          Constants.DEFAULT_CHANNEL,
          Constants.MESSAGE_CAPABILITIES,
        ),
      );
    } else if (messageId === Constants.MESSAGE_CAPABILITIES) {
      this.maxChannels = data.getUint8(Constants.BUFFER_INDEX_CHANNEL_NUM);
      this.canScan =
        (data.getUint8(
          Constants.BUFFER_INDEX_MSG_DATA + Constants.PAYLOAD_OFFSET_3,
        ) &
          Constants.CAPABILITIES_SCAN_SUPPORT_MASK) ===
        Constants.CAPABILITIES_SCAN_SUPPORT_MASK;
      await this.write(messages.setNetworkKey());
    } else if (
      messageId === Constants.MESSAGE_CHANNEL_EVENT &&
      data.getUint8(Constants.BUFFER_INDEX_MSG_DATA) ===
        Constants.MESSAGE_NETWORK_KEY
    ) {
      this.emit("startup", data);
    } else {
      this.emit("read", data);
    }
  }
}
