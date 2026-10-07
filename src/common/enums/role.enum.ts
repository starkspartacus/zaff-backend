export enum Role {
  SUPERADMIN = 'superadmin',
  /** Propriétaire / gérant : accès complet à son établissement */
  ADMIN = 'admin',
  /** Vendeur : consulte le stock et enregistre les ventes */
  SELLER = 'seller',
  /** Magasinier : crée les modèles et met les appareils en stock */
  STOREKEEPER = 'storekeeper',
}

/** Ancien rôle « standard » (avant l'introduction des rôles métier) = vendeur */
export const normalizeRole = (role: string): Role =>
  role === 'standard' ? Role.SELLER : (role as Role);
