
/**
 * 棉花生理健康本地诊断引擎 (V1.0)
 * 采用国内农业生产标准术语
 */
export interface DiagnosticResult {
  status: 'excellent' | 'normal' | 'deficient' | 'critical';
  title: string;
  advice: string;
  stressAnalysis: string[];
}

export const analyzeSpectraLocally = (wavelengths: number[], reflectance: number[], nContent: number): DiagnosticResult => {
  const stresses: string[] = [];
  
  let status: DiagnosticResult['status'] = 'normal';
  let title = '氮素供应平衡';
  let advice = '当前氮含量处于合理区间。建议维持现有的水肥一体化方案，注意排灌。';

  if (nContent < 22) {
    status = 'critical';
    title = '严重氮素亏缺';
    advice = '检测值显著低于生长下限，建议立即追施速效氮肥（如尿素等），配合叶面喷施。';
  } else if (nContent < 27) {
    status = 'deficient';
    title = '轻度养分不足';
    advice = '养分储备处于临界值，建议在花铃期适量补肥，防止后期生理性早衰。';
  } else if (nContent > 33) {
    status = 'excellent';
    title = '养分供应丰沛';
    advice = '棉株氮素积累充沛，需警惕营养生长过旺导致的徒长，建议视情况进行化控。';
  }

  // 物理特性分析 (光谱特征点)
  const nirIndex = wavelengths.indexOf(810);
  if (reflectance[nirIndex] < 0.35) {
    stresses.push('生理预警：近红外反射值偏低，棉株水分代谢可能存在异常。');
  }

  return {
    status,
    title,
    advice,
    stressAnalysis: stresses.length > 0 ? stresses : ['监测点生理形态表现稳健']
  };
};
