
export interface SpectralData {
  timestamp: number;
  wavelengths: number[];
  darkCurrent: number[];
  whiteReference: number[];
  sampleData: number[];
  reflectance: number[];
  nitrogenContent: number;
  id: string;
  remarks?: string; // 备注字段
}

export enum MessageId {
  HANDSHAKE = 0x50,
  INFO = 0x00,
  WAVELENGTH = 0x61,
  CAPTURE = 0x60,
  STATUS = 0x10
}

export interface ConnectionStatus {
  connected: boolean;
  deviceName: string | null;
  battery: number;
  firmware: string;
}
