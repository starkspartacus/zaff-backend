import { GeminiClient, AiUnavailable, AiQuotaExceeded } from './gemini.client';

const config = (model?: string, extra: Record<string, unknown> = {}) =>
  ({ get: (k: string) => ({ 'ai.geminiApiKey': 'cle-de-test-suffisamment-longue', 'ai.geminiModel': model ?? null, 'ai.geminiRpm': 1000, ...extra } as Record<string, unknown>)[k] }) as any;
const ok = (text = 'ok') => reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
const quota = (secs: number, perDay = false) =>
  reply(429, {
    error: {
      message: 'Resource has been exhausted',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: perDay ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: `${secs}s` },
      ],
    },
  });
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
    const gen = calls.find(([u]) => u.includes(':generateContent'))!;
    expect(gen[0]).toMatch(/models\/gemini-3\.8-flash:generateContent$/);
    expect(calls.every(([u]) => !u.includes('cle-de-test'))).toBe(true);
    expect((gen[1].headers as Record<string, string>)['x-goog-api-key']).toBe('cle-de-test-suffisamment-longue');
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

  it('quota par minute atteint : passe tout de suite au modèle Gemini suivant (quota séparé)', async () => {
    const urls: string[] = [];
    global.fetch = (async (url: string) => (urls.push(url), url.includes('gemini-a:') ? quota(40) : ok('depuis b'))) as any;
    const c = new GeminiClient(config('gemini-a', { 'ai.geminiFallbackModels': ['gemini-b'] }));
    expect((await c.generate({ parts: [{ text: 'x' }], search: true })).text).toBe('depuis b');
    await c.generate({ parts: [{ text: 'y' }] });
    expect(urls.filter((u) => u.includes('gemini-a:'))).toHaveLength(1); // en pause pendant 40 s, plus sollicité
    expect(c.describe()[0].coolingUntil).toBeInstanceOf(Date);
  });

  it('modèles Gemini supplémentaires découverts sur la clé', async () => {
    global.fetch = (async (url: string) =>
      url.endsWith('/models?pageSize=200')
        ? reply(200, { models: ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-pro', 'gemini-3.8-flash-preview-tts', 'text-embedding-9'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: n.includes('embedding') ? ['embedContent'] : ['generateContent'] })) })
        : url.includes('gemini-3.8-flash:') ? quota(30) : ok(url.match(/models\/([^:]+):/)![1])) as any;
    const c = new GeminiClient(config());
    expect((await c.generate({ parts: [{ text: 'x' }] })).text).toBe('gemini-3.8-flash-lite');
    expect(c.describe().map((p) => p.label)).toEqual(['Gemini gemini-3.8-flash', 'Gemini gemini-3.8-flash-lite', 'Gemini gemini-3.5-flash']);
  });

  it('IA de secours (format OpenAI) pour la vérification ; jamais pour la recherche Google', async () => {
    const calls: Array<[string, any]> = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('generativelanguage')) return quota(3600, true);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: '{"images":[]}' } }] }) } as unknown as Response;
    }) as any;
    const c = new GeminiClient(config('gemini-a', { 'ai.fallback': { url: 'https://api.groq.com/openai/v1', key: 'gsk_test_cle', model: 'vision-libre', rpm: 1000 } }));
    const img = { image: Buffer.from('abc'), mime: 'image/jpeg' };
    expect((await c.generate({ parts: [{ text: 'note' }, img], schema: { type: 'OBJECT' } })).text).toBe('{"images":[]}');
    const [url, init] = calls.find(([u]) => u.includes('groq'))!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'vision-libre', response_format: { type: 'json_object' } });
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(init.headers.Authorization).toBe('Bearer gsk_test_cle');
    // La recherche, elle, n'a que Gemini (quota du jour atteint) : pause demandée
    await expect(c.generate({ parts: [{ text: 'cherche' }], search: true })).rejects.toBeInstanceOf(AiQuotaExceeded);
  });

  it('tout est épuisé pour longtemps : AiQuotaExceeded avec l\'heure de reprise (pas d\'attente bloquante)', async () => {
    global.fetch = (async () => quota(600)) as any;
    const c = new GeminiClient(config('gemini-a', { 'ai.geminiFallbackModels': ['gemini-b'] }));
    const t = Date.now();
    const err: AiQuotaExceeded = await c.generate({ parts: [{ text: 'x' }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiQuotaExceeded);
    expect(err.resumeAt.getTime()).toBeGreaterThan(t + 590_000);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
