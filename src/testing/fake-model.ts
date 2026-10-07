import { Types } from 'mongoose';

/**
 * Mini modèle Mongoose en mémoire pour les tests unitaires des services.
 * Couvre uniquement les opérations utilisées par les services (égalité, $gte, $in, $ne, $inc).
 */
const eq = (a: any, b: any) => String(a) === String(b);

const matches = (doc: any, query: any = {}): boolean =>
  Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return (cond as any[]).some((q) => matches(doc, q));
    const value = key.includes('.') ? key.split('.').reduce((v: any, k) => (v == null ? undefined : v[k]), doc) : doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        if (op === '$gte') return value >= arg;
        if (op === '$lte') return value <= arg;
        if (op === '$lt') return value < arg;
        if (op === '$gt') return value > arg;
        if (op === '$in') return arg.some((x: any) => eq(x, value));
        if (op === '$ne') return !eq(value, arg);
        if (op === '$nin') return !arg.some((x: any) => eq(x, value));
        if (op === '$regex') return new RegExp(arg, (cond as { $options?: string }).$options || '').test(String(value ?? ''));
        if (op === '$options') return true;
        if (op === '$exists') return (value !== undefined) === !!arg;
        throw new Error(`Opérateur non supporté par FakeModel : ${op}`);
      });
    }
    if (cond === null) return value === null || value === undefined;
    return value === cond || (value != null && cond != null && eq(value, cond));
  });

const applyUpdate = (doc: any, update: any) => {
  for (const [key, val] of Object.entries(update)) {
    if (key === '$inc') Object.entries(val as any).forEach(([k, n]) => (doc[k] = (doc[k] || 0) + (n as number)));
    else if (key === '$set') {
      // Chemins pointés : { 'settings.returnPolicy': … }
      for (const [path, v] of Object.entries(val as any)) {
        const parts = path.split('.');
        let target = doc;
        for (const k of parts.slice(0, -1)) target = target[k] ??= {};
        target[parts.at(-1)!] = v;
      }
    }
    else if (key === '$push') Object.entries(val as any).forEach(([k, v]) => (doc[k] = [...(doc[k] || []), v]));
    // Comme MongoDB : une valeur déjà présente (ObjectId compris, comparé par valeur) n'est pas ajoutée
    else if (key === '$addToSet') Object.entries(val as any).forEach(([k, v]) => (doc[k] = (doc[k] || []).some((x: any) => eq(x, v)) ? doc[k] : [...(doc[k] || []), v]));
    else doc[key] = val;
  }
};

const REFS: Record<string, string> = { customerId: 'Customer', productId: 'Product', supplierId: 'Supplier', saleId: 'Sale' };

