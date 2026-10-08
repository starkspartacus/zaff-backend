import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformAuthService } from '../platform/platform-auth.service';
import * as bcrypt from 'bcrypt';
import { FakeModel, fakeTenantConnection } from '../../../testing/fake-model';
import { DirectoryService } from '../directory/directory.service';
import { EstablishmentsService } from './establishments.service';
import { RegistrationService } from './registration.service';
import { AuthService } from '../../tenant/auth/auth.service';
import { RegisterEstablishmentDto } from './dto/register-establishment.dto';

const base: RegisterEstablishmentDto = {
  name: 'Zaff Phone Center',
  countryCode: 'CI',
  city: 'Abidjan',
  commune: 'cocody',
  address: 'Riviera 2',
  ownerName: 'Michel Koffi',
  ownerPhone: '07 07 07 07 07',
  ownerEmail: 'michel@exemple.com',
  password: 'Boutique2026',
};

describe('Inscription et connexion', () => {
  let establishments: FakeModel;
  let directoryModel: FakeModel;
  let tenants: Map<string, ReturnType<typeof fakeTenantConnection>>;
  let registration: RegistrationService;
  let auth: AuthService;

  beforeEach(() => {
    establishments = new FakeModel(['slug']);
    directoryModel = new FakeModel();
    tenants = new Map();
    const tenantService: any = {
      getModel: (db: string, name: string) => (tenants.get(db) ?? tenants.set(db, fakeTenantConnection()).get(db)!).getModel(db, name),
    };
    const directory = new DirectoryService(directoryModel as any);
    registration = new RegistrationService(establishments as any, tenantService, directory);
    auth = new AuthService(new EstablishmentsService(establishments as any), directory, tenantService, new JwtService({ secret: 'test' }));
  });

  it('crée la boutique et le propriétaire : numéro international, devise du pays, commune, mot de passe chiffré', async () => {
    const res = await registration.register({ ...base });
    expect(res).toMatchObject({ name: 'Zaff Phone Center', slug: 'zaff-phone-center', currency: 'F CFA', city: 'Abidjan', commune: 'Cocody', ownerPhone: '+2250707070707' });
    expect(res).not.toHaveProperty('databaseName');

    const est = establishments.docs[0];
    expect(est).toMatchObject({ countryCode: 'CI', currencyCode: 'XOF', email: 'michel@exemple.com' });
    const owner = tenants.get(est.databaseName)!.models.TenantUser.docs[0];
    expect(owner).toMatchObject({ phone: '+2250707070707', role: 'admin' });
    expect(owner.password).not.toBe(base.password);
    expect(await bcrypt.compare(base.password, owner.password)).toBe(true);
    expect(directoryModel.docs.map((d) => d.identifier).sort()).toEqual(['+2250707070707', 'michel@exemple.com']);
  });

  it('Abidjan : la commune est obligatoire ; ville et commune doivent venir des listes', async () => {
    await expect(registration.register({ ...base, commune: undefined })).rejects.toThrow('Choisissez votre commune à Abidjan.');
    await expect(registration.register({ ...base, commune: 'Paris 15' })).rejects.toThrow('Commune inconnue à Abidjan.');
    await expect(registration.register({ ...base, city: 'Gotham' })).rejects.toThrow("Choisissez votre ville dans la liste (Côte d'Ivoire).");
    // Bouaké : pas de commune à choisir
    await expect(registration.register({ ...base, city: 'bouaké', commune: undefined })).resolves.toMatchObject({ city: 'Bouaké', commune: null });
  });

  it('e-mail de l\'administrateur ZAFF : réservé, et la connexion boutique ouvre l\'espace administrateur', async () => {
    const values: Record<string, string> = { 'platformAdmin.email': 'admin@zaff.app', 'platformAdmin.password': 'MotDePasse2026' };
    const config: any = { get: (k: string) => values[k] ?? null };
    const jwt = new JwtService({ secret: 'test-secret-assez-long-pour-les-jetons' });
    const reg = new RegistrationService(establishments as any, { getModel: () => null } as any, new DirectoryService(directoryModel as any), config);
    expect((await reg.check({ email: 'Admin@zaff.app' } as any)).email).toMatchObject({ taken: true });
    // Même si une boutique a déjà ce compte avec le même mot de passe (créé avant la réservation)
    await registration.register({ ...base, ownerEmail: 'admin@zaff.app', password: 'MotDePasse2026' });
    const platformAuth = new PlatformAuthService(config, jwt);
    const a = new AuthService(new EstablishmentsService(establishments as any), new DirectoryService(directoryModel as any), (auth as any).tenantConnectionService, jwt, platformAuth);
    const res: any = await a.login({ identifier: 'ADMIN@zaff.app', password: 'MotDePasse2026' } as any, '9.9.9.9');
    expect(res.platform).toBe(true);
    expect(jwt.verify(res.accessToken)).toMatchObject({ platform: true, role: 'superadmin' });
    await expect(a.login({ identifier: 'admin@zaff.app', password: 'faux' } as any, '9.9.9.9')).rejects.toThrow(/administrateur incorrect/);
    // Le propriétaire garde l'accès à sa boutique par son numéro de téléphone
    await expect(a.login({ identifier: '0707070707', countryCode: 'CI', password: 'MotDePasse2026' } as any)).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('pays sans liste de villes : ville saisie librement', async () => {
    const res = await registration.register({ ...base, countryCode: 'FR', city: 'Lyon', commune: undefined, ownerPhone: '06 12 34 56 78', ownerEmail: 'a@b.fr' });
    expect(res).toMatchObject({ city: 'Lyon', currency: '€', ownerPhone: '+33612345678' });
  });

  it('numéro invalide pour le pays choisi : refusé avec l\'indicatif', async () => {
    await expect(registration.register({ ...base, ownerPhone: '07 07 07 07' })).rejects.toThrow("Numéro de téléphone invalide pour Côte d'Ivoire (+225).");
  });

  it('numéro unique par pays : même numéro au même pays refusé, mêmes chiffres dans un autre pays acceptés', async () => {
    await registration.register({ ...base });
    const again = registration.register({ ...base, name: 'Autre boutique', ownerEmail: 'autre@exemple.com' });
    await expect(again).rejects.toBeInstanceOf(ConflictException);
    await expect(again).rejects.toMatchObject({ response: { details: { code: 'PHONE_TAKEN', field: 'ownerPhone' } } });
    expect(establishments.docs).toHaveLength(1); // rien n'a été créé

    // Mêmes chiffres « 07 51 23 45 67 » : +225 07 51… en Côte d'Ivoire, +33 7 51… en France = deux numéros différents
    const ci = await registration.register({ ...base, name: 'Boutique 2', ownerPhone: '07 51 23 45 67', ownerEmail: 'ci@exemple.com' });
    const fr = await registration.register({ ...base, name: 'Boutique Paris', countryCode: 'FR', city: 'Paris', commune: undefined, ownerPhone: '07 51 23 45 67', ownerEmail: 'paris@exemple.com' });
    expect([ci.ownerPhone, fr.ownerPhone]).toEqual(['+2250751234567', '+33751234567']);
  });

  it('e-mail unique (majuscules comprises)', async () => {
    await registration.register({ ...base });
    await expect(registration.register({ ...base, ownerPhone: '05 05 05 05 05', ownerEmail: 'MICHEL@exemple.com'.toLowerCase() })).rejects.toMatchObject({
      response: { details: { code: 'EMAIL_TAKEN' } },
    });
  });

  it('deux boutiques du même nom : identifiant interne différent, invisible pour l\'utilisateur', async () => {
    await registration.register({ ...base });
    const second = await registration.register({ ...base, ownerPhone: '05 05 05 05 05', ownerEmail: 'b@exemple.com' });
    expect(second.slug).toBe('zaff-phone-center-abidjan');
  });

  it('vérification en direct : numéro / e-mail libres ou pris', async () => {
    await registration.register({ ...base });
    expect(await registration.check({ countryCode: 'CI', phone: '0707070707', email: 'michel@exemple.com' })).toEqual({
      phone: { valid: true, e164: '+2250707070707', taken: true },
      email: { valid: true, taken: true },
    });
    expect(await registration.check({ countryCode: 'CI', phone: '0101010101', email: 'libre@exemple.com' })).toMatchObject({
      phone: { taken: false },
      email: { taken: false },
    });
    expect((await registration.check({ countryCode: 'CI', phone: '123' })).phone).toMatchObject({ valid: false });
  });

  it('connexion : téléphone + pays, ou e-mail ; mauvais pays refusé', async () => {
    await registration.register({ ...base });
    const byPhone = await auth.login({ identifier: '07 07 07 07 07', countryCode: 'CI', password: base.password });
    expect(byPhone.user).toMatchObject({ name: 'Michel Koffi', role: 'admin' });
    expect(byPhone.establishment).toMatchObject({ countryCode: 'CI', city: 'Abidjan' });

    await expect(auth.login({ identifier: 'Michel@Exemple.com', password: base.password })).resolves.toBeTruthy();
    await expect(auth.login({ identifier: '07 07 07 07 07', countryCode: 'FR', password: base.password })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login({ identifier: 'michel@exemple.com', password: 'mauvais' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('pays inconnu refusé', async () => {
    await expect(registration.register({ ...base, countryCode: 'ZZ' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
