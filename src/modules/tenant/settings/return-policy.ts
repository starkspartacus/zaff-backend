/** Actions proposables au client */
export interface ActionToggles {
  creditNote: boolean;
  refund: boolean;
  exchange: boolean;
}

/**
 * Politique de retour et de garantie, définie par le propriétaire dans les paramètres de la boutique.
 * Le vendeur ne choisit qu'entre les options que cette politique autorise ; le serveur la réapplique
 * à chaque retour (le client ne peut pas la contourner).
 */
export interface ReturnPolicy {
  /** Retours acceptés pour « changement d'avis » (appareil en bon état) */
  returnsEnabled: boolean;
  /** Délai de retour après l'achat, en jours */
  returnWindowDays: number;
  /** Conditions que le vendeur doit confirmer une à une */
  conditions: string[];
  changeOfMind: ActionToggles;
  /** Frais de remise en stock retenus sur l'avoir / le remboursement (%) */
  restockingFeePercent: number;
  /** Modes de remboursement autorisés */
  refundMethods: Array<'cash' | 'mobile'>;
  /** Validité d'un avoir, en jours */
  creditNoteValidityDays: number;
  defective: {
    /** Panne constatée dans ce délai : échange / avoir / remboursement (« panne à la livraison ») */
    exchangeWindowDays: number;
    earlyActions: ActionToggles;
    /** Garantie appliquée si la vente n'en précise pas */
    defaultWarrantyMonths: number;
    /** Réparation gratuite sous garantie */
    warrantyRepair: boolean;
    /** Réparation payante (devis) hors garantie */
    paidRepairOutOfWarranty: boolean;
  };
}

export const DEFAULT_RETURN_POLICY: ReturnPolicy = {
  returnsEnabled: true,
  returnWindowDays: 7,
  conditions: [
    "Emballage d'origine complet",
    'Accessoires et notices présents',
    "Aucune rayure ni trace d'usage",
    'Appareil réinitialisé (compte iCloud / Google retiré)',
  ],
  changeOfMind: { creditNote: true, refund: false, exchange: true },
  restockingFeePercent: 0,
  refundMethods: ['cash', 'mobile'],
  creditNoteValidityDays: 90,
  defective: {
    exchangeWindowDays: 7,
    earlyActions: { creditNote: true, refund: false, exchange: true },
    defaultWarrantyMonths: 12,
    warrantyRepair: true,
    paidRepairOutOfWarranty: true,
  },
};

/** Politique effective : paramètres de la boutique complétés par les valeurs par défaut */
export function resolveReturnPolicy(settings?: Record<string, any> | null): ReturnPolicy {
  const p = settings?.returnPolicy || {};
  const d = DEFAULT_RETURN_POLICY;
  return {
    ...d,
    ...p,
    changeOfMind: { ...d.changeOfMind, ...(p.changeOfMind || {}) },
    conditions: Array.isArray(p.conditions) ? p.conditions : d.conditions,
    refundMethods: Array.isArray(p.refundMethods) ? p.refundMethods : d.refundMethods,
    defective: {
      ...d.defective,
      ...(p.defective || {}),
      earlyActions: { ...d.defective.earlyActions, ...(p.defective?.earlyActions || {}) },
    },
  };
}
