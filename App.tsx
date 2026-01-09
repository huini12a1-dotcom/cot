
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Bluetooth, Activity, Trash2, Download, AlertCircle, CheckCircle2, 
  Loader2, CircleDot, Database, Smartphone, Info, RefreshCw, 
  MessageSquare, Cpu, Leaf, X, Key, BarChart3, Settings2, 
  ShieldCheck, Layers, FileJson, History, TrendingUp, Save
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, 
  LineChart, Line, Legend
} from 'recharts';
import { bluetoothService } from './services/bluetoothService.ts';
import { P7Protocol } from './services/p7Protocol.ts';
import { calculateReflectance, predictNitrogen, DEFAULT_CONFIG } from './services/nitrogenModel.ts';
import { analyzeSpectraLocally, DiagnosticResult } from './services/diagnosticEngine.ts';
import { aiService } from './services/aiService.ts';
import { MessageId, SpectralData, ConnectionStatus } from './types.ts';
import { WAVEBANDS } from './constants.tsx';

/**
 * @class CottonNitrogenPlatform
 * @description 棉花叶片氮素监测平台核心交互层组件
 * 本组件集成了 BLE 通信、多光谱数据反演、边缘计算诊断及 AI 决策系统。
 * 针对 P7 协议与棉花生理特征进行了深度定制。
 */
