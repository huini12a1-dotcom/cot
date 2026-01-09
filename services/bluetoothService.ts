
import { P7Protocol } from './p7Protocol';
import { MessageId } from '../types';

export class BluetoothService {
  private device: any = null;
  private server: any = null;
  private txCharacteristic: any = null;
  private rxCharacteristic: any = null;
  private onDataCallback: ((data: Uint8Array) => void) | null = null;
  private receiveBuffer: Uint8Array = new Uint8Array(0);
  
  // 按照示例要求的密钥
  private readonly HANDSHAKE_KEY = "LJ73BHGSTF23GD65";

  private readonly SERVICE_UUIDS = [
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
  ];

  async scanAndConnect(): Promise<string> {
    try {
      this.device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.SERVICE_UUIDS
      });

      this.server = await this.device.gatt.connect();
      const services = await this.server.getPrimaryServices();
      
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          if (!this.txCharacteristic && (c.properties.write || c.properties.writeWithoutResponse)) this.txCharacteristic = c;
          if (!this.rxCharacteristic && (c.properties.notify || c.properties.indicate)) this.rxCharacteristic = c;
        }
      }

      if (!this.txCharacteristic || !this.rxCharacteristic) throw new Error('找不到通信通道');

      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        this.handleStreamingData(new Uint8Array(event.target.value.buffer));
      });

      this.device.addEventListener('gattserverdisconnected', () => this.disconnect());

      // 发起握手鉴权
      await this.performHandshake();

      return this.device.name || 'P7 Spectrometer';
    } catch (error: any) {
      this.disconnect();
      throw error;
    }
  }

  private async performHandshake(): Promise<void> {
    const keyBytes = new TextEncoder().encode(this.HANDSHAKE_KEY);
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('握手响应超时')), 5000);
      
      const originalCallback = this.onDataCallback;
      this.onDataCallback = (data: Uint8Array) => {
        const parsed = P7Protocol.parsePacket(data);
        if (parsed && parsed.msgId === MessageId.HANDSHAKE) {
          clearTimeout(timeout);
          this.onDataCallback = originalCallback;
          if (parsed.payload[0] === 0x01) resolve();
          else reject(new Error('密钥校验失败'));
        }
      };

      try {
        await this.sendPacket(MessageId.HANDSHAKE, keyBytes);
      } catch (e) {
        clearTimeout(timeout);
        this.onDataCallback = originalCallback;
        reject(e);
      }
    });
  }

  private handleStreamingData(chunk: Uint8Array) {
    const combined = new Uint8Array(this.receiveBuffer.length + chunk.length);
    combined.set(this.receiveBuffer);
    combined.set(chunk, this.receiveBuffer.length);
    this.receiveBuffer = combined;

    while (this.receiveBuffer.length >= 12) {
      let head = -1;
      for (let i = 0; i < this.receiveBuffer.length - 1; i++) {
        if (this.receiveBuffer[i] === 0x77 && this.receiveBuffer[i+1] === 0xCC) {
          head = i; break;
        }
      }
      if (head === -1) { this.receiveBuffer = new Uint8Array(0); break; }
      if (head > 0) this.receiveBuffer = this.receiveBuffer.slice(head);
      if (this.receiveBuffer.length < 4) break;

      const pLen = this.receiveBuffer[2] | (this.receiveBuffer[3] << 8);
      const totalLen = 12 + pLen;
      if (this.receiveBuffer.length >= totalLen) {
        const packet = this.receiveBuffer.slice(0, totalLen);
        if (this.onDataCallback) this.onDataCallback(packet);
        this.receiveBuffer = this.receiveBuffer.slice(totalLen);
      } else break;
    }
  }

  async sendPacket(msgId: MessageId, payload: Uint8Array): Promise<void> {
    if (!this.txCharacteristic) throw new Error('连接断开');
    const packet = P7Protocol.createPacket(msgId, payload);
    await this.txCharacteristic.writeValue(packet);
  }

  clearBuffer() { this.receiveBuffer = new Uint8Array(0); }
  onData(callback: (data: Uint8Array) => void) { this.onDataCallback = callback; }
  disconnect() {
    if (this.device?.gatt.connected) this.device.gatt.disconnect();
    this.txCharacteristic = null; this.rxCharacteristic = null;
    this.receiveBuffer = new Uint8Array(0);
  }
}

export const bluetoothService = new BluetoothService();
