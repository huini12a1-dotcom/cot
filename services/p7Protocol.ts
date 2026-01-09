
import { P7_MAGIC, P7_FCS } from '../constants.tsx';
import { MessageId } from '../types.ts';

export class P7Protocol {
  static calculateChecksum(data: Uint8Array, length: number): number {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum = (sum + data[i]) & 0xFF;
    }
    return sum;
  }

  static createPacket(msgId: MessageId, payload: Uint8Array): Uint8Array {
    const payloadLen = payload.length;
    const packet = new Uint8Array(12 + payloadLen);

    packet[0] = P7_MAGIC[0];
    packet[1] = P7_MAGIC[1];
    
    packet[2] = payloadLen & 0xFF;
    packet[3] = (payloadLen >> 8) & 0xFF;
    
    packet[4] = 0xFF; 
    packet[5] = 0xFF;
    
    packet[6] = 0x01;
    packet[7] = 0xA0;
    
    packet[8] = msgId;

    for (let i = 0; i < payloadLen; i++) {
      packet[9 + i] = payload[i];
    }

    const checksumIndex = 9 + payloadLen;
    packet[checksumIndex] = this.calculateChecksum(packet, checksumIndex);

    packet[checksumIndex + 1] = 0x00;
    packet[checksumIndex + 2] = 0x00;

    return packet;
  }

  static parsePacket(data: Uint8Array): { msgId: number; payload: Uint8Array } | null {
    if (data.length < 12) return null;
    if (data[0] !== 0x77 || data[1] !== 0xCC) return null;

    const payloadLen = data[2] | (data[3] << 8);
    const expectedTotalLen = 12 + payloadLen;
    
    if (data.length < expectedTotalLen) return null;

    const checksumIndex = 9 + payloadLen;
    const calculated = this.calculateChecksum(data, checksumIndex);
    if (data[checksumIndex] !== calculated) {
      return null;
    }

    return {
      msgId: data[8],
      payload: data.slice(9, 9 + payloadLen)
    };
  }
}
