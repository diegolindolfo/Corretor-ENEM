/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  Clock,
  Loader2,
  Settings,
  ExternalLink,
  Zap,
  Columns,
  Maximize2 as Maximized,
  FileSearch,
  X
} from 'lucide-react';
import { evaluateEssay, performOCR, EvaluationResult, setUserApiKey } from './services/geminiService';

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'ocr_processing' | 'ready' | 'correcting' | 'completed' | 'error';
  ocrText?: string;
  evaluation?: EvaluationResult;
  error?: string;
}

export default function App() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [theme, setTheme] = useState('Desafios para a valorização de comunidades e povos tradicionais no Brasil');
  const [usage, setUsage] = useState({ totalTokens: 0, requests: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('google_ai_key') || '');
  const [viewMode, setViewMode] = useState<'split' | 'full'>('split');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItem = queue.find(item => item.id === activeId);

  // Processamento de OCR (Baixa latência)
  const processOCR = useCallback(async (item: QueueItem) => {
    try {
      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'ocr_processing' } : i));
      
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(item.file);
      });
      const base64 = await base64Promise;
      
      const res = await performOCR(base64, item.file.type);
      
      setQueue(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'ready', 
        ocrText: res.text 
      } : i));
    } catch (err: any) {
      setQueue(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'error', 
        error: err.message 
      } : i));
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems: QueueItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      status: 'pending'
    }));
    
    setQueue(prev => [...prev, ...newItems]);
    newItems.forEach(item => processOCR(item));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Correção Profunda (Sob demanda qdo professor seleciona)
  const startCorrection = useCallback(async (item: QueueItem) => {
    if (!item.ocrText || item.status === 'correcting' || item.status === 'completed') return;

    try {
      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'correcting' } : i));
      const result = await evaluateEssay(item.ocrText, theme);
      
      setUsage(prev => ({
        totalTokens: prev.totalTokens + (result.usage?.totalTokens || 0),
        requests: prev.requests + 1
      }));

      setQueue(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'completed', 
        evaluation: result 
      } : i));
    } catch (err: any) {
      setQueue(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'error', 
        error: err.message 
      } : i));
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('google_ai_key', customApiKey);
    setUserApiKey(customApiKey || null);
  }, [customApiKey]);

  // Inicia correção automaticamente se o professor abrir um item pronto
  useEffect(() => {
    if (activeItem && activeItem.status === 'ready') {
      startCorrection(activeItem);
    }
  }, [activeId, activeItem?.status, startCorrection]);

  const removeItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
    if (activeId === id) setActiveId(null);
  };

  const reset = () => {
    queue.forEach(i => i.preview && URL.revokeObjectURL(i.preview));
    setQueue([]);
    setActiveId(null);
    setUsage({ totalTokens: 0, requests: 0 });
  };

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-200 overflow-hidden">
      {/* Sidebar - Fila de Trabalho */}
      <aside className="w-80 border-r border-white/5 bg-slate-900/50 flex flex-col">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg shadow-sky-500/20">
              <FileSearch className="w-5 h-5 text-slate-950" />
            </div>
            <h1 className="font-black text-sm tracking-tighter uppercase">Fila de Redações</h1>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 text-xs font-bold uppercase tracking-widest hover:bg-sky-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload em Massa
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            multiple 
            accept="image/*,application/pdf" 
            className="hidden" 
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1 custom-scrollbar">
          {queue.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-700">
              <Clock className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Nenhuma redação</p>
            </div>
          )}
          {queue.map((item) => (
            <div
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`w-full group p-3 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
                activeId === item.id ? 'bg-sky-500/20 border border-sky-500/30' : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="relative">
                {item.preview ? (
                  <img src={item.preview} className="w-10 h-10 object-cover rounded-lg border border-white/10" />
                ) : (
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-white/5 text-slate-500">
                    <FileText className="w-5 h-5" />
                  </div>
                )}
                {item.status === 'completed' && (
                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full border-2 border-slate-900">
                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[11px] font-bold truncate text-slate-200">
                  {item.file.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${
                    item.status === 'completed' ? 'text-emerald-400' :
                    item.status === 'error' ? 'text-rose-400' :
                    'text-sky-400/60'
                  }`}>
                    {item.status === 'ocr_processing' ? 'Digitalizando...' : 
                     item.status === 'correcting' ? 'Corrigindo...' : 
                     item.status === 'ready' ? 'Pronto' : 
                     item.status === 'completed' ? 'Concluído' :
                     item.status === 'error' ? 'Erro' : 'Pendente'}
                  </span>
                </div>
              </div>
              <button 
                onClick={(e) => removeItem(item.id, e)}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-rose-400 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 bg-slate-950/50">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            <span>Uso da Sessão</span>
            <span className="text-sky-400">{usage.requests} Correções</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((usage.totalTokens / 500000) * 100, 100)}%` }}
              className="bg-sky-500 h-full"
            />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        <header className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-950/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="max-w-xl w-full">
               <input 
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-xs font-medium focus:border-sky-500/30 outline-none text-slate-300"
                  placeholder="Defina o tema para correção..."
               />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-900 p-1 rounded-lg border border-white/5">
              <button 
                onClick={() => setViewMode('split')}
                className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                title="Visão Lado a Lado"
              >
                <Columns className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('full')}
                className={`p-1.5 rounded transition-all ${viewMode === 'full' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                title="Visão Focada"
              >
                <FileText className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={reset}
              className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
              title="Limpar Tudo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {activeItem ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Lado Esquerdo: Imagem Original */}
            {viewMode === 'split' && (
              <div className="flex-1 border-r border-white/5 relative overflow-hidden bg-slate-900 flex flex-col">
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/80 backdrop-blur-sm shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                    <ImageIcon className="w-3 h-3" /> Manuscrito Original
                  </span>
                </div>
                {activeItem.preview ? (
                  <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/notebook.png')] bg-fixed">
                     <img 
                        src={activeItem.preview} 
                        className="w-full rounded-lg shadow-2xl ring-1 ring-white/10" 
                        alt="Redação"
                      />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-700 bg-slate-950">
                    <FileText className="w-16 h-16 opacity-10 mb-4" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-30">Documento PDF</p>
                  </div>
                )}
              </div>
            )}

            {/* Lado Direito: Editor / Feedback */}
            <div className={`flex-1 flex flex-col bg-slate-950 overflow-hidden`}>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeItem.status === 'ocr_processing' || activeItem.status === 'correcting' ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12">
                     <div className="relative mb-8">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                          className="w-20 h-20 border-2 border-sky-500/20 border-t-sky-500 rounded-full"
                        />
                        <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-sky-400 animate-pulse" />
                     </div>
                     <h2 className="text-2xl font-black text-white tracking-tighter mb-2">
                        {activeItem.status === 'ocr_processing' ? 'Extraindo Texto...' : 'Análise Especializada...'}
                     </h2>
                     <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                        {activeItem.status === 'ocr_processing' 
                          ? 'Nossa visão computacional está digitalizando o manuscrito.' 
                          : 'Gemini 3.1 Pro está avaliando as 5 competências do ENEM.'}
                     </p>
                  </div>
                ) : activeItem.status === 'error' ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-rose-500/10 rounded-3xl">
                    <AlertCircle className="w-16 h-16 text-rose-500 mb-6" />
                    <h2 className="text-2xl font-bold text-white mb-2">Falha no Processamento</h2>
                    <p className="text-sm text-slate-500 mb-8 max-w-md">{activeItem.error}</p>
                    <button 
                       onClick={() => activeItem.ocrText ? startCorrection(activeItem) : processOCR(activeItem)}
                       className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all text-sky-400"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                ) : activeItem.evaluation ? (
                  /* RESULTADO DA AVALIAÇÃO */
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 pb-20">
                    <div className="flex justify-between items-end">
                      <div>
                        <h2 className="text-4xl font-black text-white tracking-tighter mb-2">Nota Final</h2>
                        <p className="text-sm text-slate-500 font-medium">{activeItem.file.name}</p>
                      </div>
                      <div className="text-center">
                        <span className="text-6xl font-black text-sky-400 leading-none">{activeItem.evaluation.redacao_eval.grade_total}</span>
                        <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Pontos</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3">
                      {Object.entries(activeItem.evaluation.redacao_eval.competencias).map(([key, comp]: [string, any]) => (
                        <div key={key} className="p-4 bg-slate-900 rounded-2xl border border-white/5 group hover:border-sky-500/30 transition-all">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[9px] font-black text-slate-500 uppercase">{key}</span>
                            <span className="text-base font-black text-sky-400">{comp.score}</span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500" style={{ width: `${(comp.score / 200) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 border-b border-white/5 pb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Detalhamento Pedagógico
                      </h3>
                      <div className="grid gap-4">
                        {Object.entries(activeItem.evaluation.redacao_eval.competencias).map(([key, comp]: [string, any]) => (
                          <div key={key} className="p-6 bg-slate-900/50 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-black rounded uppercase border border-sky-500/20">{key.toUpperCase()}</span>
                              <h4 className="text-xs font-bold text-slate-300">{getCompLabel(key)}</h4>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed italic mb-4">"{comp.feedback}"</p>
                            {key === 'c1' && comp.destaques?.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {comp.destaques.map((d: string, i: number) => (
                                  <span key={i} className="px-2 py-1 bg-rose-500/5 border border-rose-500/10 text-rose-300 text-[9px] font-medium rounded-full">
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-8 bg-sky-500/5 border border-sky-500/10 rounded-3xl relative overflow-hidden group">
                       <Zap className="absolute -right-4 -bottom-4 w-32 h-32 text-sky-500/5 rotate-12 group-hover:scale-110 transition-transform" />
                       <h3 className="text-xs font-black uppercase tracking-widest text-sky-400 mb-4">Proposta de Intervenção (Destaque)</h3>
                       <p className="text-sm text-slate-300 leading-relaxed italic z-10 relative">"{activeItem.evaluation.redacao_eval.competencias.c5.feedback}"</p>
                    </div>
                  </motion.div>
                ) : (
                  /* EDITOR DO TEXTO EXTRAÍDO */
                  <div className="h-full flex flex-col space-y-6">
                    <div className="flex items-center justify-between shrink-0">
                      <div>
                         <h2 className="text-xl font-bold text-white">Conferência de Texto</h2>
                         <p className="text-xs text-slate-500 mt-1">Valide a leitura do OCR antes da análise final.</p>
                      </div>
                      <button 
                        onClick={() => startCorrection(activeItem)}
                        className="px-6 py-2.5 bg-sky-500 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-sky-400 transition-all flex items-center gap-2 shadow-lg shadow-sky-500/20 active:scale-95"
                      >
                        <Zap className="w-4 h-4" />
                        Iniciar Correção Profunda
                      </button>
                    </div>
                    <div className="flex-1 min-h-[400px] p-8 bg-slate-900/50 rounded-3xl border border-white/5 relative group">
                      <textarea 
                        value={activeItem.ocrText}
                        onChange={(e) => setQueue(prev => prev.map(i => i.id === activeItem.id ? { ...i, ocrText: e.target.value } : i))}
                        className="w-full h-full bg-transparent border-none outline-none resize-none text-slate-300 leading-relaxed font-medium text-sm custom-scrollbar placeholder:text-slate-700"
                        placeholder="O texto extraído aparecerá aqui..."
                      />
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="p-2 bg-slate-950/80 rounded-lg text-[8px] font-black text-slate-500 uppercase tracking-widest border border-white/5">Editável</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.05)_0%,_transparent_70%)]" />
             <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md space-y-8 z-10">
                <div className="w-24 h-24 bg-sky-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-12 border border-sky-500/20 shadow-2xl shadow-sky-500/10">
                   <FileSearch className="w-10 h-10 text-sky-400 -rotate-12" />
                </div>
                <div>
                   <h2 className="text-4xl font-black text-white tracking-tighter mb-3 leading-tight">Digitalize e Corrija <br/> de Forma Inteligente</h2>
                   <p className="text-slate-500 text-sm leading-relaxed font-medium">
                      Suba as redações dos seus alunos via imagem ou PDF. <br/>
                      Nossa IA extrai o texto, digitaliza parágrafos e avalia com <br/>
                      base na matriz oficial do ENEM.
                   </p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-10 py-4 bg-sky-500 text-slate-950 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-sky-400 transition-all flex items-center gap-3 shadow-xl shadow-sky-500/20"
                  >
                    <Upload className="w-4 h-4" />
                    Carregar Redações
                  </button>
                  <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Processamento Gemini 3.1 Pro + 3 Flash Ativo</p>
                </div>
             </motion.div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                 <Settings className="w-32 h-32 text-white" />
              </div>

              <div className="flex justify-between items-center mb-10 relative z-10">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <Settings className="w-5 h-5 text-sky-400" /> Configurações
                </h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-8 relative z-10">
                <div className="space-y-4">
                  <label className="block text-[10px] uppercase font-black text-slate-500 tracking-widest">Google AI (Gemini) API Key</label>
                  <div className="relative">
                    <input 
                      type="password"
                      placeholder="Cole sua chave aqui..."
                      className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-4 text-sm focus:border-sky-500/50 outline-none placeholder:text-slate-800"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                    />
                  </div>
                  <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-2xl">
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-4 font-medium">A chave é salva apenas neste navegador. Use sua própria cota para processamentos ilimitados.</p>
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[11px] font-black text-sky-400 flex items-center gap-2 hover:text-sky-300 transition-colors uppercase tracking-widest"
                    >
                      <ExternalLink className="w-3 h-3" /> Obter Chave Grátis
                    </a>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                         <Zap className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                         <p className="text-[11px] font-bold text-slate-200">Aceleração Ativada</p>
                         <p className="text-[9px] text-slate-500 font-medium">Gemini 3 Pro + LanguageTool</p>
                      </div>
                   </div>
                   <div className="w-12 h-6 bg-sky-500/20 rounded-full flex items-center px-1">
                      <div className="w-4 h-4 bg-sky-400 rounded-full shadow-lg" />
                   </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-4 bg-sky-500 text-slate-950 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/10"
                >
                  Salvar Preferências
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(14, 165, 233, 0.3); }
      `}</style>
    </div>
  );
}

function getCompLabel(key: string) {
  const labels: Record<string, string> = {
    c1: 'Domínio da Norma Culta',
    c2: 'Compreender a Proposta',
    c3: 'Projeto de Texto e Argumentação',
    c4: 'Coesão e Coerência',
    c5: 'Proposta de Intervenção'
  };
  return labels[key] || key;
}
