import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GLOBAL_CONNECTION } from '../../../database/database.constants';
import { UserDirectory, UserDirectorySchema } from './schemas/user-directory.schema';
import { DirectoryService } from './directory.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: UserDirectory.name, schema: UserDirectorySchema }], GLOBAL_CONNECTION)],
  providers: [DirectoryService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
