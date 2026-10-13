import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Compteurs séquentiels de la boutique (n° de facture…) : incrémentés de façon atomique */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String })
  _id: string;

  @Prop({ default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
