import { validateEnv } from './env.validation';

/** Configuration de l'application : uniquement à partir des variables d'environnement validées */
export default () => {
  const env = validateEnv(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    mongodb: {
      uri: env.MONGODB_URI,
      globalDbName: env.GLOBAL_DATABASE_NAME,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    },
    platformAdmin: {
      email: env.PLATFORM_ADMIN_EMAIL,
      password: env.PLATFORM_ADMIN_PASSWORD,
    },
    media: {
      uploadthingToken: env.UPLOADTHING_TOKEN,
    },
    ai: {
      geminiApiKey: env.GEMINI_API_KEY,
      geminiModel: env.GEMINI_MODEL,
      geminiFallbackModels: env.GEMINI_FALLBACK_MODELS,
      geminiRpm: env.GEMINI_RPM,
      fallback: { url: env.AI_FALLBACK_URL, key: env.AI_FALLBACK_KEY, model: env.AI_FALLBACK_MODEL, rpm: env.AI_FALLBACK_RPM },
    },
    push: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    },
  };
};
