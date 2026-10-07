import { SetMetadata } from '@nestjs/common';
import { DataScope } from './realtime.types';

export const INVALIDATES_KEY = 'realtime:invalidates';

/** Après une modification réussie (POST/PUT/PATCH/DELETE), prévient les écrans ouverts de la boutique */
export const Invalidates = (...scopes: DataScope[]) => SetMetadata(INVALIDATES_KEY, scopes);
