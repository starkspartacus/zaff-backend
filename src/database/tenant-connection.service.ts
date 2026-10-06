import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Schema } from 'mongoose';
import { GLOBAL_CONNECTION } from './database.constants';

@Injectable()
export class TenantConnectionService {
  private readonly logger = new Logger(TenantConnectionService.name);

  constructor(
    @InjectConnection(GLOBAL_CONNECTION)
    private readonly globalConnection: Connection,
  ) {}

  getTenantConnection(databaseName: string): Connection {
    if (!databaseName) {
      throw new Error('Tenant databaseName cannot be empty');
    }
    return this.globalConnection.useDb(databaseName, { useCache: true });
  }

  getModel<T = any>(databaseName: string, modelName: string, schema?: Schema): Model<T> {
    const tenantConnection = this.getTenantConnection(databaseName);
    if (tenantConnection.models[modelName]) {
      return tenantConnection.models[modelName] as unknown as Model<T>;
    }
    return tenantConnection.model(modelName, schema) as unknown as Model<T>;
  }

  getGlobalConnection(): Connection {
    return this.globalConnection;
  }
}
