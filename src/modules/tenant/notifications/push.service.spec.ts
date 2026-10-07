import { Types } from 'mongoose';
import * as webpush from 'web-push';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { PushService } from './push.service';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));

const DB = 'zaff_tenant_test';
const keys = webpush as unknown as { setVapidDetails: jest.Mock; sendNotification: jest.Mock };
const config = (push: Record<string, string | null>) => ({ get: () => push }) as any;
const owner = { userId: new Types.ObjectId().toString(), role: 'admin' };
const seller = { userId: new Types.ObjectId().toString(), role: 'seller' };
const sub = (n: number) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'p', auth: 'a' } });
const payload = { title: 'Nouvelle vente', body: 'Awa a vendu iPhone', url: '/app', tag: 'sale.created' };

describe('PushService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('est désactivé sans clés VAPID et n\'envoie rien', async () => {
    const conn = fakeTenantConnection({ PushSubscriptionRecord: ['endpoint'] });
    const push = new PushService(config({ publicKey: null, privateKey: null, subject: 'mailto:x@y.z' }), conn as any);
    expect(push.enabled).toBe(false);
    await push.subscribe(DB, owner, sub(1));
    await push.send(DB, { roles: ['admin'], userIds: [] }, payload);
    expect(keys.sendNotification).not.toHaveBeenCalled();
  });

  it('envoie aux appareils du rôle visé et supprime les abonnements expirés', async () => {
    const conn = fakeTenantConnection({ PushSubscriptionRecord: ['endpoint'] });
    const push = new PushService(config({ publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:x@y.z' }), conn as any);
    expect(keys.setVapidDetails).toHaveBeenCalledWith('mailto:x@y.z', 'PUB', 'PRIV');

    await push.subscribe(DB, owner, sub(1)); // téléphone du patron
    await push.subscribe(DB, owner, sub(2)); // ancien navigateur du patron (expiré)
    await push.subscribe(DB, seller, sub(3)); // vendeur : pas concerné
    keys.sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });

    await push.send(DB, { roles: ['admin'], userIds: [] }, payload);

    const sent = keys.sendNotification.mock.calls.map((c) => c[0].endpoint);
    expect(sent.sort()).toEqual(['https://push.example.com/1', 'https://push.example.com/2']);
    expect(JSON.parse(keys.sendNotification.mock.calls[0][1])).toEqual(payload);
    expect(conn.models.PushSubscriptionRecord.docs.map((d) => d.endpoint).sort()).toEqual([
      'https://push.example.com/1',
      'https://push.example.com/3',
    ]);
  });

  it('peut viser une personne précise (vendeur dont la clôture est validée)', async () => {
    const conn = fakeTenantConnection({ PushSubscriptionRecord: ['endpoint'] });
    const push = new PushService(config({ publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:x@y.z' }), conn as any);
    keys.sendNotification.mockResolvedValue({ statusCode: 201 });
    await push.subscribe(DB, owner, sub(1));
    await push.subscribe(DB, seller, sub(3));

    await push.send(DB, { roles: [], userIds: [seller.userId] }, payload);
    expect(keys.sendNotification.mock.calls.map((c) => c[0].endpoint)).toEqual(['https://push.example.com/3']);
  });

  it('un même appareil réabonné n\'est enregistré qu\'une fois', async () => {
    const conn = fakeTenantConnection({ PushSubscriptionRecord: ['endpoint'] });
    const push = new PushService(config({ publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:x@y.z' }), conn as any);
    await push.subscribe(DB, owner, sub(1));
    await push.subscribe(DB, owner, sub(1));
    expect(conn.models.PushSubscriptionRecord.docs).toHaveLength(1);
  });
});
