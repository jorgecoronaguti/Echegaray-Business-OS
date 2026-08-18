// LA SEMANA DE LAS HH — normalización al lunes.
//
// Vive fuera de `actionsHH.ts` por una razón mecánica: un archivo `'use server'` sólo puede exportar
// funciones async, así que una función pura exportada desde ahí rompe el build. Y por una razón
// mejor: es aritmética pura, se prueba sola y no necesita ni base ni sesión.
//
// POR QUÉ EL LUNES. `registros_hh.fecha_inicio_semana` es el grano de la fuente original (JORNALES,
// que es quincenal). Si cada quien carga la semana con el día que tiene a mano —el miércoles que
// llenó la planilla, el viernes que la cerró—, la clave única `(obra, trabajador, semana)` no ve
// que son la misma semana y deja entrar las horas dos veces. El total infla y nada grita.

/** El lunes de la semana de una fecha ISO (YYYY-MM-DD), en ISO. El domingo cierra su semana. */
export function lunesDeLaSemana(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0 = domingo
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}
