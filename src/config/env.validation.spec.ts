import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = { MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/', JWT_SECRET: 'dev-secret' };

  it('refuse de démarrer sans URI MongoDB ni secret JWT (aucune valeur par défaut)', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI est manquant[\s\S]*JWT_SECRET est manquant/);
  });

  it('refuse une URI qui n\'est pas MongoDB', () => {
    expect(() => validateEnv({ ...valid, MONGODB_URI: 'http://x' })).toThrow('MONGODB_URI doit commencer');
  });

  it('exige un secret JWT robuste en production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow('au moins 32 caractères');
    expect(validateEnv({ ...valid, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48) }).NODE_ENV).toBe('production');
  });

  it('applique les valeurs par défaut non sensibles et retire le / final de l\'URI', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 8000,
      MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net',
      GLOBAL_DATABASE_NAME: 'zaff_global',
      JWT_SECRET: 'dev-secret',
      JWT_EXPIRES_IN: '7d',
      VAPID_PUBLIC_KEY: null,
      VAPID_PRIVATE_KEY: null,
      VAPID_SUBJECT: 'mailto:contact@zaff.app',
    });
  });

  it('les clés VAPID (push) sont facultatives mais vont par paire', () => {
    expect(() => validateEnv({ ...valid, VAPID_PUBLIC_KEY: 'pub' })).toThrow('vont ensemble');
    expect(validateEnv({ ...valid, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }).VAPID_PUBLIC_KEY).toBe('pub');
  });
});