const query = (run: () => any, registry?: Record<string, FakeModel>, single = false) => {
  let sortSpec: Record<string, number> | null = null;
  const paths: string[] = [];
  const q: any = {
    sort: (s: Record<string, number>) => ((sortSpec = s), q),
    populate: (path: string) => (paths.push(path), q),
    limit: () => q,
    select: () => q,
    lean: () => q,
    exec: async () => {
      let res = run();
      if (paths.length && registry && res) {
        const resolve = (d: any) => {
          if (!d) return d;
          const copy = Object.assign(Object.create(Object.getPrototypeOf(d)), d);
          for (const p of paths) {
            const target = registry[REFS[p]];
            const ref = d[p];
            if (target && ref && !(ref && typeof ref === 'object' && 'name' in ref)) copy[p] = target.docs.find((x) => eq(x._id, ref)) ?? ref;
          }
          return copy;
        };
        res = Array.isArray(res) ? res.map(resolve) : resolve(res);
      }
      if (Array.isArray(res) && sortSpec) {
        const [[k, dir]] = Object.entries(sortSpec);
        res.sort((a: any, b: any) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
      }
      if (single) res = Array.isArray(res) ? (res[0] ?? null) : res;
      return res;
    },
    then: (ok: any, ko: any) => q.exec().then(ok, ko),
  };
  return q;
};

export class FakeModel {
  docs: any[] = [];
  registry?: Record<string, FakeModel>;
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

  find(q: any = {}) { return query(() => this.docs.filter((d) => matches(d, q)), this.registry); }
  findOne(q: any = {}) { return this.findOneQuery(q); }
  private findOneQuery(q: any) {
    const inner = query(() => this.docs.filter((d) => matches(d, q)), this.registry, true);
    return inner;
  }
  findById(id: any) { return this.findOneQuery({ _id: id }); }
  async estimatedDocumentCount() { return this.docs.length; }
  async insertMany(list: any[]) { return Promise.all(list.map((d) => this.create(d))); }
  findByIdAndDelete(id: any) { return this.findOneAndDelete({ _id: id }); }
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
  async updateOne(q: any, update: any, opts: { upsert?: boolean } = {}) {
    const doc = this.docs.find((d) => matches(d, q));
    if (doc) applyUpdate(doc, update);
    else if (opts.upsert) {
      const fresh: any = { ...q };
      applyUpdate(fresh, update);
      await this.create(fresh);
      return { modifiedCount: 0, upsertedCount: 1 };
    }
    return { modifiedCount: doc ? 1 : 0 };
  }
  async deleteOne(q: any) {
    const i = this.docs.findIndex((d) => matches(d, q));
    if (i >= 0) this.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }
  async deleteMany(q: any) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, q));
    return { deletedCount: before - this.docs.length };
  }
  /** Agrégation minimale : $match, $group ($sum, $min, $max, $first, $size), $sort */
  async aggregate(pipeline: any[]) {
    let rows: any[] = [...this.docs];
    const val = (doc: any, expr: any): any => {
      if (typeof expr === 'string' && expr.startsWith('$')) return expr.slice(1).split('.').reduce((o, k) => o?.[k], doc);
      if (expr && typeof expr === 'object' && '$size' in expr) return (val(doc, expr.$size) || []).length;
      if (expr && typeof expr === 'object' && '$subtract' in expr) return val(doc, expr.$subtract[0]) - val(doc, expr.$subtract[1]);
      if (expr && typeof expr === 'object' && '$ifNull' in expr) return val(doc, expr.$ifNull[0]) ?? val(doc, expr.$ifNull[1]);
      if (expr && typeof expr === 'object' && !(expr instanceof Types.ObjectId)) {
        return Object.fromEntries(Object.entries(expr).map(([k, e]) => [k, val(doc, e)]));
      }
      return expr;
    };
    for (const stage of pipeline) {
      if (stage.$match) rows = rows.filter((d) => matches(d, stage.$match));
      else if (stage.$group) {
        const { _id, ...acc } = stage.$group;
        const groups = new Map<string, any>();
        for (const d of rows) {
          const id = val(d, _id);
          const key = JSON.stringify(id);
          const g = groups.get(key) || { _id: id };
          for (const [field, spec] of Object.entries(acc) as [string, any][]) {
            const [op, expr] = Object.entries(spec)[0] as [string, any];
            const v = val(d, expr);
            if (op === '$sum') g[field] = (g[field] || 0) + (typeof v === 'number' ? v : 0);
            else if (op === '$first') g[field] ??= v;
            else if (op === '$min') g[field] = g[field] === undefined || v < g[field] ? v : g[field];
            else if (op === '$max') g[field] = g[field] === undefined || v > g[field] ? v : g[field];
            else throw new Error(`Accumulateur non supporté : ${op}`);
          }
          groups.set(key, g);
        }
        rows = [...groups.values()];
      } else if (stage.$sort) {
        const [[k, dir]] = Object.entries(stage.$sort) as [string, number][];
        rows.sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
      } else if (stage.$unwind) {
        const path = stage.$unwind.slice(1);
        rows = rows.flatMap((d) => (d[path] || []).map((x: any) => ({ ...d, [path]: x })));
      } else throw new Error(`Étape non supportée : ${Object.keys(stage)[0]}`);
    }
    return rows;
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
    getModel: (_db: string, name: string) => {
      if (!models[name]) {
        models[name] = new FakeModel(unique[name]);
        models[name].registry = models;
      }
      return models[name];
    },
  };
};
