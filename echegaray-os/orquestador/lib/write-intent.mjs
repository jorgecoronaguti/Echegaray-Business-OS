// Detección de INTENCIÓN DE ESCRITURA del dueño (raíces de verbo de acción, robusto al
// voseo). Vive en un lib para poder testearla porque es un GUARD DE COSTO: un falso
// positivo manda un READ barato (haiku) a sonnet + guía de escritura → fuga de gasto real.
// Caso medido (2026-07-16): "decime el último saldo CARGADO" se iba a sonnet porque la raíz
// 'carg' matcheaba el participio "cargado" (un DATO, no una orden). El participio no es una
// orden de escribir; la orden es "cargá/cargar/cargámelo".
//
// Cada entrada es un PREFIJO (matchea las conjugaciones). Las raíces que colisionan con un
// PARTICIPIO/ADJETIVO de uso frecuente como dato llevan un lookahead negativo que descarta
// solo la forma -ad(o/a/os/as):
//   carg(?!ad)  → matchea cargá/cargar/cargando/cargue, NO cargado/cargada (saldo cargado)
// No se toca el resto de las raíces: un cambio de más acá rompe la detección real de acción.
export const WRITE_INTENT_RE = /\b(registr|agreg|añad|anot|escrib|orden|complet|corrig|carg(?!ad)|aplic|hacelo|hac[eé]|modific|pon[eé]|actualiz|edit|arregl|reemplaz|renombr|mov[eé]|crea|mejor|reconstru|rehac|rehag|rearm|arm[aá]|gener[aá]|calcul[aá]|llen[aá]|limpi|f[oó]rmula|borr|elimin|vaci|duplic|copi|marc[aá]|pas[aá]\s+a)/i

/** true si el texto expresa una intención de ESCRIBIR/ACTUAR sobre un documento/dato. */
export function isWriteIntent(text) {
  return WRITE_INTENT_RE.test(String(text || ''))
}
