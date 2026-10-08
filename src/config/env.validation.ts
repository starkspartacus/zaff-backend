/**
 * Validation des variables d'environnement au démarrage.
 * Aucun secret n'est écrit dans le code : MONGODB_URI et JWT_SECRET viennent de l'environnement
 * (fichier .env local, ignoré par git, ou variables du serveur en production).
 */
export interface EnvVars {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  GLOBAL_DATABASE_NAME: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  /** Notifications push (facultatif : sans ces clés, le push est simplement désactivé) */
  VAPID_PUBLIC_KEY: string | null;
  VAPID_PRIVATE_KEY: string | null;
  VAPID_SUBJECT: string;
  /** Stockage des photos / vidéos sur UploadThing (facultatif : sans jeton, stockage dans MongoDB) */
  UPLOADTHING_TOKEN: string | null;
  /** Administrateur de la plateforme ZAFF (catalogue global, photos) : facultatif, sans eux l'espace admin est fermé */
  PLATFORM_ADMIN_EMAIL: string | null;
  /** Mot de passe en clair ou empreinte bcrypt ($2…) */
  PLATFORM_ADMIN_PASSWORD: string | null;
  /** Recherche des photos d'appareils par l'IA (Google Gemini) : facultatif, sans clé l'outil est désactivé */
  GEMINI_API_KEY: string | null;
  GEMINI_MODEL: string;
  /** Autres modèles Gemini à essayer quand le quota du premier est atteint (en plus de ceux découverts) */
  GEMINI_FALLBACK_MODELS: string[];
  /** Requêtes par minute par modèle (palier gratuit : petit nombre) */
  GEMINI_RPM: number;
  /** IA de secours au format OpenAI (Groq, OpenRouter…) pour vérifier les photos : facultative */
  AI_FALLBACK_URL: string | null;
  AI_FALLBACK_KEY: string | null;
  AI_FALLBACK_MODEL: string | null;
  AI_FALLBACK_RPM: number;
}

