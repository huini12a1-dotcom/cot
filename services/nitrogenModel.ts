
import { WHITEBOARD_COEFFICIENTS } from '../constants.tsx';

export interface ModelConfig {
  intercept: number;
  bandWeights: number[];
}

export const DEFAULT_CONFIG: ModelConfig = {
  intercept: 18.45,
  bandWeights: [
    -0.12, -0.15, -0.20, -0.10, 0.05, 0.12, 0.25, 0.15, -0.22, 
    -0.45, -0.85, 1.50, 5.40, 8.20, 10.50, 7.20, 5.10, 3.20
  ]
};

export const calculateReflectance = (sample: number[], white: number[], dark: number[]): number[] => {
  return sample.map((s, i) => {
    const whiteSignal = (white[i] || 0) - (dark[i] || 0);
    const sampleSignal = (s || 0) - (dark[i] || 0);
    
    const denominator = whiteSignal <= 0 ? 1 : whiteSignal;
    const ratio = Math.max(0, sampleSignal) / denominator;
    
    const coef = WHITEBOARD_COEFFICIENTS[i] || 1.0;
    return Math.max(0, Math.min(1.1, ratio * coef));
  });
};

export const predictNitrogen = (reflectance: number[], config: ModelConfig = DEFAULT_CONFIG): number => {
  if (reflectance.length < 18) return 0;
  let y = config.intercept;
  for (let i = 0; i < 18; i++) {
    y += reflectance[i] * config.bandWeights[i];
  }
  return parseFloat(Math.max(10, Math.min(60, y)).toFixed(2));
};
