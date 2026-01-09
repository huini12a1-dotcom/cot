
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const aiService = {
  async analyzeCottonHealth(nitrogen: number, status: string, stressors: string[]): Promise<string> {
    try {
      const prompt = `你是一位中国棉花精准管理专家。请根据以下数据提供农事建议：
      - 监测氮含量：${nitrogen} mg/g
      - 本地诊断状态：${status}
      - 潜在压力：${stressors.join(', ')}
      
      请提供约 150 字的专业建议，包括追肥调控和病虫害预防建议，语气要专业且务实，符合中国棉农的生产习惯。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "你是由先进科技驱动的中国棉花科研专家系统。你精通光谱诊断、水肥一体化和棉花生理学。你的目标是帮助用户最大化产量并优化肥料投入。"
        }
      });

      return response.text || "AI 专家暂时无法生成报告。";
    } catch (error) {
      console.error("AI Analysis Error:", error);
      return "智能分析系统连接异常，请参考本地诊断意见。";
    }
  }
};
