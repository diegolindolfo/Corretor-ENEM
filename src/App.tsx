/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PenTool, 
  Send, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  GraduationCap, 
  ChevronRight,
  Target,
  Layers,
  Link as LinkIcon,
  ShieldCheck,
  RotateCcw,
  Image as ImageIcon,
  Trash2,
  Clock,
  Loader2,
  Settings,
  ExternalLink,
  Zap
} from 'lucide-react';
import { evaluateEssay, performOCR, EvaluationResult, setUserApiKey } from './services/geminiService';

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  text?: string;
  result?: EvaluationResult;
}

export default function App() {
  const [essay, setEssay] = useState('');
  const [theme, setTheme] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [usage, setUsage] = useState({ totalTokens: 0, requests: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('google_ai_key') || '');
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newItems: QueueItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      preview: URL.createObjectURL(file),
      status: 'waiting'
    }));

    setQueue(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const processBatch = async () => {
    if (!theme.trim()) {
      setError('Defina o tema antes de processar a fila.');
      return;
    }
    
    setIsProcessingQueue(true);
    setError(null);

    const itemsToProcess = queue.filter(item => item.status === 'waiting' || item.status === 'error');

    for (const item of itemsToProcess) {
      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));
      
      try {
        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(item.file);
        });
        const base64 = await base64Promise;

        // Step 1: OCR
        const ocrResult = await performOCR(base64);
        const extractedText = ocrResult.text;

        // Step 2: Evaluate
        const evaluation = await evaluateEssay(extractedText, theme);

        // Update Usage
        setUsage(prev => ({
          totalTokens: prev.totalTokens + (ocrResult.usage?.totalTokenCount || 0) + (evaluation.usage?.totalTokens || 0),
          requests: prev.requests + 2
        }));

        setQueue(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'completed', 
          text: extractedText, 
          result: evaluation 
        } : i));

        // Pequeno delay entre itens para evitar 429
        await new Promise(resolve => setTimeout(resolve, 3500));
      } catch (err) {
        console.error(err);
        setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
      }
    }

    setIsProcessingQueue(false);
  };

  const selectFromQueue = (item: QueueItem) => {
    if (item.text) setEssay(item.text);
    if (item.result) setResult(item.result);
  };

  const handleEvaluate = async () => {
    if (!essay.trim() || !theme.trim()) {
      setError('Por favor, preencha o tema e a redação.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await evaluateEssay(essay, theme);
      setResult(data);
      setUsage(prev => ({
        totalTokens: prev.totalTokens + (data.usage?.totalTokens || 0),
        requests: prev.requests + 1
      }));
    } catch (err) {
      console.error(err);
      setError('Ocorreu um erro ao avaliar a redação. Verifique a chave de API ou tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('google_ai_key', customApiKey);
    setUserApiKey(customApiKey || null);
  }, [customApiKey]);

  useEffect(() => {
    if (result && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result]);

  const reset = () => {
    setEssay('');
    setTheme('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 pb-20 selection:bg-sky-500/30">
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
              className="glass-card w-full max-w-md p-8 border-sky-500/20 shadow-2xl shadow-sky-500/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <Settings className="w-5 h-5 text-sky-400" />
                  Configurações
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition-colors">
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-2 tracking-widest">
                    Google AI (Gemini) API Key
                  </label>
                  <input 
                    type="password"
                    placeholder="Cole sua chave aqui..."
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-4 py-3 text-sm focus:border-sky-500/50 outline-none"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                  <div className="mt-4 p-4 bg-sky-500/5 border border-sky-500/10 rounded-xl">
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                      A chave é salva apenas no seu navegador. Use sua própria cota para processamentos em massa ilimitados.
                    </p>
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-sky-400 flex items-center gap-1.5 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Obter chave gratuita no Google AI Studio
                    </a>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <Zap className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-200">Aceleração Ativada</p>
                      <p className="text-[9px] text-slate-500">LanguageTool + Gemini 1.5 Flash (Latência Reduzida)</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-sky-500 text-slate-950 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-sky-400 transition-colors"
                >
                  Salvar e Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-sky-500 p-2 rounded-lg shadow-lg shadow-sky-500/20">
              <GraduationCap className="text-slate-950 w-6 h-6" />
            </div>
            <h1 className="text-xl font-light tracking-wide text-white">
              Corretor <span className="font-bold text-sky-400">Pro ENEM</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-4 px-4 py-1.5 bg-slate-900 rounded-full border border-white/5">
              <div className="flex flex-col items-end">
                <span className="text-[7px] uppercase font-black text-slate-600">IA Tokens</span>
                <span className="text-[10px] font-mono text-sky-400">{usage.totalTokens.toLocaleString()}</span>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex flex-col items-end">
                <span className="text-[7px] uppercase font-black text-slate-600">Requisições</span>
                <span className="text-[10px] font-mono text-sky-400">{usage.requests}</span>
              </div>
            </div>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-500 hover:text-sky-400 hover:bg-sky-400/5 rounded-lg transition-all"
              title="Configurações"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button 
              onClick={reset}
              className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-sky-400 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 pt-6 md:pt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Editor Side */}
        <section className="col-span-1 lg:col-span-12 xl:col-span-7 flex flex-col gap-6 order-2 lg:order-1">
          {/* Bulk Upload Area */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="section-title">Fila de Digitalização (OCR em Massa)</div>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/5 rounded-xl p-8 flex flex-col items-center justify-center gap-4 bg-slate-900/40 hover:bg-slate-900/60 hover:border-sky-500/30 transition-all cursor-pointer group"
            >
              <div className="bg-slate-900 p-4 rounded-full border border-white/5 group-hover:text-sky-400 transition-colors">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">Arraste as fotos das redações ou clique para enviar</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">Suporta múltiplos envios simultâneos</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                multiple 
                accept="image/*" 
                className="hidden" 
              />
            </div>

            {queue.length > 0 && (
              <div className="space-y-3 mt-2">
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                  <AnimatePresence initial={false}>
                    {queue.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                          item.status === 'completed' 
                            ? 'bg-emerald-500/5 border-emerald-500/10' 
                            : item.status === 'processing'
                            ? 'bg-sky-500/5 border-sky-500/20'
                            : 'bg-slate-900/80 border-white/5'
                        }`}
                      >
                        <img 
                          src={item.preview} 
                          alt="Redação" 
                          className="w-12 h-16 object-cover rounded-md border border-white/10"
                        />
                        <div className="flex-grow min-w-0">
                          <p className="text-[10px] font-bold text-slate-300 truncate">{item.file.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.status === 'waiting' && <span className="flex items-center gap-1 text-[9px] text-slate-500 font-bold uppercase"><Clock className="w-2.5 h-2.5" /> Na fila</span>}
                            {item.status === 'processing' && <span className="flex items-center gap-1 text-[9px] text-sky-400 font-bold uppercase animate-pulse"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Transcrevendo...</span>}
                            {item.status === 'completed' && <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold uppercase"><CheckCircle2 className="w-2.5 h-2.5" /> Processado - {item.result?.redacao_eval.sugestao_nota} pts</span>}
                            {item.status === 'error' && <span className="flex items-center gap-1 text-[9px] text-red-400 font-bold uppercase"><AlertCircle className="w-2.5 h-2.5" /> Erro no OCR</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === 'completed' && (
                            <button 
                              onClick={() => selectFromQueue(item)}
                              className="p-2 text-sky-400 hover:bg-sky-400/10 rounded-lg transition-colors"
                              title="Visualizar análise"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          )}
                          <button 
                            onClick={() => removeFromQueue(item.id)}
                            className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                
                <button
                  onClick={processBatch}
                  disabled={isProcessingQueue || queue.every(i => i.status === 'completed')}
                  className={`w-full py-3 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                    isProcessingQueue || queue.every(i => i.status === 'completed')
                      ? 'bg-slate-800 text-slate-600'
                      : 'bg-sky-500 text-slate-950 hover:bg-sky-400 shadow-lg shadow-sky-500/10'
                  }`}
                >
                  {isProcessingQueue ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando Fila...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Iniciar Processamento em Massa
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="glass-card p-6 md:p-8 flex flex-col gap-6">
            <div className="section-title">Parâmetros de Entrada</div>
            <div>
              <label htmlFor="theme" className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">
                Tema da Redação
              </label>
              <input
                id="theme"
                type="text"
                placeholder="Ex: Os desafios para a valorização de comunidades tradicionais no Brasil"
                className="w-full bg-slate-900/50 border border-white/5 rounded-lg px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all font-light text-sm sm:text-base"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
            </div>

            <div className="flex-grow">
              <label htmlFor="essay" className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">
                Manuscrito Digital
              </label>
              <textarea
                id="essay"
                placeholder="Insira seu texto aqui (mínimo de 8 linhas)..."
                className="w-full bg-slate-900/50 border border-white/5 rounded-lg px-4 py-4 text-slate-300 placeholder:text-slate-700 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all min-h-[500px] leading-relaxed resize-none font-mono text-sm sm:text-base"
                value={essay}
                onChange={(e) => setEssay(e.target.value)}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-white/5">
              <div className="flex gap-8 w-full sm:w-auto justify-center sm:justify-start">
                <div className="flex flex-col items-center sm:items-start">
                  <span className="text-[8px] uppercase tracking-tighter text-slate-600 font-black">Palavras</span>
                  <p className="text-sm font-mono text-slate-400">{essay.split(/\s+/).filter(w => w).length}</p>
                </div>
                <div className="flex flex-col items-center sm:items-start">
                  <span className="text-[8px] uppercase tracking-tighter text-slate-600 font-black">Caracteres</span>
                  <p className="text-sm font-mono text-slate-400">{essay.length}</p>
                </div>
              </div>
              <button
                id="evaluate-button"
                onClick={handleEvaluate}
                disabled={loading}
                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-3.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all transform active:scale-95 ${
                  loading 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-sky-500 text-slate-950 hover:bg-sky-400 shadow-xl shadow-sky-500/20'
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Processando
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Avaliar Agora
                  </>
                )}
              </button>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-3 text-[11px] font-medium"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </div>
        </section>

        {/* Results Sidebar / Content */}
        <section className="col-span-1 lg:col-span-12 xl:col-span-5 order-1 lg:order-2" ref={resultsRef}>
          <AnimatePresence mode="wait">
            {!result && !loading && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card p-8 md:p-12 flex flex-col items-center text-center gap-8 lg:sticky lg:top-24"
              >
                <div className="bg-slate-900 p-6 rounded-full border border-white/5 text-sky-400 shadow-inner">
                  <PenTool className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="font-light text-white text-xl md:text-2xl">Pronto para a Revisão?</h3>
                  <p className="text-xs md:text-sm text-slate-500 mt-3 leading-relaxed max-w-xs mx-auto">
                    Nossa modelagem semântica valida seu texto conforme as diretrizes 2025: Norma culta, repertório, projeto de texto e intervenção.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-slate-900/80 border border-white/5 p-4 rounded-xl flex flex-col gap-2 items-center">
                    <span className="text-sky-400 text-sm font-bold">LEGITIMADO</span>
                    <span className="text-[10px] text-slate-600 uppercase font-black">Repertório</span>
                  </div>
                  <div className="bg-slate-900/80 border border-white/5 p-4 rounded-xl flex flex-col gap-2 items-center">
                    <span className="text-sky-400 text-sm font-bold">5 PILARES</span>
                    <span className="text-[10px] text-slate-600 uppercase font-black">Intervenção</span>
                  </div>
                </div>
                <div className="section-title w-full mt-4">Diretrizes v2025</div>
              </motion.div>
            )}

            {loading && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card p-12 flex flex-col items-center gap-10 lg:sticky lg:top-24"
              >
                <div className="relative">
                  <div className="w-28 h-28 border-[3px] border-slate-800 border-t-sky-500 rounded-full animate-spin" />
                  <FileText className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-700 w-10 h-10" />
                </div>
                <div className="text-center">
                  <h3 className="font-light text-2xl text-white">Análise em Curso</h3>
                  <p className="text-[10px] text-slate-500 mt-3 uppercase tracking-[0.3em] font-black">Certificando Heurísticas</p>
                </div>
                <div className="w-full space-y-5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-1 bg-slate-900 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                        className="w-1/2 h-full bg-sky-500/50"
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {result && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 lg:pb-32"
              >
                {/* Score Card (Professional View) */}
                <div className="glass-card shadow-2xl shadow-sky-500/5 overflow-hidden lg:sticky lg:top-24 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
                  <div className="p-6 md:p-8 border-b border-white/5">
                    <div className="flex justify-between items-start mb-8 gap-4">
                      <div>
                        <div className="section-title !mb-3">Score do Revisor</div>
                        <h2 className="text-6xl md:text-8xl font-light text-white tracking-tighter">
                          {result.redacao_eval.sugestao_nota}
                        </h2>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className={`status-pill ${result.redacao_eval.triagem.status === 'anulada' ? 'pill-red' : 'pill-blue'}`}>
                          {result.redacao_eval.triagem.status === 'anulada' ? 'ANULADA' : 'VALIDADA'}
                        </div>
                        {result.redacao_eval.triagem.flags.map((flag, i) => (
                          <span key={i} className="text-[8px] font-black text-red-500 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 uppercase tracking-tighter text-center">
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-slate-900/40 p-5 rounded-xl border border-white/5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <Target className="w-3.5 h-3.5 text-sky-500" />
                          Estrutura Identificada
                        </h4>
                        <div className="mb-4">
                          <span className="text-[7px] uppercase font-bold text-slate-600 block mb-1 tracking-widest">Tese Central</span>
                          <p className="text-xs text-slate-300 font-medium leading-relaxed italic">"{result.redacao_eval.analise_tecnica.tese_identificada}"</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.redacao_eval.analise_tecnica.argumentos_chave.map((arg, i) => (
                            <div key={i} className="flex flex-col bg-slate-950/80 p-2 px-3 rounded-lg border border-white/5 gap-0.5">
                              <span className="text-[6px] text-sky-500/60 font-black uppercase">ARG_{i+1}</span>
                              <span className="text-[10px] text-slate-400 font-medium leading-tight">{arg}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-900/40 p-5 rounded-xl border border-white/5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
                          Auditoria de Fatos
                        </h4>
                        <div className="space-y-4">
                          {result.redacao_eval.analise_tecnica.verificacao_repertorio.map((rep, i) => (
                            <div key={i} className="flex gap-4 items-start border-l-2 border-slate-800/50 pl-4 py-1">
                              <div className="flex-grow min-w-0">
                                <div className="flex items-center justify-between mb-1 gap-2">
                                  <span className="text-[11px] font-bold text-slate-300 truncate">{rep.item}</span>
                                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest shrink-0 ${
                                    rep.status === 'legitimado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                    rep.status === 'duvidoso' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {rep.status.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-snug">{rep.analise}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4 border-t border-white/5 mt-8 pt-8">
                      <CompetencyRow label="C1: Norma Culta" score={result.redacao_eval.competencias.c1.score} icon={<Layers className="w-3.5 h-3.5" />} />
                      <CompetencyRow label="C2: Repertório" score={result.redacao_eval.competencias.c2.score} icon={<FileText className="w-3.5 h-3.5" />} />
                      <CompetencyRow label="C3: Projeto" score={result.redacao_eval.competencias.c3.score} icon={<Target className="w-3.5 h-3.5" />} />
                      <CompetencyRow label="C4: Coesão" score={result.redacao_eval.competencias.c4.score} icon={<LinkIcon className="w-3.5 h-3.5" />} />
                      <CompetencyRow label="C5: Intervenção" score={result.redacao_eval.competencias.c5.score} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-8 border-t border-white/5">
                    <div className="section-title !mb-4">Parecer Técnico Global</div>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed italic border-l-2 border-sky-500/40 pl-5 bg-sky-500/5 py-4 rounded-r-xl">
                      "{result.redacao_eval.parecer_tecnico}"
                    </p>
                  </div>
                </div>

                <div className="section-title mt-12 mb-4">Detalhamento por Critério</div>

                {/* Detailed Feedback Sections */}
                <div className="space-y-4">
                  {Object.entries(result.redacao_eval.competencias).map(([key, comp]: [string, any]) => (
                    <motion.div 
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="glass-card p-6 md:p-8"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                        <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{getCompLabel(key)}</h4>
                        <div className={`status-pill self-start sm:self-center ${comp.score >= 160 ? 'pill-green' : comp.score >= 120 ? 'pill-blue' : 'pill-red'}`}>
                          NÍVEL {comp.nivel} // {comp.score} PTS
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-6">
                        {comp.comentario}
                      </p>
                      
                      {key === 'c1' && comp.destaques?.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/5">
                          <div className="flex flex-wrap gap-1.5 flex-grow">
                            {comp.destaques.map((d: string, i: number) => (
                              <span key={i} className="text-[9px] font-mono bg-slate-900/50 text-slate-500 border border-white/5 px-2 py-0.5 rounded">
                                {d}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                             <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Ocorrências</span>
                             <span className="text-[10px] font-bold text-sky-400">{comp.desvios_count} desvios</span>
                          </div>
                        </div>
                      )}

                      {key === 'c5' && (
                        <div className="pt-6 border-t border-white/5 grid grid-cols-5 gap-2 sm:gap-4 lg:gap-2 xl:gap-4">
                          {Object.entries(comp.elementos).map(([el, present]: [string, any]) => (
                            <div key={el} className="flex flex-col items-center gap-2 group cursor-help transition-all">
                              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg border-2 flex items-center justify-center transition-all ${
                                present 
                                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.1)]' 
                                  : 'bg-slate-950 border-white/5 text-slate-800'
                              }`}>
                                {present ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                              </div>
                              <span className="text-[7px] sm:text-[8px] uppercase font-black text-slate-600 tracking-tighter text-center leading-none">{el}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="max-w-5xl mx-auto px-4 mt-20 pt-10 border-t border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] uppercase tracking-[0.2em] font-medium text-slate-600">
          <p>© 2026 Semantic Evaluator // Stable.v1</p>
          <div className="flex gap-8">
            <span className="hover:text-sky-500 cursor-help transition-colors">KB:M2-M7</span>
            <span className="hover:text-sky-500 cursor-help transition-colors">ETHICS_FILTER:ON</span>
            <span className="hover:text-sky-500 cursor-help transition-colors">DOCS:2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CompetencyRow({ label, score, icon, warning }: { label: string, score: number, icon: React.ReactNode, warning?: boolean }) {
  const percentage = (score / 200) * 100;
  
  return (
    <div className="group">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="text-slate-500 group-hover:text-sky-400 transition-colors">
            {icon}
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-200 transition-colors flex items-center gap-2">
            {label}
            {warning && (
              <span className="status-pill pill-red !py-0 !px-1">!</span>
            )}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{score}</span>
      </div>
      <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            score >= 160 ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]' : score >= 120 ? 'bg-sky-500/40' : 'bg-slate-700'
          }`}
        />
      </div>
    </div>
  );
}

function getCompLabel(key: string) {
  const labels: Record<string, string> = {
    c1: 'C1: Domínio da Norma Culta',
    c2: 'C2: Compreender o Tema',
    c3: 'C3: Projeto de Texto',
    c4: 'C4: Coesão Linguística',
    c5: 'C5: Proposta de Intervenção'
  };
  return labels[key] || key;
}
