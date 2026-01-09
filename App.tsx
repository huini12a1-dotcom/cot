
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Bluetooth, Activity, History as HistoryIcon, Trash2, Download,
  AlertCircle, CheckCircle2, Loader2, CircleDot, Database, 
  Smartphone, Info, RefreshCw, MessageSquare, Cpu, Leaf, X
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { bluetoothService } from './services/bluetoothService.ts';
import { P7Protocol } from './services/p7Protocol.ts';
import { calculateReflectance, predictNitrogen, DEFAULT_CONFIG } from './services/nitrogenModel.ts';
import { analyzeSpectraLocally, DiagnosticResult } from './services/diagnosticEngine.ts';
import { aiService } from './services/aiService.ts';
import { MessageId, SpectralData, ConnectionStatus } from './types.ts';
import { WAVEBANDS } from './constants.tsx';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'history' | 'device'>('monitor');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [conn, setConn] = useState<ConnectionStatus>({
    connected: false,
    deviceName: null,
    battery: 100,
    firmware: '1.0.0'
  });
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [records, setRecords] = useState<SpectralData[]>(() => {
    const s = localStorage.getItem('cotton_records_v1');
    return s ? JSON.parse(s) : [];
  });
  
  const [darkData, setDarkData] = useState<number[] | null>(() => {
    const s = localStorage.getItem('spectral_dark');
    return s ? JSON.parse(s) : null;
  });
  const [whiteData, setWhiteData] = useState<number[] | null>(() => {
    const s = localStorage.getItem('spectral_white');
    return s ? JSON.parse(s) : null;
  });
  
  const [results, setResults] = useState<SpectralData | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [tempRemark, setTempRemark] = useState('');

  const stateRef = useRef({ darkData, whiteData, isMeasuring });
  useEffect(() => {
    stateRef.current = { darkData, whiteData, isMeasuring };
  }, [darkData, whiteData, isMeasuring]);

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
      localStorage.setItem('spectral_dark', JSON.stringify(spectrum));
    } else if (type === 'white') {
      setWhiteData(spectrum);
      localStorage.setItem('spectral_white', JSON.stringify(spectrum));
    } else if (type === 'sample') {
      const d = stateRef.current.darkData;
      const w = stateRef.current.whiteData;
      if (!d || !w) {
        setError('请先完成黑白校准');
        setActiveTab('device');
        return;
      }
      const reflectance = calculateReflectance(spectrum, w, d);
      const n = predictNitrogen(reflectance, DEFAULT_CONFIG);
      
      const newData: SpectralData = {
        id: `N${Date.now().toString().slice(-6)}`,
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
        localStorage.setItem('cotton_records_v1', JSON.stringify(next));
        return next;
      });
      setAiReport(null);
      setTempRemark('');
      setActiveTab('monitor');
    }
    setIsMeasuring(false);
  }, []);

  useEffect(() => {
    bluetoothService.onData((data) => {
      const parsed = P7Protocol.parsePacket(data);
      if (parsed && parsed.msgId === MessageId.CAPTURE) {
        processData(parsed.payload);
      }
    });
  }, [processData]);

  const connect = async () => {
    setError(null); setIsConnecting(true);
    try {
      const name = await bluetoothService.scanAndConnect();
      setConn(c => ({...c, connected: true, deviceName: name }));
      setIsDemoMode(false);
    } catch (e: any) {
      setError(e.message || '连接失败');
    } finally { setIsConnecting(false); }
  };

  const startMeasure = async (type: 'dark' | 'white' | 'sample') => {
    if (isDemoMode) {
      setIsMeasuring(true);
      (window as any)._pendingType = type;
      setTimeout(() => processData(new Uint8Array(12 + 18*2).fill(0x50)), 600);
      return;
    }
    if (!conn.connected) { setError('设备未连接'); setActiveTab('device'); return; }

    setIsMeasuring(true);
    (window as any)._pendingType = type;
    bluetoothService.clearBuffer();

    let payload = new Uint8Array(12).fill(0xFF);
    if (type === 'white') {
      payload.set([0x01, 0x01, 0x01, 0x00], 0);
    } else if (type === 'dark') {
      payload.set([0x00, 0x01, 0x02, 0x00], 0);
    } else {
      payload.set([0x01, 0x01, 0x02, 0x00], 0);
    }

    try {
      await bluetoothService.sendPacket(MessageId.CAPTURE, payload);
    } catch (e) {
      setError('指令发送失败');
      setIsMeasuring(false);
    }
  };

  const deleteRecord = (id: string) => {
    if (confirm('删除该记录？')) {
      const next = records.filter(r => r.id !== id);
      setRecords(next);
      localStorage.setItem('cotton_records_v1', JSON.stringify(next));
      if (results?.id === id) setResults(null);
    }
  };

  const saveRemark = () => {
    if (!results) return;
    const next = records.map(r => r.id === results.id ? { ...r, remarks: tempRemark } : r);
    setRecords(next);
    localStorage.setItem('cotton_records_v1', JSON.stringify(next));
    setResults({ ...results, remarks: tempRemark });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <header className="bg-white px-6 pt-12 pb-5 border-b border-slate-100 shrink-0 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-emerald-600 tracking-tight">棉氮监测系统</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${conn.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {conn.connected ? '设备已就绪' : '设备未就绪'}
              </span>
            </div>
          </div>
          <button onClick={() => setActiveTab('device')} className={`p-2.5 rounded-xl transition-all ${activeTab === 'device' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
            <Smartphone size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-in fade-in zoom-in">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        {activeTab === 'device' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Bluetooth size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800">硬件鉴权连接</h3>
              </div>
              {!conn.connected ? (
                <div className="space-y-3">
                  <button onClick={connect} disabled={isConnecting} className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:bg-emerald-700 shadow-lg shadow-emerald-100 disabled:opacity-50">
                    {isConnecting ? <Loader2 className="animate-spin" size={18} /> : <Bluetooth size={18} />}
                    {isConnecting ? '密钥鉴权中...' : '搜索并鉴权'}
                  </button>
                  <button onClick={() => { setIsDemoMode(true); setConn(c => ({...c, connected: true, deviceName: '虚拟调试模式'})); }} className="w-full text-slate-300 font-black py-2 text-[10px] uppercase tracking-[0.3em]">
                    进入虚拟环境
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                  <div className="flex justify-between items-center text-xs font-black text-emerald-700 uppercase">
                    <span>当前在线</span>
                    <span className="italic">{conn.deviceName}</span>
                  </div>
                  <button onClick={() => { bluetoothService.disconnect(); setConn(c => ({...c, connected: false})); setIsDemoMode(false); }} className="w-full mt-5 bg-white border border-red-100 text-red-500 text-xs font-black py-3 rounded-xl shadow-sm">
                    断开连接
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <RefreshCw size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800">基准校准流</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => startMeasure('dark')} disabled={isMeasuring} className={`p-6 rounded-[1.5rem] border-2 flex flex-col items-center gap-3 transition-all ${darkData ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                  {isMeasuring && (window as any)._pendingType === 'dark' ? <Loader2 className="animate-spin text-emerald-600" /> : (darkData ? <CheckCircle2 size={24} className="text-emerald-500" /> : <CircleDot size={24} />)}
                  <span className="text-[11px] font-black uppercase tracking-widest">暗电流采集</span>
                </button>
                <button onClick={() => startMeasure('white')} disabled={isMeasuring} className={`p-6 rounded-[1.5rem] border-2 flex flex-col items-center gap-3 transition-all ${whiteData ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                   {isMeasuring && (window as any)._pendingType === 'white' ? <Loader2 className="animate-spin text-emerald-600" /> : (whiteData ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Database size={24} />)}
                  <span className="text-[11px] font-black uppercase tracking-widest">白板定标</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'monitor' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-md">
              <div className="flex justify-between items-center mb-12">
                <h2 className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                  <Activity size={18} className="text-emerald-600" /> 实时诊断
                </h2>
                <button onClick={() => startMeasure('sample')} disabled={isMeasuring || (!isDemoMode && (!darkData || !whiteData))} className="bg-emerald-600 text-white font-black px-7 py-4 rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-30">
                  {isMeasuring ? <Loader2 className="animate-spin" size={16} /> : <Leaf size={16} />}
                  开始采样
                </button>
              </div>

              <div className="flex flex-col items-center pb-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-4">Leaf Nitrogen (MG/G)</p>
                <div className="flex items-baseline gap-1">
                   <span className="text-[100px] font-black text-emerald-600 tabular-nums tracking-tighter leading-none">
                     {results?.nitrogenContent?.toFixed(1) || '--.-'}
                   </span>
                </div>
                {diagnostic && (
                  <div className={`mt-10 px-8 py-2.5 rounded-full text-[12px] font-black border-2 ${
                    diagnostic.status === 'excellent' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-emerald-50/50 border-emerald-200 text-emerald-600'
                  }`}>
                    {diagnostic.title}
                  </div>
                )}
              </div>
            </div>

            {results && diagnostic && (
              <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2">
                <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                   <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Info size={14} className="text-emerald-600" /> 生理建议</h3>
                   <p className="text-sm font-bold text-slate-700 leading-relaxed mb-8">{diagnostic.advice}</p>
                   <button onClick={async () => { setIsAiLoading(true); setAiReport(await aiService.analyzeCottonHealth(results.nitrogenContent, diagnostic.title, diagnostic.stressAnalysis)); setIsAiLoading(false); }} disabled={isAiLoading} className="w-full bg-emerald-600 text-white font-black py-4.5 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md">
                     {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Cpu size={16} />}
                     AI 专家辅助决策
                   </button>
                   {aiReport && (
                     <div className="mt-5 p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                        <p className="text-[13px] font-medium text-slate-800 leading-[1.8]">{aiReport}</p>
                     </div>
                   )}
                </section>
                
                <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                   <h3 className="text-[10px] font-black text-slate-400 mb-8 uppercase tracking-[0.2em] text-center">反射光谱 profile</h3>
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
                     <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={14} /> 样点备注</h3>
                     <button onClick={saveRemark} className="text-emerald-600 text-[10px] font-black bg-emerald-50 px-4 py-2 rounded-xl">更新</button>
                   </div>
                   <textarea value={tempRemark} onChange={(e) => setTempRemark(e.target.value)} placeholder="记录采样地块及形态..." className="w-full h-28 p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/10 resize-none transition-all" />
                </section>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-lg font-black text-slate-800">监测档案</h2>
              <button onClick={() => {}} className="text-[10px] text-emerald-600 font-black bg-emerald-50 px-5 py-2.5 rounded-2xl flex items-center gap-1 shadow-sm">
                <Download size={14} /> 导出报表
              </button>
            </div>
            <div className="space-y-3 pb-24">
              {records.map(r => (
                <div key={r.id} onClick={() => { setResults(r); setDiagnostic(analyzeSpectraLocally(WAVEBANDS, r.reflectance, r.nitrogenContent)); setTempRemark(r.remarks || ''); setAiReport(null); setActiveTab('monitor'); }} className="bg-white p-5 rounded-[1.75rem] border border-slate-100 flex items-center justify-between active:bg-emerald-50 transition-all active:scale-[0.97]">
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black ${r.nitrogenContent < 22 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      <span className="text-lg tabular-nums">{r.nitrogenContent.toFixed(1)}</span>
                      <span className="text-[7px] mt-0.5 opacity-40 uppercase">mg/g</span>
                    </div>
                    <div>
                      <p className="font-black text-sm text-slate-800">{r.id}</p>
                      <p className="text-[10px] font-black text-slate-400 mt-0.5">{new Date(r.timestamp).toLocaleString('zh-CN', { hour12: false })}</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }} className="p-3 text-slate-200 hover:text-red-400 transition-all">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-6 left-6 right-6 bg-white/95 backdrop-blur-xl border border-slate-100 shadow-2xl rounded-[2.5rem] flex justify-around items-center h-20 safe-bottom">
        {[
          { id: 'device', icon: Smartphone, label: '设备' },
          { id: 'monitor', icon: Activity, label: '监测' },
          { id: 'history', icon: HistoryIcon, label: '档案' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center w-full h-full relative transition-all duration-300 ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-300'}`}>
            <tab.icon size={22} className={activeTab === tab.id ? 'stroke-[3px]' : 'stroke-[2px]'} />
            <span className={`text-[9px] font-black mt-1.5 uppercase tracking-widest ${activeTab === tab.id ? 'opacity-100' : 'opacity-40'}`}>{tab.label}</span>
            {activeTab === tab.id && <div className="absolute top-0 w-8 h-1 bg-emerald-600 rounded-full shadow-[0_2px_10px_rgba(16,185,129,0.3)]" />}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
