import { Constants } from "./Constants";
import {
  CancellationError,
  CancellationToken,
  ICancellationToken
} from "./ICancellationToken";
import { EventEmitter } from "./lib/EventEmitter";
import { Messages } from "./Messages";
import { BaseSensor } from "./sensors/BaseSensor";

export interface SupportedVendors {
  vendor: number;
  product: number;
  name: string;
}

export class USBDriver extends EventEmitter {
  static supportedDevices: Array<SupportedVendors> = [
    { vendor: 0x0fcf, product: 0x1008, name: "GarminStick2" },
    { vendor: 0x0fcf, product: 0x1009, name: "GarminStick3" }
  ];

  private deviceInUse: USBDevice[] = [];
  private attachedSensors: BaseSensor[] = [];
  private device: USBDevice | undefined;
  private inEndpoint: USBEndpoint | undefined;
  private interface: USBInterface | undefined;
  private leftover: DataView | undefined;
  private outEndpoint: USBEndpoint | undefined;
  private usedChannels: number = 0;
  private readInCancellationToken: ICancellationToken = new CancellationToken();

  maxChannels: number = 0;
  canScan: boolean = false;

  constructor(
    private vendorId: number,
    private productId: number
  ) {
    super();
    this.setMaxListeners(50);
  }

  /** Creates a USBDriver instance from an already paired (and permitted) device
   * @Note If more than one ANT+ stick was paired the USBDriver instance will be created from the first one.
   */
  public static async createFromPairedDevice(): Promise<USBDriver | undefined> {
    const device = (await this.getPairedDevices())?.[0];

    if (device !== undefined) {
      const driverInstance = new USBDriver(device.vendorId, device.productId);
      driverInstance.device = device;

      return driverInstance;
    }

    return undefined;
  }

  /** Starts the paring process by opening the dialog box, once USBDevice is connected it will return a USBDriver instance
   * @Note This method filters the usb devices shown in the dialog box i.e. only ANT+ sticks will be shown.
   */
  public static async createFromNewDevice(): Promise<USBDriver> {
    const device = await navigator.usb.requestDevice({
      filters: this.supportedDevices.map(
        (
          supportedDevice: SupportedVendors
        ): {
          vendorId: number;
          productId: number;
        } => ({
          vendorId: supportedDevice.vendor,
          productId: supportedDevice.product
        })
      )
    });

    const driverInstance = new USBDriver(device.vendorId, device.productId);
    driverInstance.device = device;

    return driverInstance;
  }

  /** Creates a USBDriver instance from the specified USBDevice
   * @Note This method does not check if the provided USBDevice is in fact an ANT+ stick.
   */
  public static createFromDevice(device: USBDevice): USBDriver {
    const driverInstance = new USBDriver(device.vendorId, device.productId);
    driverInstance.device = device;

    return driverInstance;
  }

  /** Gets an array of ANT+ usb sticks that has been previously paired and hence have permission to connect (if any) */
  public static async getPairedDevices(): Promise<Array<USBDevice>> {
    const devices = await navigator.usb.getDevices();
    return devices.filter(
      (device: USBDevice): boolean =>
        ((device.vendorId === this.supportedDevices[0].vendor ||
          device.vendorId === this.supportedDevices[1].vendor) &&
          device.productId === this.supportedDevices[0].product) ||
        device.productId === this.supportedDevices[1].product
    );
  }

  private async getDevice() {
    const device = await navigator.usb.requestDevice({
      filters: [{ vendorId: this.vendorId, productId: this.productId }]
    });
    return device;
  }

  public async is_present(): Promise<boolean> {
    const device = await this.getDevice();
    return device !== undefined;
  }

