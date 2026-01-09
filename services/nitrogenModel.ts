
import { WHITEBOARD_COEFFICIENTS } from '../constants';

export interface ModelConfig {
  intercept: number;
  bandWeights: number[];
}

// 基于棉花氮营养研究的预设模型权重（示例参考值）
export const DEFAULT_CONFIG: ModelConfig = {
  intercept: 18.45,
  bandWeights: [
    -0.12, -0.15, -0.20, -0.10, 0.05, 0.12, 0.25, 0.15, -0.22, 
    -0.45, -0.85, 1.50, 5.40, 8.20, 10.50, 7.20, 5.10, 3.20
  ]
};

/**
 * 反射率计算
 * 公式: R = (Sample - Dark) / (White - Dark) * Coef
 */
export const calculateReflectance = (sample: number[], white: number[], dark: number[]): number[] => {
  return sample.map((s, i) => {
    const whiteSignal = (white[i] || 0) - (dark[i] || 0);
    const sampleSignal = (s || 0) - (dark[i] || 0);
    
    // 分母保护：如果有效信号过低（传感器弱光区），设为 1 避免崩溃
    const denominator = whiteSignal <= 0 ? 1 : whiteSignal;
    const ratio = Math.max(0, sampleSignal) / denominator;
    
    const coef = WHITEBOARD_COEFFICIENTS[i] || 1.0;
    // 物理限制 [0, 1.1] 110% 为反常上限保护
    return Math.max(0, Math.min(1.1, ratio * coef));
  });
};

/**
 * 预测氮含量 (Nitrogen Content)
 */
export const predictNitrogen = (reflectance: number[], config: ModelConfig = DEFAULT_CONFIG): number => {
  if (reflectance.length < 18) return 0;
  let y = config.intercept;
  for (let i = 0; i < 18; i++) {
    y += reflectance[i] * config.bandWeights[i];
  }
  // 棉花叶片氮含量通常在 15-50 mg/g 之间
  return parseFloat(Math.max(10, Math.min(60, y)).toFixed(2));
};
