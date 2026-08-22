// LOS CANDADOS DE LA RECONSTRUCCIÓN, COMO FUNCIONES PURAS — para que tengan test (el auditor
// de reproducibilidad encontró el mecanismo entero sin una sola prueba, H9 del rechazo 22/08).
// El runner (scripts/reconstruir-desde-cero.mjs) decide con esto; acá no hay I/O.

/** El runner sólo habla con bases locales salvo intención explícita (--si-remoto).
 *  LÍMITE CONOCIDO: un túnel/pgbouncer local hacia producción pasa esta mirada — por eso la
 *  semilla tiene su propio candado de contenido, que no depende de la URL. */
export const esUrlLocal = (url) => /@(127\.0\.0\.1|localhost)[:/]/.test(String(url ?? ''))

/**
 * ¿Se puede operar sobre esta base? Una base con tablas de negocio y sin el ledger propio no es
 * vacía ni mía: no se toca. Con ledger propio, es una reconstrucción en curso: se continúa.
 * @param {{tablas: number, conLedger: boolean}} censo de public
 */
export function decisionSobreBase({ tablas, conLedger }) {
  if (tablas > 0 && !conLedger) {
    return { seguir: false, motivo: `la base ya tiene ${tablas} tablas en public y ningún ledger de este mecanismo: no es vacía ni mía. No se toca.` }
  }
  return { seguir: true }
}

/** Los ids de la semilla viven en este prefijo — es lo que la distingue de la gente real. */
export const PREFIJO_SEMILLA = '00000000-0000-4000-8000-'

/**
 * La semilla sólo entra en una base SIN GENTE REAL: un solo perfil ajeno al prefijo de la semilla
 * significa que esto no es un entorno de prueba recién nacido (podría ser producción alcanzada por
 * túnel con la cadena ya hasheada — los otros candados no la ven).
 * @param {{perfilesAjenos: number}} conteo de perfiles fuera del prefijo
 */
export function semillaPermitida({ perfilesAjenos }) {
  if (perfilesAjenos > 0) {
    return { permitida: false, motivo: `la base tiene ${perfilesAjenos} perfil(es) reales — esto no es un entorno de prueba vacío.` }
  }
  return { permitida: true }
}
