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
}

const MIN_SECRET_LENGTH = 32;

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
  };
}
