// LOS TRAMOS DE `obra_asignacion` QUE UNA CORRECCIÓN DEL MISMO DÍA DEJÓ ATRÁS — y cuáles se sacan.
//
// ═══ EL RESIDUO (16/09/2026) ═══
//
// Hasta ese día, cambiar la obra de una persona desde la grilla cerraba la asignación creada ese
// mismo día con `hasta = desde`: un tramo de UN día. Cada cambio apilaba otro. GONZALEZ TOBARES quedó
// con le-comedor 16..16, messina 16..16, le-comedor 16..16, messina 16..16 y messina abierta desde el
// 16: la regla del día («la más corta gana», `asignacion-del-dia.mjs`) no decidía entre cuatro
// iguales, y la obra actual de la grilla desempataba por horas y volvía a la obra vieja.
//
// La puerta ya no crea ese residuo (`planDeObraActual.ts` lo borra en vez de cerrarlo) y las lecturas
// ya lo ignoran. Esto es la limpieza de lo que quedó: se decide acá, sin base, y el script la aplica.
//
// ═══ QUÉ ES «REEMPLAZADO» Y QUÉ NO ═══
//
// Un tramo con fin es reemplazado cuando OTRO tramo de la misma persona tiene el MISMO `desde` y un
// fin posterior o abierto: le pasó por encima el mismo día. NO es reemplazado —y no se toca— si en
// alguno de sus días hay horas cargadas en su obra: ahí sí estuvo, y la fila es lo que respalda esas
// horas. Un tramo de un día con `desde` propio (le-comedor 15..15 con 9 hs ese día en le-comedor) es
// historia real aunque dure un día.

const iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null)

/**
 * @param asignaciones [{ id, persona_id, obra_id, desde, hasta }]
 * @param horas        [{ persona_id, fecha, obra_canonica_id }] — filas de registros_hh CON obra
 * @returns { sacar: [{ id, persona_id, obra_id, desde, hasta, reemplazadaPor }], conHoras: [...] }
 */
export function planDeLimpieza({ asignaciones = [], horas = [] }) {
  const tramos = asignaciones.map((a) => ({ ...a, desde: iso(a.desde), hasta: iso(a.hasta) }))
  const porPersona = new Map()
  for (const t of tramos) {
    if (!porPersona.has(t.persona_id)) porPersona.set(t.persona_id, [])
    porPersona.get(t.persona_id).push(t)
  }
  const horasDe = new Set(horas.map((h) => `${h.persona_id}|${iso(h.fecha)}|${h.obra_canonica_id}`))
  const tieneHoras = (t) => {
    for (let f = t.desde; f <= t.hasta; f = siguiente(f)) {
      if (horasDe.has(`${t.persona_id}|${f}|${t.obra_id}`)) return true
    }
    return false
  }

  const sacar = []
  const conHoras = []
  for (const t of tramos) {
    if (!t.desde || !t.hasta) continue
    const encima = (porPersona.get(t.persona_id) ?? []).find((o) =>
      o.id !== t.id && o.desde === t.desde && (o.hasta == null || o.hasta > t.hasta))
    if (!encima) continue
    const fila = { id: t.id, persona_id: t.persona_id, obra_id: t.obra_id, desde: t.desde, hasta: t.hasta, reemplazadaPor: encima.id }
    if (tieneHoras(t)) conHoras.push(fila)
    else sacar.push(fila)
  }
  return { sacar, conHoras }
}

const siguiente = (f) => new Date(Date.parse(`${f}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** El borrado acotado por id Y por persona: nunca la fila de otro aunque el id venga mal. */
export const SQL_SACAR = 'delete from public.obra_asignacion where id = $1::uuid and persona_id = $2::uuid'
