
import { P7_MAGIC, P7_FCS } from '../constants';
import { MessageId } from '../types';

export class P7Protocol {
  /**
   * 按照协议要求：计算从起始到校验和之前的所有字节总和
   */
  static calculateChecksum(data: Uint8Array, length: number): number {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum = (sum + data[i]) & 0xFF;
    }
    return sum;
  }

  /**
   * 构建 P7 数据帧
   * Magic(2) + Len(2) + Extern(2) + SysID(1) + CompID(1) + MsgID(1) + Payload(n) + Sum(1) + FCS(2)
   */
  static createPacket(msgId: MessageId, payload: Uint8Array): Uint8Array {
    const payloadLen = payload.length;
    const packet = new Uint8Array(12 + payloadLen);

    // 帧头
    packet[0] = P7_MAGIC[0]; // 0x77
    packet[1] = P7_MAGIC[1]; // 0xCC
    
    // 载荷长度 (小端)
    packet[2] = payloadLen & 0xFF;
    packet[3] = (payloadLen >> 8) & 0xFF;
    
    // 扩展位
    packet[4] = 0xFF; 
    packet[5] = 0xFF;
    
    // 身份标识
    packet[6] = 0x01; // SysID
    packet[7] = 0xA0; // CompID
    
    // 消息类型
    packet[8] = msgId;

    // 有效载荷
    for (let i = 0; i < payloadLen; i++) {
      packet[9 + i] = payload[i];
    }

    // 计算校验和
    const checksumIndex = 9 + payloadLen;
    packet[checksumIndex] = this.calculateChecksum(packet, checksumIndex);

    // 帧尾
    packet[checksumIndex + 1] = 0x00;
    packet[checksumIndex + 2] = 0x00;

    return packet;
  }

  /**
   * 解析 P7 数据帧
   */
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
