import { Types } from 'mongoose';

/**
 * Mini modèle Mongoose en mémoire pour les tests unitaires des services.
 * Couvre uniquement les opérations utilisées par les services (égalité, $gte, $in, $ne, $inc).
 */
const eq = (a: any, b: any) => String(a) === String(b);

const matches = (doc: any, query: any = {}): boolean =>
  Object.entries(query).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        if (op === '$gte') return value >= arg;
        if (op === '$in') return arg.some((x: any) => eq(x, value));
        if (op === '$ne') return !eq(value, arg);
        if (op === '$nin') return !arg.some((x: any) => eq(x, value));
        throw new Error(`Opérateur non supporté par FakeModel : ${op}`);
      });
    }
    return value === cond || (value != null && cond != null && eq(value, cond));
  });

const applyUpdate = (doc: any, update: any) => {
  for (const [key, val] of Object.entries(update)) {
    if (key === '$inc') Object.entries(val as any).forEach(([k, n]) => (doc[k] = (doc[k] || 0) + (n as number)));
    else doc[key] = val;
  }
};

const query = (run: () => any) => {
  let sortSpec: Record<string, number> | null = null;
  const q: any = {
    sort: (s: Record<string, number>) => ((sortSpec = s), q),
    populate: () => q,
    limit: () => q,
    lean: () => q,
    exec: async () => {
      const res = run();
      if (Array.isArray(res) && sortSpec) {
        const [[k, dir]] = Object.entries(sortSpec);
        res.sort((a: any, b: any) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
      }
      return res;
    },
    then: (ok: any, ko: any) => q.exec().then(ok, ko),
  };
  return q;
};

export class FakeModel {
  docs: any[] = [];
  constructor(private readonly unique: string[] = []) {}

  private wrap(doc: any) {
    doc.save = async () => doc;
    doc.populate = async () => doc;
    doc.toObject = () => ({ ...doc });
    return doc;
  }

  async create(data: any) {
    for (const k of this.unique) {
      if (this.docs.some((d) => d[k] === data[k])) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    const doc = this.wrap({ _id: new Types.ObjectId(), createdAt: new Date(), ...data });
    this.docs.push(doc);
    return doc;
  }

  find(q: any = {}) { return query(() => this.docs.filter((d) => matches(d, q))); }
  findOne(q: any = {}) { return this.findOneQuery(q); }
  private findOneQuery(q: any) {
    const inner = query(() => this.docs.filter((d) => matches(d, q)));
    const exec = inner.exec;
    inner.exec = async () => (await exec())[0] ?? null;
    return inner;
  }
  findById(id: any) { return this.findOneQuery({ _id: id }); }
  async exists(q: any) { return this.docs.some((d) => matches(d, q)) ? { _id: 1 } : null; }
  async countDocuments(q: any = {}) { return this.docs.filter((d) => matches(d, q)).length; }

  findOneAndUpdate(q: any, update: any) {
    return query(() => {
      const doc = this.docs.find((d) => matches(d, q));
      if (doc) applyUpdate(doc, update);
      return doc ?? null;
    });
  }
  findByIdAndUpdate(id: any, update: any) { return this.findOneAndUpdate({ _id: id }, update); }
  findOneAndDelete(q: any) {
    return query(() => {
      const i = this.docs.findIndex((d) => matches(d, q));
      return i >= 0 ? this.docs.splice(i, 1)[0] : null;
    });
  }
  async updateOne(q: any, update: any) {
    const doc = this.docs.find((d) => matches(d, q));
    if (doc) applyUpdate(doc, update);
    return { modifiedCount: doc ? 1 : 0 };
  }
  async updateMany(q: any, update: any) {
    const docs = this.docs.filter((d) => matches(d, q));
    docs.forEach((d) => applyUpdate(d, update));
    return { modifiedCount: docs.length };
  }
}

/** Remplace TenantConnectionService : un FakeModel par nom de modèle */
export const fakeTenantConnection = (unique: Record<string, string[]> = {}) => {
  const models: Record<string, FakeModel> = {};
  return {
    models,
    getModel: (_db: string, name: string) => (models[name] ??= new FakeModel(unique[name])),
  };
};
