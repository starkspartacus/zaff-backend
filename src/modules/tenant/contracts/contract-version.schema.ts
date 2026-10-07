import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Historique des versions du contrat : une vente est toujours imprimée avec le texte
 * en vigueur le jour de la vente, même si le propriétaire le modifie ensuite.
 */
@Schema({ timestamps: true, collection: 'sales_contract_versions' })
export class ContractVersion {
  @Prop({ required: true, index: true })
  version: number;

  @Prop({ type: Object, required: true })
  settings: Record<string, any>;

  @Prop({ required: true, index: true })
  effectiveFrom: Date;
}

export const ContractVersionSchema = SchemaFactory.createForClass(ContractVersion);
