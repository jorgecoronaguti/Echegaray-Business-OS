// UN CUIL SE COMPARA POR SUS DÍGITOS.
//
// Medido el 14/09/2026: 13 personas tienen `personas.cuil` con guiones («20-38218815-3»), dos activas;
// `nomina_recibo_neto`, `nomina_adelanto` y `recibo_sueldo_linea` lo guardan sin guiones. Con `===` esas
// personas perdían su recibo, su giro y su actividad. La columna NO se corrige desde acá (no se escriben
// datos): se normaliza en cada cruce, y cuando la tabla trae `persona_id` manda esa llave.

/** Sólo los dígitos. `null` si no queda ninguno: un CUIL faltante no es un CUIL vacío que cruce con otro. */
export function cuilNormalizado(s: string | null | undefined): string | null {
  const d = String(s ?? '').replace(/\D/g, '')
  return d === '' ? null : d
}

/** ¿Es el mismo CUIL? Dos faltantes NO son el mismo. */
export function mismoCuil(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = cuilNormalizado(a)
  return x != null && x === cuilNormalizado(b)
}
