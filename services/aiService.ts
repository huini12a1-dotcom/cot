
import { GoogleGenAI } from "@google/genai";

export const aiService = {
  async analyzeCottonHealth(nitrogen: number, status: string, stressors: string[]): Promise<string> {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `[棉花叶片氮素监测平台 - 智能决策请求]
      监测数据摘要：
      - 氮素水平：${nitrogen} mg/g
      - 边缘诊断状态：${status}
      - 生理性压力点：${stressors.join(', ')}
      
      请依据棉花栽培生理学与植物营养学规范，给出专家建议：
      1. 精准肥水调控方案（含推荐肥种）；
      2. 针对性长势补强措施；
      3. 短期生理健康趋势预测。
      回复要求：学术专业，分点陈述，200字以内。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "你是由先进遥感多光谱分析驱动的“棉花叶片氮素监测平台”核心专家引擎。你的回答应基于严谨的农艺学逻辑，客观、权威且具备实操价值。"
        }
      });

      return response.text || "云端分析暂时不可用。";
    } catch (error) {
      return "专家引擎响应异常。";
    }
  }
};
