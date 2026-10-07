import { ReturnPolicy } from '../settings/return-policy';

export type ReturnReason = 'change_of_mind' | 'defective';
export type ReturnAction = 'credit_note' | 'refund' | 'exchange' | 'warranty_repair' | 'paid_repair';
export type DefectiveStage = 'early' | 'warranty' | 'out_of_warranty';

export interface ReturnOption {
  action: ReturnAction;
  label: string;
  description: string;
  /** Montant de l'avoir / du remboursement (absent pour une réparation) */
  amount?: number;
  /** Modes de remboursement proposables (action refund) */
  refundMethods?: Array<'cash' | 'mobile'>;
}

export interface ReasonEvaluation {
  allowed: boolean;
  /** Pourquoi c'est refusé, en clair pour le vendeur et le client */
  reason?: string;
  options: ReturnOption[];
}

export interface ReturnEvaluation {
  daysSincePurchase: number;
  price: number;
  warrantyEnd: Date | null;
  underWarranty: boolean;
  changeOfMind: ReasonEvaluation & { fee: number; conditions: string[] };
  defective: ReasonEvaluation & { stage: DefectiveStage };
}

const DAY = 24 * 3600 * 1000;
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Options d'argent communes (avoir / remboursement / échange) selon les interrupteurs de la politique */
function moneyOptions(toggles: { creditNote: boolean; refund: boolean; exchange: boolean }, amount: number, policy: ReturnPolicy): ReturnOption[] {
  const out: ReturnOption[] = [];
  if (toggles.exchange) {
    out.push({ action: 'exchange', label: 'Échange', description: `Le client repart avec un autre article (avoir de ${fmt(amount)} utilisé tout de suite).`, amount });
  }
  if (toggles.creditNote) {
    out.push({ action: 'credit_note', label: 'Avoir', description: `Bon d'achat de ${fmt(amount)} valable ${plural(policy.creditNoteValidityDays, 'jour')}.`, amount });
  }
  if (toggles.refund && policy.refundMethods.length) {
    out.push({ action: 'refund', label: 'Remboursement', description: `Rendre ${fmt(amount)} au client.`, amount, refundMethods: policy.refundMethods });
  }
  return out;
}

/**
 * Fin de garantie d'un appareil : celle enregistrée à la vente, sinon la garantie par défaut de la boutique.
 * Même règle pour les retours et pour le contrat remis au client.
 */
export function effectiveWarrantyEnd(policy: ReturnPolicy, soldAt: Date, recorded: Date | null): Date | null {
  if (recorded) return recorded;
  const months = policy.defective.defaultWarrantyMonths;
  return months > 0 ? new Date(new Date(soldAt).setMonth(soldAt.getMonth() + months)) : null;
}

/**
 * Évalue ce que la boutique peut proposer pour un appareil vendu.
 * Fonction pure : utilisée pour l'affichage (vendeur) ET revérifiée au moment d'enregistrer le retour.
 */
export function evaluateReturn(
  policy: ReturnPolicy,
  ctx: { soldAt: Date; price: number; warrantyEnd: Date | null; now?: Date },
): ReturnEvaluation {
  const now = ctx.now || new Date();
  const days = Math.max(0, Math.floor((now.getTime() - ctx.soldAt.getTime()) / DAY));
  const warrantyEnd = effectiveWarrantyEnd(policy, ctx.soldAt, ctx.warrantyEnd);
  const underWarranty = !!warrantyEnd && now <= warrantyEnd;

  // ─── Changement d'avis (appareil en bon état) ───
  const fee = Math.round((ctx.price * policy.restockingFeePercent) / 100);
  const com: ReturnEvaluation['changeOfMind'] = { allowed: false, options: [], fee, conditions: policy.conditions };
  if (!policy.returnsEnabled) {
    com.reason = "La boutique n'accepte pas les retours pour changement d'avis.";
  } else if (days > policy.returnWindowDays) {
    com.reason = `Délai de retour dépassé : ${plural(policy.returnWindowDays, 'jour')} maximum, achat il y a ${plural(days, 'jour')}.`;
  } else {
    com.options = moneyOptions(policy.changeOfMind, ctx.price - fee, policy);
    com.allowed = com.options.length > 0;
    if (!com.allowed) com.reason = "Aucune solution de retour n'est activée dans les paramètres de la boutique.";
  }

  // ─── Appareil défectueux ───
  let stage: DefectiveStage = underWarranty ? 'warranty' : 'out_of_warranty';
  const def: ReturnEvaluation['defective'] = { allowed: false, options: [], stage };
  if (days <= policy.defective.exchangeWindowDays) {
    // Panne dans les premiers jours : échange / avoir / remboursement intégral (sans frais)
    def.options = moneyOptions(policy.defective.earlyActions, ctx.price, policy);
    if (def.options.length) stage = 'early';
  }
  if (underWarranty && policy.defective.warrantyRepair) {
    def.options.push({
      action: 'warranty_repair',
      label: 'Réparation sous garantie',
      description: `Gratuite — garantie jusqu'au ${warrantyEnd!.toLocaleDateString('fr-FR')}.`,
    });
  }
  if (!underWarranty && policy.defective.paidRepairOutOfWarranty) {
    def.options.push({
      action: 'paid_repair',
      label: 'Réparation payante',
      description: warrantyEnd ? `Garantie terminée le ${warrantyEnd.toLocaleDateString('fr-FR')} : un devis sera établi.` : 'Hors garantie : un devis sera établi.',
    });
  }
  def.stage = stage;
  def.allowed = def.options.length > 0;
  if (!def.allowed) {
    def.reason = underWarranty
      ? "La boutique ne prend pas en charge cette panne (réparation sous garantie désactivée)."
      : `Garantie terminée${warrantyEnd ? ` le ${warrantyEnd.toLocaleDateString('fr-FR')}` : ''} et la boutique ne propose pas de réparation payante.`;
  }

  return { daysSincePurchase: days, price: ctx.price, warrantyEnd, underWarranty, changeOfMind: com, defective: def };
}
