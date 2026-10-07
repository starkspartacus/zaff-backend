import { PaymentMethod } from './payment-method.enum';

export const PAYMENT_LABELS: Record<string, string> = {
  [PaymentMethod.CASH]: 'Espèces',
  [PaymentMethod.MOBILE]: 'Mobile Money',
  [PaymentMethod.CARD]: 'Carte',
  [PaymentMethod.BANK_TRANSFER]: 'Virement',
  [PaymentMethod.CREDIT]: 'Crédit',
};

export const paymentLabel = (method?: string | null) => PAYMENT_LABELS[method || PaymentMethod.CASH] || method || 'Espèces';
