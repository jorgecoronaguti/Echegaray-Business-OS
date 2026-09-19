// LOS CANDADOS DE `aplicar-migracion.mjs`, COMO FUNCIONES PURAS.
//
// ═══ EL DEFECTO QUE CIERRA (18/09/2026) ═══
//
// Un agente aplicó `20260918T0900_presupuesto_por_rubro_y_fuente_unica.sql` a la base REAL desde una rama sin
// mergear. La app publicada (main) no sabía leer lo nuevo y mostró $22,6 M menos de costo durante horas, sin
// un solo error. Hoy el ledger de producción tiene 21 migraciones que NO están en `origin/main`.
//
// LA REGLA: a una base remota sólo se APLICA una migración que ya está en `origin/main`, byte por byte. El
// camino único es worktree → base de desarrollo (pg-reprod) → merge → main → pipeline → producción. Un
// ensayo (rollback) sobre producción se deja pasar con aviso —no cambia nada— pero también tiene su lugar
// en desarrollo. Sin red para verificar `origin/main`, no se aplica: fail-closed.

/**
 * @param {{ aplicar: boolean, remota: boolean, fetchOk: boolean, enOriginMain: boolean, hashOrigin?: string, hashLocal: string, forzarSinOrigin?: boolean }} x
 * @returns {{ seguir: boolean, motivo?: string, aviso?: string }}
 */
export function decisionAplicarEnProduccion({ aplicar, remota, fetchOk, enOriginMain, hashOrigin, hashLocal }) {
  if (!remota) return { seguir: true, motivo: 'base local: cualquier archivo se ensaya y se aplica (es para eso)' }
  if (!aplicar) return { seguir: true, aviso: 'ensayo sobre una base REMOTA: no cambia nada, pero el ensayo también vive en la base de desarrollo (pg-reprod)' }
  if (!fetchOk) return { seguir: false, motivo: 'no pude verificar origin/main (git fetch falló): una migración no se aplica a producción sin esa verificación' }
  if (!enOriginMain) {
    return { seguir: false, motivo: 'la migración NO está en origin/main. El camino es: worktree → pg-reprod → merge → main → pipeline. '
      + 'Una migración aplicada desde una rama sin mergear dejó $22,6 M invisibles el 18/09/2026.' }
  }
  if (hashOrigin !== hashLocal) return { seguir: false, motivo: `el archivo local difiere del de origin/main (origin ${hashOrigin} ≠ local ${hashLocal}): se aplica lo publicado, no lo editado` }
  return { seguir: true, motivo: 'está en origin/main con el mismo contenido' }
}
