export enum UnitStatus {
  IN_STOCK = 'in_stock',
  SOLD = 'sold',
  /** Appareil de la boutique mis de côté (panne, retour défectueux) : hors stock vendable */
  DEFECTIVE = 'defective',
  /** Appareil d'un client à l'atelier (réparation sous garantie ou payante) : hors stock */
  IN_REPAIR = 'in_repair',
  /** Remis à un revendeur (dépôt) : hors stock, toujours à la boutique tant qu'il n'est pas payé ou rendu */
  CONSIGNED = 'consigned',
}
