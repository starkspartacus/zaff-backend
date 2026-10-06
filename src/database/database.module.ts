import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GLOBAL_CONNECTION } from './database.constants';
import { TenantConnectionService } from './tenant-connection.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      connectionName: GLOBAL_CONNECTION,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('mongodb.uri');
        const dbName = configService.get<string>('mongodb.globalDbName');
        return {
          uri: `${uri}/${dbName}?retryWrites=true&w=majority`,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [TenantConnectionService],
  exports: [TenantConnectionService, MongooseModule],
})
export class DatabaseModule {}
