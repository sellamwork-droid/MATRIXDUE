// ============================================
// ENGINE RESOLVER
// ============================================
// Punto di ingresso unico per la generazione incroci.
// In base al parametro `type`, delega al motore corretto.

import { generateTargetCrosses, type TargetEngineParams, type TargetEngineResult } from './targetEngine';
import { generateExplosionCrosses, type ExplosionEngineParams, type ExplosionEngineResult } from './explosionEngine';
import type { CrossSuggestion } from '../../hooks/useCrossTrading';

export type EngineType = 'target' | 'explosion';

export interface EngineResult {
  suggestions: CrossSuggestion[];
}

/**
 * Risolve e invoca il motore di generazione corretto
 * in base al tipo richiesto.
 *
 * @param type - 'target' per Target Asimmetrico, 'explosion' per Esplosione
 * @param params - Parametri comuni a entrambi i motori
 * @returns Il risultato del motore selezionato
 */
export function resolveEngine(type: EngineType, params: TargetEngineParams & ExplosionEngineParams): EngineResult {
  console.log(`[ENGINE RESOLVER] Tipo richiesto: ${type}`);

  switch (type) {
    case 'target':
      return generateTargetCrosses(params);
    case 'explosion':
      return generateExplosionCrosses(params);
    default: {
      const _exhaustive: never = type;
      throw new Error(`[ENGINE RESOLVER] Tipo sconosciuto: ${_exhaustive}`);
    }
  }
}
