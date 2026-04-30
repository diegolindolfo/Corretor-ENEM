import { GoogleGenAI } from "@google/genai";
import { checkGrammar } from './languageToolService';

const SYSTEM_PROMPT = `
Você é uma ferramenta de APOIO AO CORRETOR HUMANO de redações do ENEM.
Sua função não é apenas dar a nota, mas extrair informações cruciais e verificar fatos para facilitar a revisão humana.

DIRETRIZES DE EXTRAÇÃO:
1. Analise a TESE e os ARGUMENTOS (D1/D2) e resuma-os de forma técnica.
2. Verifique o REPERTÓRIO: Identifique se as citações/dados são reais e se possuem fonte legitimada. Marque como "duvidoso" se a informação parecer inventada ou mal aplicada.
3. Analise a COMPETÊNCIA 1: Identifique a gravidade dos desvios e liste exemplos encontrados.
4. Analise a COMPETÊNCIA 4: Identifique se há pelo menos 2 operadores interparágrafos.
5. Analise a COMPETÊNCIA 5: Verifique rigorosamente os 5 elementos.

SAÍDA OBRIGATÓRIA (JSON):
{
  "redacao_eval": {
    "triagem": {
      "status": "valida | anulada",
      "motivo_anulacao": "null | FEA | Copia | Fuga | Tipo | PD",
      "linhas_autorais": number,
      "flags": ["string"]
    },
    "analise_tecnica": {
      "tese_identificada": "string",
      "argumentos_chave": ["string"],
      "verificacao_repertorio": [
        { "item": "string", "status": "legitimado | duvidoso | nao_legitimado", "analise": "string" }
      ]
    },
    "competencias": {
      "c1": { "score": number, "nivel": number, "desvios_count": number, "destaques": ["string"], "comentario": "string" },
      "c2": { "score": number, "nivel": number, "repertorio_status": "string", "comentario": "string" },
      "c3": { "score": number, "nivel": number, "projeto_status": "string", "comentario": "string" },
      "c4": { "score": number, "nivel": number, "operadores_inter": number, "comentario": "string" },
      "c5": { "score": number, "nivel": number, "elementos": { "agente": boolean, "acao": boolean, "meio": boolean, "efeito": boolean, "detalhamento": boolean }, "comentario": "string" }
    },
    "sugestao_nota": number,
    "parecer_tecnico": "Resumo técnico para o corretor humano tomar a decisão final."
  }
}
`;

export interface EvaluationResult {
  usage?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
  redacao_eval: {
    triagem: {
      status: "valida" | "anulada";
      motivo_anulacao: string | null;
      linhas_autorais: number;
      flags: string[];
    };
    analise_tecnica: {
      tese_identificada: string;
      argumentos_chave: string[];
      verificacao_repertorio: {
        item: string;
        status: "legitimado" | "duvidoso" | "nao_legitimado";
        analise: string;
      }[];
    };
    competencias: {
      c1: { score: number; nivel: number; desvios_count: number; destaques: string[]; comentario: string };
      c2: { score: number; nivel: number; repertorio_status: string; comentario: string };
      c3: { score: number; nivel: number; projeto_status: string; comentario: string };
      c4: { score: number; nivel: number; operadores_inter: number; comentario: string };
      c5: { score: number; nivel: number; elementos: { agente: boolean; acao: boolean; meio: boolean; efeito: boolean; detalhamento: boolean }; comentario: string };
    };
    sugestao_nota: number;
    parecer_tecnico: string;
  };
}

let ai: GoogleGenAI | null = null;
let userApiKey: string | null = null;

export function setUserApiKey(key: string | null) {
  userApiKey = key;
  ai = null; // Reset singleton when key changes
}

export function getGenAI() {
  if (!ai) {
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Configuração Necessária: Insira sua Chave de API Google nas configurações.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export async function performOCR(base64Image: string): Promise<{ text: string, usage?: any }> {
  // OCR prioritiza latência com Gemini 1.5 Flash
  return withRetry(async (modelName) => {
    const ai = getGenAI();

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1] || base64Image,
              mimeType: "image/jpeg"
            }
          },
          { text: "Transcreva fielmente todo o texto desta redação manuscrita. Não adicione comentários, apenas o texto da redação." }
        ]
      }
    });

    return { 
      text: response.text || "",
      usage: response.usageMetadata
    };
  });
}

/**
 * Utilitário para retentar funções assíncronas em caso de erro 429 (Resource Exhausted) ou Sobrecarga.
 */
async function withRetry<T>(
  fn: (modelName: string) => Promise<T>, 
  retries = 8, 
  delay = 4000,
  originalModel = "gemini-1.5-flash"
): Promise<T> {
  // Se o modelo original for 2.0 e obtivemos erro de "não encontrado", 
  // ou se já excedemos metade das tentativas, usamos o 1.5-flash que é mais estável.
  const currentModel = retries <= 4 ? "gemini-1.5-flash" : originalModel;
  
  try {
    return await fn(currentModel);
  } catch (error: any) {
    const errorCode = error?.status || error?.error?.code || error?.code;
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    
    // 404: Modelo não encontrado ou sem acesso
    const isNotFound = errorCode === 404 || errorMessage?.includes("404") || errorMessage?.includes("NOT_FOUND");
    
    const isRateLimit = errorCode === 429 || 
                       errorMessage?.includes("429") || 
                       errorMessage?.includes("RESOURCE_EXHAUSTED") ||
                       errorMessage?.includes("high demand") ||
                       errorMessage?.includes("overloaded");
    
    if (isNotFound && originalModel !== "gemini-1.5-flash") {
      console.warn(`Modelo ${originalModel} não encontrado. Tentando gemini-1.5-flash...`);
      return withRetry(fn, retries, delay, "gemini-1.5-flash");
    }

    if (isRateLimit && retries > 0) {
      const jitter = Math.random() * 2000;
      const totalDelay = delay + jitter;
      
      console.warn(`[Retry ${8 - retries + 1}] Erro de capacidade (${currentModel}). Retentando em ${Math.round(totalDelay)}ms. Erro: ${errorMessage}`);
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      // Backoff exponencial: aumenta o delay para a próxima tentativa
      return withRetry(fn, retries - 1, delay * 1.5, originalModel);
    }
    throw error;
  }
}

export async function evaluateEssay(essay: string, theme: string): Promise<EvaluationResult> {
  // Inicia verificação gramatical em paralelo para otimizar processamento
  const grammarPromise = checkGrammar(essay);

  const evaluation = await withRetry(async (modelName) => {
    const ai = getGenAI();

    const prompt = `
Tema: ${theme}
Redação para avaliação:
${essay}
  `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Resposta vazia da IA.");
    }
    
    const result = JSON.parse(text) as EvaluationResult;
    result.usage = {
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0
    };
    
    return result;
  });

  // Integra resultados do LanguageTool à análise da C1
  try {
    const ltResults = await grammarPromise;
    if (ltResults.matches.length > 0) {
      evaluation.redacao_eval.competencias.c1.desvios_count += ltResults.matches.length;
      ltResults.matches.slice(0, 8).forEach(match => {
        if (!evaluation.redacao_eval.competencias.c1.destaques.includes(match.message)) {
          evaluation.redacao_eval.competencias.c1.destaques.push(`[LT] ${match.message}`);
        }
      });
    }
  } catch (e) {
    console.warn("LanguageTool falhou, prosseguindo apenas com IA", e);
  }

  return evaluation;
}
