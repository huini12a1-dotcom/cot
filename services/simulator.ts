
import { WAVEBANDS } from '../constants';

/**
 * 模拟不同生长阶段的棉花光谱特征
 */
export const generateSimulatedSpectrum = (healthLevel: 'high' | 'normal' | 'low') => {
  const spectrum = WAVEBANDS.map((w) => {
    // 模拟植被光谱曲线特征
    if (w < 500) return 200 + Math.random() * 100; // 蓝光吸收
    if (w < 600) return 400 + Math.random() * 150; // 绿峰
    if (w < 700) return 150 + Math.random() * 100; // 红光吸收
    if (w < 750) return 1000 + Math.random() * 500; // 红边陡升
    return 3500 + Math.random() * 800; // 近红外高原
  });

  // 根据健康水平调整
  const factor = healthLevel === 'high' ? 1.2 : healthLevel === 'low' ? 0.7 : 1.0;
  return spectrum.map(v => Math.floor(v * factor));
};

export const simulateCalibration = () => {
  return {
    dark: new Array(18).fill(0).map(() => Math.floor(40 + Math.random() * 10)),
    white: new Array(18).fill(0).map(() => Math.floor(5800 + Math.random() * 200))
  };
};
