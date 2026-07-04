import { Constants } from "../constants.js";
import { buildMessage } from "../messages.js";

export interface HandshakeOptions {
  maxChannels?: number;
  canScan?: boolean;
}

interface TransferInWaiter {
  resolve: (result: { status: "ok"; data: DataView }) => void;
  reject: (error: Error) => void;
}

/**
 * A minimal in-memory fake of the WebUSB `USBDevice` surface that
 * {@link ../driver.js USBDriver} uses. Written data is collected in
 * {@link sentMessages}; data for `transferIn` is provided through
 * {@link queueResponse}.
 */
export class FakeUSBDevice {
  readonly vendorId: number;
  readonly productId: number;
  opened = false;

  /** Raw bytes of every transferOut call, in order. */
  readonly sentMessages: Uint8Array[] = [];

  #inQueue: DataView[] = [];
  #waiters: TransferInWaiter[] = [];
  #onSent: ((message: Uint8Array) => void) | undefined;

  readonly configuration = {
    configurationValue: Constants.USB_CONFIGURATION_VALUE,
    interfaces: [
      {
        interfaceNumber: Constants.USB_INTERFACE_NUMBER,
        alternate: {
          endpoints: [
            {
              direction: "in",
              endpointNumber: Constants.USB_IN_ENDPOINT_NUMBER,
              packetSize: Constants.USB_ENDPOINT_PACKET_SIZE,
            },
            {
              direction: "out",
              endpointNumber: Constants.USB_OUT_ENDPOINT_NUMBER,
              packetSize: Constants.USB_ENDPOINT_PACKET_SIZE,
            },
          ],
        },
      },
    ],
  };

  constructor(
    vendorId: number = Constants.DYNASTREAM_USB_VENDOR_ID,
    productId: number = Constants.GARMIN_STICK_2_PRODUCT_ID,
  ) {
    this.vendorId = vendorId;
    this.productId = productId;
  }

  /** Decoded message id (byte 2) of every transferOut call, in order. */
  get sentMessageIds(): number[] {
    return this.sentMessages.map(
      (message) =>
        message[Constants.BUFFER_INDEX_MSG_TYPE] ??
        Constants.USB_TRANSFER_MISSING_MESSAGE_ID,
    );
  }

  /** The fake, typed as the real WebUSB device interface. */
  asDevice(): USBDevice {
    return this as unknown as USBDevice;
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) {
      waiter.reject(new Error("The device was disconnected."));
    }
  }

  async claimInterface(_interfaceNumber: number): Promise<void> {}

  async transferOut(
    _endpointNumber: number,
    data: BufferSource,
  ): Promise<{ bytesWritten: number; status: "ok" }> {
    const bytes = toUint8Array(data);
    this.sentMessages.push(bytes);
    this.#onSent?.(bytes);
    return { bytesWritten: bytes.byteLength, status: "ok" };
  }

  transferIn(
    _endpointNumber: number,
    _length: number,
  ): Promise<{ status: "ok"; data: DataView }> {
    const data = this.#inQueue.shift();
    if (data !== undefined) {
      return Promise.resolve({ status: "ok", data });
    }
    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
    });
  }

  /**
   * Makes the given frame available to the driver: resolves a pending
   * transferIn immediately, or queues the frame for the next one.
   */
  queueResponse(frame: DataView): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter.resolve({ status: "ok", data: frame });
    } else {
      this.#inQueue.push(frame);
    }
  }

  /**
   * Plays the device side of the ANT+ startup handshake:
   * - resetSystem -> MESSAGE_STARTUP frame
   * - capabilities request -> MESSAGE_CAPABILITIES frame
   *   (byte 3 = maxChannels, byte 7 = 0x06 when canScan)
   * - setNetworkKey -> CHANNEL_EVENT frame for MESSAGE_NETWORK_KEY
   */
  respondToHandshake(options: HandshakeOptions = {}): void {
    const { maxChannels = Constants.USB_DEFAULT_MAX_CHANNELS, canScan = true } =
      options;
    this.#onSent = (message) => {
      const messageId = message[Constants.BUFFER_INDEX_MSG_TYPE];
      if (messageId === Constants.MESSAGE_SYSTEM_RESET) {
        this.queueResponse(
          buildMessage(
            [Constants.CAPABILITIES_NO_BURST_MESSAGES],
            Constants.MESSAGE_STARTUP,
          ),
        );
      } else if (
        messageId === Constants.MESSAGE_CHANNEL_REQUEST &&
        message[Constants.BUFFER_INDEX_MSG_DATA] ===
          Constants.MESSAGE_CAPABILITIES
      ) {
        this.queueResponse(
          buildMessage(
            [
              maxChannels,
              Constants.CAPABILITIES_NO_TRANSMIT_MESSAGES,
              Constants.DEFAULT_CHANNEL,
              Constants.DEFAULT_CHANNEL,
              canScan
                ? Constants.CAPABILITIES_SCAN_SUPPORT_MASK
                : Constants.DEFAULT_CHANNEL,
              Constants.DEFAULT_CHANNEL,
            ],
            Constants.MESSAGE_CAPABILITIES,
          ),
        );
      } else if (messageId === Constants.MESSAGE_NETWORK_KEY) {
        this.queueResponse(
          buildMessage(
            [
              Constants.DEFAULT_CHANNEL,
              Constants.MESSAGE_NETWORK_KEY,
              Constants.RESPONSE_NO_ERROR,
            ],
            Constants.MESSAGE_CHANNEL_EVENT,
          ),
        );
      }
    };
  }
}

/** A minimal fake of `navigator.usb`. */
export class FakeUSB {
  readonly devices: FakeUSBDevice[];

  constructor(devices: readonly FakeUSBDevice[]) {
    this.devices = [...devices];
  }

  async getDevices(): Promise<USBDevice[]> {
    return this.devices.map((device) => device.asDevice());
  }

  async requestDevice(options?: USBDeviceRequestOptions): Promise<USBDevice> {
    const filters = options?.filters ?? [];
    const match = this.devices.find(
      (device) =>
        filters.length === Constants.DEFAULT_CHANNEL ||
        filters.some(
          (filter) =>
            (filter.vendorId === undefined ||
              filter.vendorId === device.vendorId) &&
            (filter.productId === undefined ||
              filter.productId === device.productId),
        ),
    );
    if (!match) {
      throw new Error("No device selected.");
    }
    return match.asDevice();
  }
}

/**
 * Installs the fake as `globalThis.navigator.usb` and returns a function
 * that restores the previous `navigator` (Node may define it as a getter,
 * so plain assignment is not reliable).
 */
export function installFakeUsb(usb: FakeUSB): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { usb } as unknown as Navigator,
    configurable: true,
    writable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  };
}

function toUint8Array(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
  }
  return new Uint8Array(data.slice(Constants.DEFAULT_CHANNEL));
}
