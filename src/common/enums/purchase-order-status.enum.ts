export enum PurchaseOrderStatus {
  /** Commandée, rien reçu */
  PENDING = 'pending',
  /** Une partie reçue */
  PARTIAL = 'partial',
  /** Tout reçu, ou commande soldée (reliquat abandonné) */
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}
