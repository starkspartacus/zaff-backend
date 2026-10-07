import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { normalizeIdentifier } from '../../../common/utils/identifier';
import { UserDirectory, UserDirectoryDocument } from './schemas/user-directory.schema';

interface DirectoryUser {
  _id: unknown;
  name?: string;
  phone?: string | null;
  email?: string | null;
  role?: string;
  isActive?: boolean;
}

@Injectable()
export class DirectoryService {
  constructor(
    @InjectModel(UserDirectory.name, GLOBAL_CONNECTION)
    private readonly directoryModel: Model<UserDirectoryDocument>,
  ) {}

  /** Établissements où cet identifiant possède un compte */
  async findByIdentifier(raw: string) {
    return this.directoryModel.find({ identifier: normalizeIdentifier(raw), isActive: true }).exec();
  }

  /** Synchronise l'annuaire avec un compte (création, modification) */
  async syncUser(establishmentId: unknown, user: DirectoryUser) {
    const estId = new Types.ObjectId(String(establishmentId));
    const userId = new Types.ObjectId(String(user._id));
    const identifiers = [user.phone, user.email].filter((v): v is string => !!v).map((v) => normalizeIdentifier(v));

    await this.directoryModel.deleteMany({ establishmentId: estId, tenantUserId: userId, identifier: { $nin: identifiers } });
    for (const identifier of identifiers) {
      await this.directoryModel.updateOne(
        { identifier, establishmentId: estId },
        { $set: { tenantUserId: userId, name: user.name || null, role: user.role || null, isActive: user.isActive !== false } },
        { upsert: true },
      );
    }
  }

  async removeUser(establishmentId: unknown, userId: unknown) {
    await this.directoryModel.deleteMany({
      establishmentId: new Types.ObjectId(String(establishmentId)),
      tenantUserId: new Types.ObjectId(String(userId)),
    });
  }
}
