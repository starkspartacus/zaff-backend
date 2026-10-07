import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { CatalogImage, CatalogImageDocument } from './schemas/catalog-image.schema';

export const MAX_IMAGE_BYTES = 600 * 1024;

export const imageKey = (v?: string | null) =>
  (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Type réel d'après les premiers octets (on ne fait pas confiance au nom ni au type annoncé) */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export interface ImageUploader {
  establishmentId?: string | null;
  establishmentName?: string | null;
  name?: string | null;
}

@Injectable()
export class ImagesService {
  constructor(@InjectModel(CatalogImage.name, GLOBAL_CONNECTION) private readonly model: Model<CatalogImageDocument>) {}

  private view(img: any) {
    return {
      id: String(img._id),
      category: img.category,
      brand: img.brand,
      model: img.model,
      color: img.color,
      bytes: img.bytes,
      establishmentName: img.establishmentName,
      usage: img.usage || 0,
      url: `/global/images/${img._id}/file`,
    };
  }

  /** Photos d'un modèle (la couleur demandée d'abord), ou de la marque dans la catégorie */
  async search(q: { brand?: string; model?: string; color?: string; category?: string }) {
    const brandKey = imageKey(q.brand);
    const modelKey = imageKey(q.model);
    if (!brandKey && !modelKey) return [];
    const filter: Record<string, unknown> = {};
    if (brandKey) filter.brandKey = brandKey;
    if (modelKey) filter.modelKey = modelKey;
    else if (q.category) filter.category = q.category;
    const docs = await this.model.find(filter).sort({ usage: -1, createdAt: -1 }).limit(48).lean().exec();
    const colorKey = imageKey(q.color);
    const ranked = colorKey ? [...docs].sort((a, b) => Number(b.colorKey === colorKey) - Number(a.colorKey === colorKey)) : docs;
    return ranked.slice(0, 24).map((d) => this.view(d));
  }

  async upload(file: { buffer: Buffer; size: number } | undefined, meta: { brand: string; model: string; color?: string; category?: string }, by: ImageUploader) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucune photo reçue.');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Photo trop lourde (600 Ko maximum après réduction).');
    const mime = sniffImage(file.buffer);
    if (!mime) throw new BadRequestException('Format non reconnu : envoyez une photo JPEG, PNG ou WebP.');
    if (!imageKey(meta.brand) || !imageKey(meta.model)) throw new BadRequestException('Indiquez la marque et le modèle de la photo.');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.model.findOne({ sha256 }).lean().exec();
    if (existing) return this.view(existing);

    const created = await this.model.create({
      category: meta.category || null,
      brand: meta.brand.trim(),
      model: meta.model.trim(),
      color: meta.color?.trim() || null,
      brandKey: imageKey(meta.brand),
      modelKey: imageKey(meta.model),
      colorKey: imageKey(meta.color) || null,
      mime,
      data: file.buffer,
      bytes: file.size,
      sha256,
      establishmentId: by.establishmentId && Types.ObjectId.isValid(by.establishmentId) ? new Types.ObjectId(by.establishmentId) : null,
      establishmentName: by.establishmentName || null,
      uploadedBy: by.name || null,
    });
    return this.view(created);
  }

  async file(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    const img = await this.model.findById(id).select('+data mime sha256').lean().exec();
    if (!img) throw new NotFoundException('Image introuvable.');
    return img as unknown as { data: Buffer; mime: string; sha256: string };
  }

  /** Comptage d'utilisation : les photos choisies le plus souvent sont proposées en premier */
  async used(id?: string | null, delta = 1) {
    if (id && Types.ObjectId.isValid(id)) await this.model.updateOne({ _id: id }, { $inc: { usage: delta } });
  }

  /** Seule la boutique qui a ajouté la photo peut la retirer */
  async remove(id: string, establishmentId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Image introuvable.');
    const img = await this.model.findById(id).lean().exec();
    if (!img) throw new NotFoundException('Image introuvable.');
    if (String(img.establishmentId) !== String(establishmentId)) {
      throw new ForbiddenException("Cette photo a été ajoutée par une autre boutique : vous ne pouvez pas la supprimer.");
    }
    await this.model.deleteOne({ _id: id });
    return { deleted: true };
  }
}