const MIN_SECRET_LENGTH = 32;
/** Modèle Gemini par défaut (les anciens modèles sont retirés par Google au fil du temps : GEMINI_MODEL pour en changer) */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const get = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');
  const errors: string[] = [];
  const nodeEnv = get('NODE_ENV') || 'development';

  const mongoUri = get('MONGODB_URI');
  if (!mongoUri) errors.push('MONGODB_URI est manquant (URI du cluster MongoDB, sans nom de base).');
  else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) errors.push('MONGODB_URI doit commencer par mongodb:// ou mongodb+srv://');

  const jwtSecret = get('JWT_SECRET');
  if (!jwtSecret) errors.push('JWT_SECRET est manquant (clé de signature des sessions).');
  else if (nodeEnv === 'production' && jwtSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_SECRET doit faire au moins ${MIN_SECRET_LENGTH} caractères en production.`);
  }

  const vapidPublic = get('VAPID_PUBLIC_KEY');
  const vapidPrivate = get('VAPID_PRIVATE_KEY');
  if (!!vapidPublic !== !!vapidPrivate) {
    errors.push('VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY vont ensemble (générer : npm run vapid:generate).');
  }
  const vapidSubject = get('VAPID_SUBJECT') || 'mailto:contact@zaff.app';
  if (vapidPublic && !/^(mailto:|https:\/\/)/.test(vapidSubject)) errors.push('VAPID_SUBJECT doit être un mailto: ou une URL https://');

  const uploadthingToken = get('UPLOADTHING_TOKEN');
  if (uploadthingToken && uploadthingToken.length < 20) errors.push('UPLOADTHING_TOKEN semble incomplet (Dashboard UploadThing > API Keys > V7).');

  const adminEmail = get('PLATFORM_ADMIN_EMAIL').toLowerCase();
  const adminPassword = get('PLATFORM_ADMIN_PASSWORD');
  if (!!adminEmail !== !!adminPassword) errors.push('PLATFORM_ADMIN_EMAIL et PLATFORM_ADMIN_PASSWORD vont ensemble (espace administrateur).');
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) errors.push('PLATFORM_ADMIN_EMAIL doit être une adresse e-mail.');
  if (adminPassword && !adminPassword.startsWith('$2') && nodeEnv === 'production' && adminPassword.length < 12) {
    errors.push('PLATFORM_ADMIN_PASSWORD doit faire au moins 12 caractères en production (ou être une empreinte bcrypt).');
  }

  const geminiKey = get('GEMINI_API_KEY');
  if (geminiKey && geminiKey.length < 20) errors.push('GEMINI_API_KEY semble incomplète (Google AI Studio > Get API key).');
  const geminiModel = get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  if (!/^[a-z0-9.-]{3,60}$/.test(geminiModel)) errors.push('GEMINI_MODEL invalide (ex. : gemini-3.8-flash).');

  const geminiFallbacks = get('GEMINI_FALLBACK_MODELS').split(',').map((m) => m.trim()).filter(Boolean);
  if (geminiFallbacks.some((m) => !/^[a-z0-9.-]{3,60}$/.test(m))) errors.push('GEMINI_FALLBACK_MODELS : noms de modèles séparés par des virgules.');
  const geminiRpm = Number(get('GEMINI_RPM') || 8);
  if (!Number.isInteger(geminiRpm) || geminiRpm < 1 || geminiRpm > 1000) errors.push('GEMINI_RPM doit être un nombre entier entre 1 et 1000.');
  const fbUrl = get('AI_FALLBACK_URL').replace(/\/+$/, '');
  const fbKey = get('AI_FALLBACK_KEY');
  const fbModel = get('AI_FALLBACK_MODEL');
  if ((fbUrl || fbKey || fbModel) && !(fbUrl && fbKey && fbModel)) errors.push('AI_FALLBACK_URL, AI_FALLBACK_KEY et AI_FALLBACK_MODEL vont ensemble (IA de secours).');
  if (fbUrl && !/^https:\/\/[^\s]+$/.test(fbUrl)) errors.push('AI_FALLBACK_URL doit être une adresse https:// (ex. : https://api.groq.com/openai/v1).');
  const fbRpm = Number(get('AI_FALLBACK_RPM') || 20);
  if (!Number.isInteger(fbRpm) || fbRpm < 1 || fbRpm > 1000) errors.push('AI_FALLBACK_RPM doit être un nombre entier entre 1 et 1000.');

  const port = Number(get('PORT') || 8000);
  if (!Number.isInteger(port) || port <= 0) errors.push('PORT doit être un nombre entier positif.');

  if (errors.length) {
    throw new Error(
      [
        'Configuration invalide :',
        ...errors.map((e) => `  - ${e}`),
        'Copiez .env.example en .env et renseignez les valeurs (le fichier .env ne doit jamais être commité).',
      ].join('\n'),
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    MONGODB_URI: mongoUri.replace(/\/+$/, ''),
    GLOBAL_DATABASE_NAME: get('GLOBAL_DATABASE_NAME') || 'zaff_global',
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: get('JWT_EXPIRES_IN') || '7d',
    VAPID_PUBLIC_KEY: vapidPublic || null,
    VAPID_PRIVATE_KEY: vapidPrivate || null,
    VAPID_SUBJECT: vapidSubject,
    UPLOADTHING_TOKEN: uploadthingToken || null,
    PLATFORM_ADMIN_EMAIL: adminEmail || null,
    PLATFORM_ADMIN_PASSWORD: adminPassword || null,
    GEMINI_API_KEY: geminiKey || null,
    GEMINI_MODEL: geminiModel,
    GEMINI_FALLBACK_MODELS: geminiFallbacks,
    GEMINI_RPM: geminiRpm,
    AI_FALLBACK_URL: fbUrl || null,
    AI_FALLBACK_KEY: fbKey || null,
    AI_FALLBACK_MODEL: fbModel || null,
    AI_FALLBACK_RPM: fbRpm,
  };
}
