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
5. Analise a COMPETÊNCIA 5: Verifique rigorosamente os 5 elementos (Agente, Ação, Meio/Modo, Efeito e Detalhamento).

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
    "grade_total": number,
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
    grade_total: number;
    parecer_tecnico: string;
  };
}

let genAI: GoogleGenAI | null = null;
let userApiKey: string | null = null;

export function setUserApiKey(key: string | null) {
  userApiKey = key;
  genAI = null;
}

export function getGenAI() {
  if (!genAI) {
    const apiKey = userApiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : null);
    if (!apiKey) {
      throw new Error("API Key ausente. Configure sua chave Google AI nas configurações.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

async function withRetry<T>(
  fn: (modelName: string) => Promise<T>, 
  retries = 3, 
  originalModel = "gemini-2.0-flash"
): Promise<T> {
  const currentModel = retries < 3 ? "gemini-1.5-flash" : originalModel;
  
  try {
    return await fn(currentModel);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const isRateLimit = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
    const isNotFound = errorMessage.includes("404") || errorMessage.includes("NOT_FOUND");

    if ((isRateLimit || isNotFound) && retries > 0) {
      const waitTime = isNotFound ? 500 : (4 - retries) * 2000;
      await new Promise(r => setTimeout(r, waitTime));
      return withRetry(fn, retries - 1, originalModel);
    }
    throw error;
  }
}

export async function performOCR(base64Data: string, mimeType: string = "image/jpeg"): Promise<{ text: string, usage?: any }> {
  return withRetry(async (modelName) => {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: modelName });
    const dataOnly = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    const result = await model.generateContent([
      {
        inlineData: {
          data: dataOnly,
          mimeType: mimeType
        }
      },
      "Aja como um OCR de alta precisão. Extraia APENAS o texto livre escrito à mão ou impresso nesta redação. Preserve os parágrafos. Não inclua comentários."
    ]);

    const response = await result.response;
    return { 
      text: response.text(),
      usage: {
        totalTokens: response.usageMetadata?.totalTokenCount || 0
      }
    };
  }, 3, "gemini-2.0-flash");
}

export async function evaluateEssay(essay: string, theme: string): Promise<EvaluationResult> {
  const grammarPromise = checkGrammar(essay);

  const evaluation = await withRetry(async (modelName) => {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ 
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const result = await model.generateContent(`Tema do ENEM: ${theme}\n\nManuscrito da Redação:\n${essay}`);
    const response = await result.response;
    const text = response.text();
    
    if (!text) throw new Error("Resposta vazia da IA");
    
    const evalResult = JSON.parse(text) as EvaluationResult;
    evalResult.usage = {
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0
    };
    
    return evalResult;
  }, 3, "gemini-1.5-pro");

  try {
    const ltResults = await grammarPromise;
    if (ltResults.matches.length > 0) {
      evaluation.redacao_eval.competencias.c1.desvios_count += ltResults.matches.length;
      ltResults.matches.slice(0, 8).forEach(match => {
        const item = `[Sugestão] ${match.message}`;
        if (!evaluation.redacao_eval.competencias.c1.destaques.includes(item)) {
          evaluation.redacao_eval.competencias.c1.destaques.push(item);
        }
      });
    }
  } catch (e) {
    console.warn("LanguageTool ignorado", e);
  }

  return evaluation;
}

