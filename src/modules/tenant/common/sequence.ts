import { Model } from 'mongoose';
import { Counter } from './schemas/counter.schema';

/**
 * Numéro suivant d'une séquence (n° de facture…), atomique : deux postes qui vendent au même instant
 * reçoivent deux numéros différents. Au premier appel, la séquence part du plus grand numéro existant.
 */
export async function nextSequence(counters: Model<Counter>, name: string, seed: () => Promise<number>): Promise<number> {
  const inc = () => counters.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true }).lean().exec();
  const found = await inc();
  if (found) return found.seq;
  try {
    await counters.create({ _id: name, seq: await seed() });
  } catch (e: any) {
    if (e?.code !== 11000) throw e; // créé au même moment par un autre poste
  }
  const created = await inc();
  if (!created) throw new Error(`Séquence ${name} indisponible`);
  return created.seq;
}
