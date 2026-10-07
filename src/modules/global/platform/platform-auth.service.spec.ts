import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ExecutionContext } from '@nestjs/common';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAdminGuard } from './platform.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';

const config = (email: string | null, password: string | null) => {
  const values: Record<string, string | null> = { 'platformAdmin.email': email, 'platformAdmin.password': password };
  return { get: (k: string) => values[k] ?? null };
};
const jwt = new JwtService({ secret: 'test-secret-assez-long-pour-les-jetons' });
const ctx = (user: unknown, headers: Record<string, string> = {}) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user, headers }) }) }) as unknown as ExecutionContext;

describe('Administrateur de la plateforme', () => {
  it('connexion avec les identifiants de l\'environnement : jeton « platform », 12 h', async () => {
    const auth = new PlatformAuthService(config('admin@zaff.app', 'mot-de-passe-solide') as any, jwt);
    const res = await auth.login(' Admin@ZAFF.app ', 'mot-de-passe-solide', '1.1.1.1');
    const payload = jwt.verify(res.accessToken);
    expect(payload).toMatchObject({ role: 'superadmin', platform: true, email: 'admin@zaff.app' });
    expect(payload.exp - payload.iat).toBe(12 * 3600);
  });

  it('mauvais mot de passe refusé ; 5 échecs bloquent l\'adresse IP 15 minutes', async () => {
    const auth = new PlatformAuthService(config('admin@zaff.app', 'mot-de-passe-solide') as any, jwt);
    for (let i = 0; i < 5; i++) await expect(auth.login('admin@zaff.app', 'faux', '2.2.2.2')).rejects.toThrow(/incorrect/);
    await expect(auth.login('admin@zaff.app', 'mot-de-passe-solide', '2.2.2.2')).rejects.toThrow(/Trop d'essais/);
    await expect(auth.login('admin@zaff.app', 'mot-de-passe-solide', '3.3.3.3')).resolves.toHaveProperty('accessToken');
  });

  it('empreinte bcrypt acceptée ; espace fermé sans configuration', async () => {
    const hash = await bcrypt.hash('autre-mot-de-passe', 4);
    const auth = new PlatformAuthService(config('admin@zaff.app', hash) as any, jwt);
    await expect(auth.login('admin@zaff.app', 'autre-mot-de-passe')).resolves.toHaveProperty('accessToken');
    const closed = new PlatformAuthService(config(null, null) as any, jwt);
    await expect(closed.login('admin@zaff.app', 'x')).rejects.toThrow(/pas configuré/);
  });

  it('garde : seul le jeton admin dont l\'e-mail est encore celui de l\'environnement passe', () => {
    const guard = new PlatformAdminGuard(config('admin@zaff.app', 'x') as any);
    expect(guard.canActivate(ctx({ platform: true, email: 'admin@zaff.app' }))).toBe(true);
    expect(() => guard.canActivate(ctx({ role: 'admin', tenantId: 'x' }))).toThrow(/Réservé/);
    expect(() => new PlatformAdminGuard(config('nouvel@zaff.app', 'x') as any).canActivate(ctx({ platform: true, email: 'admin@zaff.app' }))).toThrow(/Réservé/);
  });

  it("le jeton admin n'ouvre jamais les données d'une boutique (même avec l'en-tête x-tenant-slug)", async () => {
    const guard = new TenantGuard({ findBySlug: async () => ({ name: 'B', status: 'active' }) } as any);
    await expect(guard.canActivate(ctx({ platform: true }, { 'x-tenant-slug': 'boutique-test' }))).rejects.toThrow(/pas d'accès aux données des boutiques/);
  });
});
