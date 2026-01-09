
export interface DiagnosticResult {
  status: 'excellent' | 'normal' | 'deficient' | 'critical';
  title: string;
  advice: string;
  stressAnalysis: string[];
}

export const analyzeSpectraLocally = (wavelengths: number[], reflectance: number[], nContent: number): DiagnosticResult => {
  const stresses: string[] = [];
  let status: DiagnosticResult['status'] = 'normal';
  let title = '氮营养适中';
  let advice = '当前氮含量处于合理区间。建议维持现有水肥方案，重点观察水分状况。';

  if (nContent < 22) {
    status = 'critical';
    title = '严重氮素亏缺';
    advice = '检测值显著低于正常下限。建议立即补充速效氮肥，并进行叶面补肥作业。';
  } else if (nContent < 27) {
    status = 'deficient';
    title = '中度养分不足';
    advice = '养分储备不足，建议分批次补肥，防止花铃期出现明显的生理早衰迹象。';
  } else if (nContent > 33) {
    status = 'excellent';
    title = '氮素供应充足';
    advice = '氮积累充沛。需预防营养生长过旺导致的徒长现象，应视情况强化缩节安化控。';
  }

  const nirIndex = wavelengths.indexOf(810);
  if (reflectance[nirIndex] < 0.35) {
    stresses.push('生理预警：近红外反射能力减弱，植株水分利用率可能受限。');
  }

  return {
    status,
    title,
    advice,
    stressAnalysis: stresses.length > 0 ? stresses : ['监测点生理形态表现稳健']
  };
};
