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
  };
}
