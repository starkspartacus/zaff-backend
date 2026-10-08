import { GeminiClient, AiUnavailable } from './gemini.client';

const config = (model?: string) => ({ get: (k: string) => ({ 'ai.geminiApiKey': 'cle-de-test-suffisamment-longue', 'ai.geminiModel': model ?? null } as Record<string, unknown>)[k] }) as any;
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
const RETIRED = 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.';

describe('Client Gemini', () => {
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('modèle par défaut récent ; clé en en-tête, jamais dans l\'adresse', async () => {
    const calls: Array<[string, RequestInit]> = [];
    global.fetch = (async (url: string, init: RequestInit) => (calls.push([url, init]), reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }))) as any;
    const c = new GeminiClient(config());
    expect(c.model).toBe('gemini-3.8-flash');
    expect((await c.generate({ parts: [{ text: 'x' }] })).text).toBe('ok');
    expect(calls[0][0]).toMatch(/models\/gemini-3\.8-flash:generateContent$/);
    expect(calls[0][0]).not.toContain('cle-de-test');
    expect((calls[0][1].headers as Record<string, string>)['x-goog-api-key']).toBe('cle-de-test-suffisamment-longue');
  });

  it('modèle retiré par Google : bascule sur le modèle conseillé dans la réponse, puis continue', async () => {
    const urls: string[] = [];
    global.fetch = (async (url: string) => {
      urls.push(url);
      return url.includes('gemini-2.5-flash') ? reply(404, { error: { message: RETIRED } }) : reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    }) as any;
    const c = new GeminiClient(config('gemini-2.5-flash'));
    expect((await c.generate({ parts: [{ text: 'x' }] })).text).toBe('ok');
    expect(c.model).toBe('gemini-3.8-flash');
    await c.generate({ parts: [{ text: 'y' }] });
    expect(urls.filter((u) => u.includes('2.5'))).toHaveLength(1); // plus jamais l'ancien modèle
  });

  it('modèle indisponible sans remplaçant : erreur claire qui arrête le lot', async () => {
    global.fetch = (async () => reply(404, { error: { message: 'models/foo is not found for API version v1beta' } })) as any;
    await expect(new GeminiClient(config('foo')).generate({ parts: [{ text: 'x' }] })).rejects.toBeInstanceOf(AiUnavailable);
  });
});