const App: React.FC = () => {
  // --- 状态管理 (State Management) ---
  const [activeTab, setActiveTab] = useState<'monitor' | 'history' | 'device' | 'analytics'>('monitor');
  const [showDoc, setShowDoc] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [conn, setConn] = useState<ConnectionStatus>({
    connected: false,
    deviceName: null,
    battery: 100,
    firmware: 'V1.0'
  });
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  
  /** 监测记录持久化状态 - 采用本地缓存策略 */
  const [records, setRecords] = useState<SpectralData[]>(() => {
    try {
      const s = localStorage.getItem('cotton_platform_records_v1');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  
  /** 物理标定数据管理 */
  const [darkData, setDarkData] = useState<number[] | null>(() => {
    try {
      const s = localStorage.getItem('cp_dark');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  const [whiteData, setWhiteData] = useState<number[] | null>(() => {
    try {
      const s = localStorage.getItem('cp_white');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  
  /** 当前采样点结果及其诊断反馈 */
  const [results, setResults] = useState<SpectralData | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [tempRemark, setTempRemark] = useState('');

  // 这里的 process.env.API_KEY 会被 vite.config.ts 中的 define 替换为实际值
  const hasApiKey = !!process.env.API_KEY;
  const stateRef = useRef({ darkData, whiteData, isMeasuring });

  useEffect(() => {
    stateRef.current = { darkData, whiteData, isMeasuring };
  }, [darkData, whiteData, isMeasuring]);

  // --- 核心逻辑 (Core Logic) ---

  /**
   * 删除监测记录逻辑
   * @param id 记录唯一标识 ID
   */
  const deleteRecord = (id: string) => {
    if (confirm('确定删除该监测记录？数据删除后将无法找回。')) {
      const next = records.filter(r => r.id !== id);
      setRecords(next);
      localStorage.setItem('cotton_platform_records_v1', JSON.stringify(next));
      if (results?.id === id) {
        setResults(null);
        setDiagnostic(null);
      }
    }
  };

  /**
   * 导出监测数据为 CSV 报表
   * 专为安卓移动端优化的 Blob 下载链路
   */
  const exportData = () => {
    setExportLoading(true);
    try {
      const header = "ID,采样时间,氮素含量(mg/g),健康状态,备注信息\n";
      const rows = records.map(r => {
        const d = new Date(r.timestamp).toLocaleString();
        return `${r.id},${d},${r.nitrogenContent},${r.remarks || '无'}`;
      }).join("\n");
      
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), header + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `棉花氮素监测报表_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      setError("数据导出失败：请检查存储权限或浏览器兼容性");
    } finally {
      setExportLoading(false);
    }
  };

  /**
   * 提交/更新样点备注信息
   */
  const saveRemark = () => {
    if (!results) return;
    const next = records.map(r => r.id === results.id ? { ...r, remarks: tempRemark } : r);
    setRecords(next);
    localStorage.setItem('cotton_platform_records_v1', JSON.stringify(next));
    setResults({ ...results, remarks: tempRemark });
    alert("档案备注已同步至本地数据库");
  };

  /**
   * 处理从 P7 协议解析后的多光谱原始数据载荷
   * 包含物理层信号转换、反射率计算、氮素反演模型运行与本地专家系统诊断触发
   * @param payload 协议原始载荷字节流
   */
  const processData = useCallback((payload: Uint8Array) => {
    const rawData = payload.slice(12);
    const spectrum: number[] = [];
    for (let i = 0; i < rawData.length; i += 2) {
      if (i + 1 < rawData.length) {
        spectrum.push(rawData[i] | (rawData[i+1] << 8));
      }
    }

    const type = (window as any)._pendingType;
    if (type === 'dark') {
      setDarkData(spectrum);
      localStorage.setItem('cp_dark', JSON.stringify(spectrum));
    } else if (type === 'white') {
      setWhiteData(spectrum);
      localStorage.setItem('cp_white', JSON.stringify(spectrum));
    } else if (type === 'sample') {
      const d = stateRef.current.darkData;
      const w = stateRef.current.whiteData;
      
      if (!d || !w) {
        setError('定标缺失：系统检测到黑白定标数据为空，请先执行定标流程。');
        setActiveTab('device');
        setIsMeasuring(false);
        return;
      }

      // 18 波段相对反射率转换逻辑
      const reflectance = calculateReflectance(spectrum, w, d);
      // 氮素反演模型 - 深度优化后的特征加权算法
      const n = predictNitrogen(reflectance, DEFAULT_CONFIG);
      
      const newData: SpectralData = {
        id: `CPN-${Date.now().toString().slice(-6)}`,
        timestamp: Date.now(),
        wavelengths: WAVEBANDS,
        darkCurrent: [...d],
        whiteReference: [...w],
        sampleData: [...spectrum],
        reflectance,
        nitrogenContent: n,
        remarks: ''
      };

      setResults(newData);
      setDiagnostic(analyzeSpectraLocally(WAVEBANDS, reflectance, n));
      setRecords(prev => {
        const next = [newData, ...prev];
        localStorage.setItem('cotton_platform_records_v1', JSON.stringify(next));
        return next;
      });
      setAiReport(null);
      setTempRemark('');
      setActiveTab('monitor');
    }
    setIsMeasuring(false);
  }, []);

  /**
   * 蓝牙底层数据流订阅与协议监听
   */
  useEffect(() => {
    bluetoothService.onData((data) => {
      const parsed = P7Protocol.parsePacket(data);
      if (parsed && parsed.msgId === MessageId.CAPTURE) {
        processData(parsed.payload);
      }
    });
  }, [processData]);

  /**
   * 执行终端扫描与 P7 握手鉴权
   */
  const connect = async () => {
    setError(null); 
    setIsConnecting(true);
    try {
      const name = await bluetoothService.scanAndConnect();
      setConn(c => ({...c, connected: true, deviceName: name }));
      setIsDemoMode(false);
    } catch (e: any) {
      setError(e.message || '终端挂载超时：请确保设备已开启且处于蓝牙配对模式');
    } finally { 
      setIsConnecting(false); 
    }
  };

  /**
   * 触发硬件层测量指令
   * @param type 采样类型说明：dark(暗电流校准), white(标准白板校准), sample(叶片实地采样)
   */
  const startMeasure = async (type: 'dark' | 'white' | 'sample') => {
    if (isDemoMode) {
      setIsMeasuring(true);
      (window as any)._pendingType = type;
      setTimeout(() => {
        const mockData = new Uint8Array(12 + 18*2).fill(0x60);
        processData(mockData);
      }, 800);
      return;
    }
    
    if (!conn.connected) { 
      setError('硬件链路未就绪：请先连接棉氮监测仪器端'); 
      setActiveTab('device'); 
      return; 
    }

    setIsMeasuring(true);
    (window as any)._pendingType = type;
    bluetoothService.clearBuffer();

    let payload = new Uint8Array(12).fill(0xFF);
    if (type === 'white') payload.set([0x01, 0x01, 0x01, 0x00], 0);
    else if (type === 'dark') payload.set([0x00, 0x01, 0x02, 0x00], 0);
    else payload.set([0x01, 0x01, 0x02, 0x00], 0);

    try {
      await bluetoothService.sendPacket(MessageId.CAPTURE, payload);
    } catch (e) {
      setError('驱动异常：P7 协议指令下发失败，请尝试重启设备');
      setIsMeasuring(false);
    }
  };

  // --- UI 组件渲染 (View Logic) ---

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* 顶部状态感知栏 */}
      <header className="bg-white px-6 pt-12 pb-5 border-b border-slate-100 shrink-0 shadow-sm relative z-10">
        <div className="flex justify-between items-center">
          <div onClick={() => setShowDoc(true)} className="active:opacity-60 transition-opacity cursor-help group">
            <h1 className="text-xl font-black text-emerald-600 tracking-tight flex items-center gap-1.5 uppercase">
              棉氮监测平台 <Info size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${conn.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {conn.connected ? `节点 ID: ${conn.deviceName}` : '系统待命 (BLE OFF)'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setActiveTab('analytics')} className={`p-2.5 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                <TrendingUp size={20} />
             </button>
             <button onClick={() => setActiveTab('device')} className={`p-2.5 rounded-xl transition-all ${activeTab === 'device' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                <Settings2 size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* 核心功能视图区 */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-in shake duration-300">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        {/* 1. 终端连接管理视图 */}
        {activeTab === 'device' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 text-emerald-600 rotate-12"><Cpu size={120} /></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Bluetooth size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">硬件终端状态</h3>
                </div>
                {!conn.connected ? (
                  <div className="space-y-3">
                    <button onClick={connect} disabled={isConnecting} className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:bg-emerald-700 shadow-lg shadow-emerald-100 disabled:opacity-50">
                      {isConnecting ? <Loader2 className="animate-spin" size={18} /> : <Bluetooth size={18} />}
                      {isConnecting ? '协议层握手中...' : '连接仪器端'}
                    </button>
                    <button onClick={() => { setIsDemoMode(true); setConn(c => ({...c, connected: true, deviceName: '虚拟科研节点'})); }} className="w-full text-slate-300 font-black py-2 text-[10px] uppercase tracking-[0.3em] active:text-emerald-400">
                      开启全仿真运行模式
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                    <div className="flex justify-between items-center text-xs font-black text-emerald-700 uppercase">
                      <span>已连接节点</span>
                      <span className="italic">{conn.deviceName}</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                       <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-100 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <Activity size={12} /> RSSI: -65dBm
                       </div>
                       <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-100 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <Layers size={12} /> FW: V1.0.2
                       </div>
                    </div>
                    <button onClick={() => { bluetoothService.disconnect(); setConn(c => ({...c, connected: false})); setIsDemoMode(false); }} className="w-full mt-5 bg-white border border-red-100 text-red-500 text-xs font-black py-3 rounded-xl shadow-sm active:bg-red-50">
                      断开连接
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <RefreshCw size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800">系统光学标定</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => startMeasure('dark')} disabled={isMeasuring} className={`p-6 rounded-[1.5rem] border-2 flex flex-col items-center gap-3 transition-all ${darkData ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                  {isMeasuring && (window as any)._pendingType === 'dark' ? <Loader2 className="animate-spin text-emerald-600" /> : (darkData ? <CheckCircle2 size={24} className="text-emerald-500" /> : <CircleDot size={24} />)}
                  <span className="text-[11px] font-black uppercase tracking-widest">零位暗电流</span>
                </button>
                <button onClick={() => startMeasure('white')} disabled={isMeasuring} className={`p-6 rounded-[1.5rem] border-2 flex flex-col items-center gap-3 transition-all ${whiteData ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                   {isMeasuring && (window as any)._pendingType === 'white' ? <Loader2 className="animate-spin text-emerald-600" /> : (whiteData ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Database size={24} />)}
                  <span className="text-[11px] font-black uppercase tracking-widest">白板增益</span>
                </button>
              </div>
              <p className="mt-4 text-[10px] text-slate-400 text-center font-medium px-4 leading-relaxed">
                * 每次监测前执行白板定标，可有效消除杂散光与环境光强度变化导致的误差。
              </p>
            </div>
          </div>
        )}

        {/* 2. 核心监测与反演结果视图 */}
        {activeTab === 'monitor' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-md relative overflow-hidden">
              <div className="absolute -top-4 -right-4 p-8 opacity-5 text-emerald-600"><Activity size={180} /></div>
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                    <Activity size={18} className="text-emerald-600" /> 实时监测
                  </h2>
                  <button onClick={() => startMeasure('sample')} disabled={isMeasuring || (!isDemoMode && (!darkData || !whiteData))} className="bg-emerald-600 text-white font-black px-7 py-4 rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-30">
                    {isMeasuring ? <Loader2 className="animate-spin" size={16} /> : <Leaf size={16} />}
                    开始采样
                  </button>
                </div>

                <div className="flex flex-col items-center pb-8">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4">Leaf Nitrogen Index</p>
                  <div className="flex items-baseline gap-1">
                     <span className="text-[100px] font-black text-emerald-600 tabular-nums tracking-tighter leading-none">
                       {results?.nitrogenContent?.toFixed(1) || '--.-'}
                     </span>
                     <span className="text-lg font-black text-emerald-600/40">mg/g</span>
                  </div>
                  {diagnostic && (
                    <div className={`mt-10 px-8 py-2.5 rounded-full text-[12px] font-black border-2 flex items-center gap-2 ${
                      diagnostic.status === 'excellent' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-amber-50 border-amber-500 text-amber-700'
                    }`}>
                      <ShieldCheck size={14} /> 模型诊断：{diagnostic.title}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {results && diagnostic && (
              <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2">
                <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                   <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Info size={14} className="text-emerald-600" /> 生理诊断建议</h3>
                   <div className="p-5 bg-slate-50 rounded-2xl mb-6 font-bold text-sm text-slate-700 leading-relaxed border border-slate-100">
                     {diagnostic.advice}
                   </div>
                   
                   {!hasApiKey ? (
                     <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 text-slate-600 font-black text-xs uppercase tracking-wider">
                          <Key size={14} /> 云端模型离线
                        </div>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                          当前处于本地模式。请在应用部署设置中配置环境变量 API_KEY 以启用 Gemini 专家引擎。
                        </p>
                     </div>
                   ) : (
                     <button onClick={async () => { setIsAiLoading(true); setAiReport(await aiService.analyzeCottonHealth(results.nitrogenContent, diagnostic.title, diagnostic.stressAnalysis)); setIsAiLoading(false); }} disabled={isAiLoading} className="w-full bg-emerald-600 text-white font-black py-4.5 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md transition-all active:scale-[0.98]">
                       {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Cpu size={16} />}
                       云端智库分析
                     </button>
                   )}
                   
                   {aiReport && (
                     <div className="mt-5 p-6 bg-emerald-50/40 rounded-2xl border border-emerald-100 animate-in zoom-in-95 duration-300">
                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-700 uppercase mb-3"><MessageSquare size={12} /> AI 决策支持建议</div>
                        <p className="text-[13px] font-medium text-slate-800 leading-[1.8] whitespace-pre-wrap">{aiReport}</p>
                     </div>
                   )}
                </section>
                
                <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                   <h3 className="text-[10px] font-black text-slate-400 mb-8 uppercase tracking-[0.2em] text-center flex items-center justify-center gap-2">
                     <Layers size={14} /> 18-Band Reflectance Spectrum
                   </h3>
                   <div className="h-48 -ml-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={WAVEBANDS.map((w, i) => ({ w, val: results.reflectance[i] }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="w" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 900}} />
                        <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 900}} domain={[0, 1.1]} />
                        <Tooltip cursor={{ stroke: '#10b981', strokeWidth: 2 }} contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold'}} />
                        <Area type="monotone" dataKey="val" stroke="#10b981" strokeWidth={5} fillOpacity={0.1} fill="#10b981" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={14} /> 样点档案备注</h3>
                     <button onClick={saveRemark} className="text-emerald-600 text-[10px] font-black bg-emerald-50 px-4 py-2 rounded-xl active:bg-emerald-100 flex items-center gap-1.5"><Save size={12} /> 保存更新</button>
                   </div>
                   <textarea value={tempRemark} onChange={(e) => setTempRemark(e.target.value)} placeholder="记录地块信息或物候特征..." className="w-full h-28 p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/10 resize-none transition-all placeholder:text-slate-300" />
                </section>
              </div>
            )}
          </div>
        )}

        {/* 3. 统计分析与科研报表视图 */}
        {activeTab === 'analytics' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">监测记录趋势</h3>
                <div className="h-64 -ml-6">
                   <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={records.slice().reverse()}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                         <XAxis dataKey="id" hide />
                         <YAxis domain={[10, 50]} fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                         <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)'}} />
                         <Line type="monotone" dataKey="nitrogenContent" stroke="#10b981" strokeWidth={4} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 8 }} name="氮含量" />
                      </LineChart>
                   </ResponsiveContainer>
                </div>
                <div className="mt-6 flex justify-between gap-4">
                   <div className="bg-slate-50 flex-1 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">样本均值</p>
                      <p className="text-xl font-black text-slate-800">
                        {(records.reduce((a, b) => a + b.nitrogenContent, 0) / (records.length || 1)).toFixed(1)} <span className="text-xs">mg/g</span>
                      </p>
                   </div>
                   <div className="bg-slate-50 flex-1 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">变异系数</p>
                      <p className="text-xl font-black text-slate-800">
                        {(Math.sqrt(records.reduce((a, b) => a + Math.pow(b.nitrogenContent - 25, 2), 0) / (records.length || 1)) / 25).toFixed(3)}
                      </p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* 4. 历史记录管理视图 */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">监测历史库</h2>
              <button onClick={exportData} disabled={exportLoading} className="text-[10px] text-emerald-600 font-black bg-emerald-50 px-5 py-2.5 rounded-2xl flex items-center gap-1 shadow-sm active:bg-emerald-100">
                {exportLoading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                导出报表
              </button>
            </div>
            <div className="space-y-3 pb-24">
              {records.map(r => (
                <div key={r.id} onClick={() => { setResults(r); setDiagnostic(analyzeSpectraLocally(WAVEBANDS, r.reflectance, r.nitrogenContent)); setTempRemark(r.remarks || ''); setAiReport(null); setActiveTab('monitor'); }} className="bg-white p-5 rounded-[1.75rem] border border-slate-100 flex items-center justify-between active:bg-emerald-50 transition-all active:scale-[0.97] group shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black transition-colors ${r.nitrogenContent < 22 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      <span className="text-lg tabular-nums">{r.nitrogenContent.toFixed(1)}</span>
                      <span className="text-[7px] mt-0.5 opacity-40 uppercase">mg/g</span>
                    </div>
                    <div>
                      <p className="font-black text-sm text-slate-800 tracking-tight">{r.id}</p>
                      <p className="text-[10px] font-black text-slate-400 mt-0.5 uppercase flex items-center gap-1.5">
                        <History size={10} /> {new Date(r.timestamp).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }} className="p-3 text-slate-200 hover:text-red-400 transition-all active:scale-125">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {records.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-200">
                  <Database size={56} strokeWidth={1} />
                  <p className="mt-4 font-black text-[10px] uppercase tracking-[0.3em]">No Cached Records Found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 底部功能导航 (Bottom Navigation) */}
      <nav className="fixed bottom-6 left-6 right-6 bg-white/95 backdrop-blur-xl border border-slate-100 shadow-2xl rounded-[2.5rem] flex justify-around items-center h-20 safe-bottom">
        {[
          { id: 'device', icon: Smartphone, label: '终端' },
          { id: 'monitor', icon: BarChart3, label: '监测' },
          { id: 'analytics', icon: TrendingUp, label: '统计' },
          { id: 'history', icon: Database, label: '库' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center w-full h-full relative transition-all duration-300 ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-300'}`}>
            <tab.icon size={22} className={activeTab === tab.id ? 'stroke-[3.5px]' : 'stroke-[2px]'} />
            <span className={`text-[9px] font-black mt-1.5 uppercase tracking-widest transition-opacity ${activeTab === tab.id ? 'opacity-100' : 'opacity-40'}`}>{tab.label}</span>
            {activeTab === tab.id && <div className="absolute top-0 w-8 h-1 bg-emerald-600 rounded-full shadow-[0_2px_10px_rgba(16,185,129,0.3)]" />}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
