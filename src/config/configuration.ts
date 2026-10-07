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
    push: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    },
  };
};
