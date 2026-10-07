import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { DataScope } from './realtime.types';
import { INVALIDATES_KEY } from './invalidates.decorator';

@Injectable()
export class InvalidateInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly realtime: RealtimeService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const scopes = this.reflector.getAllAndOverride<DataScope[]>(INVALIDATES_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest();
    if (!scopes?.length || req.method === 'GET') return next.handle();

    return next.handle().pipe(
      tap(() => {
        const db = req.tenant?.databaseName;
        if (db) this.realtime.invalidate(db, scopes);
      }),
    );
  }
}