  public async open(): Promise<USBDevice | undefined> {
    if (this.device === undefined) {
      this.device = await this.getDevice();
    }
    try {
      if (this.device === undefined) {
        throw new Error("No device found");
      }
      await this.device.open();
      if (this.device.configuration?.interfaces[0] === undefined) {
        throw new Error("No interface found");
      }
      this.interface = this.device.configuration?.interfaces[0];
      await this.device.claimInterface(this.interface.interfaceNumber);
    } catch (err) {
      throw err;
    }
    this.deviceInUse.push(this.device);
    this.inEndpoint = this.interface?.alternate.endpoints.find(
      (e) => e.direction === "in"
    );
    this.outEndpoint = this.interface?.alternate.endpoints.find(
      (e) => e.direction === "out"
    );

    if (!this.inEndpoint || !this.outEndpoint) {
      throw new Error("No endpoints found");
    }
    await this.reset();

    const readInEndPoint = async () => {
      if (
        this.inEndpoint === undefined ||
        this.device === undefined ||
        !this.device.opened
      ) {
        return;
      }

      try {
        this.readInCancellationToken.cancelled();
        const result = await this.device.transferIn(
          this.inEndpoint.endpointNumber,
          this.inEndpoint.packetSize
        );
        if (!result.data) {
          return;
        }
        let data = result.data;
        if (this.leftover) {
          const tmp = new Uint8Array(
            this.leftover.byteLength + data.byteLength
          );
          tmp.set(new Uint8Array(this.leftover.buffer), 0);
          tmp.set(new Uint8Array(data.buffer), this.leftover.byteLength);
          data = new DataView(tmp.buffer);
          this.leftover = undefined;
        }
        if (data.getUint8(0) !== 0xa4) {
          throw "SYNC missing";
        }
        if (result.status === "ok") {
          const len = data.byteLength;
          let beginBlock = 0;
          while (beginBlock < len) {
            if (beginBlock + 1 === len) {
              this.leftover = new DataView(data.buffer.slice(beginBlock));
              break;
            }
            const blockLen = data.getUint8(beginBlock + 1);
            const endBlock = beginBlock + blockLen + 4;
            if (endBlock > len) {
              this.leftover = new DataView(data.buffer.slice(beginBlock));
              break;
            }
            const readData = new DataView(
              data.buffer.slice(beginBlock, endBlock)
            );
            this.read(readData);
            beginBlock = endBlock;
          }
        }
        await readInEndPoint();
      } catch (error) {
        if (!(error instanceof CancellationError)) {
          throw error;
        }
      }
    };

    await readInEndPoint();
    return this.device;
  }

  public async close() {
    this.readInCancellationToken?.cancel();
    await this.reset();
    this.interface = undefined;
    if (!this.device) return;
    await this.device.close();
    this.emit("shutdown");
    const devIdx = this.deviceInUse.indexOf(this.device);
    if (devIdx >= 0) {
      this.deviceInUse.splice(devIdx, 1);
    }
    this.emit("attach", this.device);
    this.device = undefined;
  }

  public async reset() {
    await this.detach_all();
    this.maxChannels = 0;
    this.usedChannels = 0;
    await this.write(Messages.resetSystem());
  }

  public isScanning(): boolean {
    return this.usedChannels === -1;
  }

  public attach(sensor: BaseSensor, forScan: boolean): boolean {
    if (this.usedChannels < 0) {
      return false;
    }
    if (forScan) {
      if (this.usedChannels !== 0) {
        return false;
      }
      this.usedChannels = -1;
    } else {
      if (this.maxChannels <= this.usedChannels) {
        return false;
      }
      ++this.usedChannels;
    }
    this.attachedSensors.push(sensor);
    return true;
  }

  public detach(sensor: BaseSensor): boolean {
    const idx = this.attachedSensors.indexOf(sensor);
    if (idx < 0) {
      return false;
    }
    if (this.usedChannels < 0) {
      this.usedChannels = 0;
    } else {
      --this.usedChannels;
    }
    this.attachedSensors.splice(idx, 1);
    return true;
  }

  public detach_all(): Promise<void[]> {
    const copy = this.attachedSensors;
    return Promise.all(copy.map((s) => s.detach()));
  }

  public async write(data: DataView) {
    try {
      if (this.outEndpoint === undefined) {
        throw new Error("No out endpoint");
      }
      await this.device?.transferOut(this.outEndpoint?.endpointNumber, data);
    } catch (error) {
      throw error;
    }
  }

  public async read(data: DataView) {
    const messageID = data.getUint8(2);
    if (messageID === Constants.MESSAGE_STARTUP) {
      await this.write(
        Messages.requestMessage(0, Constants.MESSAGE_CAPABILITIES)
      );
    } else if (messageID === Constants.MESSAGE_CAPABILITIES) {
      this.maxChannels = data.getUint8(3);
      this.canScan = (data.getUint8(7) & 0x06) === 0x06;
      await this.write(Messages.setNetworkKey());
    } else if (
      messageID === Constants.MESSAGE_CHANNEL_EVENT &&
      data.getUint8(4) === Constants.MESSAGE_NETWORK_KEY
    ) {
      this.emit("startup", data);
    } else {
      this.emit("read", data);
    }
  }
}
