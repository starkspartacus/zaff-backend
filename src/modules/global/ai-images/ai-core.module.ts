import { Module } from '@nestjs/common';
import { AI_CLIENT, GeminiClient } from './gemini.client';

/** Un seul client d'IA pour tout le serveur : les quotas (gratuits) sont comptés une seule fois */
@Module({
  providers: [{ provide: AI_CLIENT, useClass: GeminiClient }],
  exports: [AI_CLIENT],
})
export class AiCoreModule {}
