/** Données rafraîchies côté client quand elles changent (clés React Query) */
export type DataScope =
  | 'sales'
  | 'units'
  | 'products'
  | 'stock'
  | 'dashboard'
  | 'my-stats'
  | 'customers'
  | 'repairs'
  | 'suppliers'
  | 'users'
  | 'cash-closings';

export interface SocketUser {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
  tenantDb: string;
}

export interface PresenceEntry {
  userId: string;
  name: string;
  role: string;
  since: string;
}

export const tenantRoom = (db: string) => `t:${db}`;
export const roleRoom = (db: string, role: string) => `t:${db}:r:${role}`;
export const userRoom = (userId: string) => `u:${userId}`;
