
import { P7Protocol } from './p7Protocol.ts';
import { MessageId } from '../types.ts';

export class BluetoothService {
  private device: any = null;
  private server: any = null;
  private txCharacteristic: any = null;
  private rxCharacteristic: any = null;
  private onDataCallback: ((data: Uint8Array) => void) | null = null;
  private receiveBuffer: Uint8Array = new Uint8Array(0);
  
  private readonly HANDSHAKE_KEY = "LJ73BHGSTF23GD65";
  private readonly SERVICE_UUIDS = [
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
  ];

  /**
   * 检查当前浏览器环境是否支持 Web Bluetooth
   */
  private checkEnvironment() {
    // 1. 检查 HTTPS (Web Bluetooth 强制要求安全上下文，localhost 除外)
    if (!window.isSecureContext) {
      throw new Error(
        "环境不安全：蓝牙功能需要 HTTPS 协议。\n" +
        "请使用部署后的 HTTPS 链接访问，或在 Chrome 中启用 'Insecure origins treated as secure' 标志调试。"
      );
    }

    // 2. 检查 API 是否存在
    if (!(navigator as any).bluetooth) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        throw new Error("iOS 限制：Safari 不支持蓝牙。\n请下载 'Bluefy' 浏览器应用来运行此网页。");
      } else {
        throw new Error("浏览器不支持：请使用最新版 Chrome 浏览器或 Edge 浏览器。");
      }
    }
  }

  async scanAndConnect(): Promise<string> {
    try {
      this.checkEnvironment();

      this.device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.SERVICE_UUIDS
      });

      if (!this.device) throw new Error("用户取消了设备选择");

      this.device.addEventListener('gattserverdisconnected', () => this.disconnect());

      this.server = await this.device.gatt.connect();
      const services = await this.server.getPrimaryServices();
      
      let foundService = false;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          // 自动匹配具备读写特征的通道
          if (!this.txCharacteristic && (c.properties.write || c.properties.writeWithoutResponse)) {
             this.txCharacteristic = c;
          }
          if (!this.rxCharacteristic && (c.properties.notify || c.properties.indicate)) {
             this.rxCharacteristic = c;
          }
        }
        if (this.txCharacteristic && this.rxCharacteristic) {
          foundService = true;
          break;
        }
      }

      if (!foundService || !this.txCharacteristic || !this.rxCharacteristic) {
        throw new Error('服务通道匹配失败：设备未广播 P7 协议特征值');
      }

      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        this.handleStreamingData(new Uint8Array(event.target.value.buffer));
      });

      await this.performHandshake();

      return this.device.name || 'CP-P7-Node';
    } catch (error: any) {
      this.disconnect();
      // 优化错误信息透传
      if (error.name === 'NotFoundError' || error.message.includes('User cancelled')) {
        throw new Error('操作已取消');
      }
      if (error.name === 'SecurityError') {
        throw new Error('安全策略限制：请确保已开启 GPS 且网页使用 HTTPS 协议');
      }
      throw error;
    }
  }

  private async performHandshake(): Promise<void> {
    const keyBytes = new TextEncoder().encode(this.HANDSHAKE_KEY);
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('握手超时：请确认设备电量充足')), 5000);
      const originalCallback = this.onDataCallback;
      
      this.onDataCallback = (data: Uint8Array) => {
        const parsed = P7Protocol.parsePacket(data);
        if (parsed && parsed.msgId === MessageId.HANDSHAKE) {
          clearTimeout(timeout);
          this.onDataCallback = originalCallback;
          if (parsed.payload[0] === 0x01) resolve();
          else reject(new Error('鉴权拒绝：非授权的监测终端'));
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
    if (!this.txCharacteristic) throw new Error('设备已断开');
    const packet = P7Protocol.createPacket(msgId, payload);
    try {
      await this.txCharacteristic.writeValue(packet);
    } catch (e) {
      throw new Error('写入失败：链路不稳定');
    }
  }

  clearBuffer() { this.receiveBuffer = new Uint8Array(0); }
  onData(callback: (data: Uint8Array) => void) { this.onDataCallback = callback; }
  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.txCharacteristic = null; 
    this.rxCharacteristic = null;
    this.receiveBuffer = new Uint8Array(0);
  }
}

export const bluetoothService = new BluetoothService();
