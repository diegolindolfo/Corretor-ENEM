
/**
 * Service to interact with the LanguageTool API for rapid grammar and spelling checks.
 */

export interface LanguageToolMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  context: {
    text: string;
    offset: number;
    length: number;
  };
  rule: {
    category: { name: string };
    description: string;
  };
}

export interface LanguageToolResult {
  matches: LanguageToolMatch[];
}

export async function checkGrammar(text: string): Promise<LanguageToolResult> {
  const params = new URLSearchParams();
  params.append('text', text);
  params.append('language', 'pt-BR');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error calling LanguageTool:', error);
    return { matches: [] };
  }
}
