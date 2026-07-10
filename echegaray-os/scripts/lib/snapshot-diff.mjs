// Comparación de snapshots del calendario de cobros y pagos, ignorando el campo
// de frescura `leidoEn`. Sirve para no reescribir (ni commitear/deployar) cuando
// lo único que cambió es el timestamp de lectura y no los datos reales.
//
// Función pura (sin filesystem ni side effects) para poder testearla:
// ver scripts/lib/snapshot-diff.test.mjs.

// Campos que representan DATOS reales del snapshot. Todo lo que no esté acá
// (hoy: solo `leidoEn`) se considera metadato de frescura y se ignora al comparar.
export const CAMPOS_DATOS = ['saldoHoy', 'vencidos', 'dias', 'totalCobros', 'totalPagos']

// Devuelve solo el subconjunto de datos reales, en orden de clave estable, para
// poder comparar dos snapshots de forma determinística.
export function datosReales(snapshot) {
  const out = {}
  for (const campo of CAMPOS_DATOS) out[campo] = snapshot?.[campo] ?? null
  return out
}

// true si ambos snapshots tienen exactamente los mismos datos reales (ignorando
// leidoEn). Si falta cualquiera de los dos, se considera que hay cambio (false),
// para que el flujo escriba el snapshot en la primera corrida.
export function mismosDatosReales(a, b) {
  if (!a || !b) return false
  return JSON.stringify(datosReales(a)) === JSON.stringify(datosReales(b))
}
