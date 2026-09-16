/**
 * RESTAURAR EN `registros_hh` LO QUE LA WEB SABÍA DEL DÍA — y la planilla pisó.
 *
 * ═══ EL DEFECTO, MEDIDO EL 16/09/2026 ═══
 *
 * Dos timers escribían la obra del día de la misma fila `sheet:jornales` con criterios distintos:
 * `jornales-a-registros-hh` (cada hora) resuelve la obra por el RÓTULO de la quincena y mueve la fila
 * (`SQL_MOVER`); `asistencia-obra-por-dia` (cada 6 h) la pone donde dice el ledger diario de
 * ASISTENCIA. 150 filas cambiaban de obra cuatro veces por día. Y donde el jefe había declarado la
 * presencia desde el celular en OTRA obra (`asistencia_dia`, que ninguna corrida toca), la fila de
 * horas quedó en la obra del rótulo: Petina 08–14/09 en sf-mamposteria con el jefe declarándolo en
 * Quattropani cada día.
 *
 * ═══ LA REGLA ═══
 *
 * `asistencia_dia` es lo que una persona declaró mirando la obra. Si dice «presente en X» y la fila de
 * horas de la planilla (sin autor) dice Y, la obra del día es X: se repone en su lugar —mismo id, mismas
 * horas, mismo tipo— con la marca que la web usa cuando Administración corrige y con AUTOR, porque
 * `laTocoUnaPersona` protege exactamente eso y ninguna corrida futura la vuelve a mover.
 *
 * Lo que NO se repone solo, y se lista:
 *   · la web dice que NO vino (ausente/licencia) y la planilla trae horas: es una contradicción, la
 *     decide una persona (Tello y Zogbe el 08/09 SÍ trabajaron aunque el jefe marcó «no vino»);
 *   · ya existe una fila de la misma persona, día, tipo y obra X: moverla chocaría con el índice único;
 *   · la fila ya es de la web o tiene autor: no es de la planilla, no hay nada que restaurar.
 */

export const FUENTE_PLANILLA = 'sheet:jornales'
export const MARCA_RESTAURADA = 'web:correccion-horas'
const NO_TRABAJADO = new Set(['licencia', 'ausencia'])

const iso = (f) => (f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10))

/**
 * @param hh          [{ id, persona_id, fecha, obra_canonica_id, tipo_hora, horas, fuente_legacy, actualizado_por }]
 * @param asistencia  [{ persona_id, fecha, obra_canonica_id, estado, origen, motivo }]
 * @returns { restaurar, conflictos, chocan }
 */
export function planDeRestauracion({ hh = [], asistencia = [] }) {
  const declarado = new Map()
  for (const a of asistencia) declarado.set(`${a.persona_id}|${iso(a.fecha)}`, a)
  const ocupadas = new Set(hh.map((r) => `${r.persona_id}|${iso(r.fecha)}|${r.obra_canonica_id ?? ''}|${r.tipo_hora}`))

  const restaurar = []; const conflictos = []; const chocan = []
  for (const r of hh) {
    if (r.fuente_legacy !== FUENTE_PLANILLA || r.actualizado_por != null) continue
    if (NO_TRABAJADO.has(r.tipo_hora)) continue
    const fecha = iso(r.fecha)
    const a = declarado.get(`${r.persona_id}|${fecha}`)
    if (!a) continue
    const base = { id: r.id, persona_id: r.persona_id, fecha, tipo_hora: r.tipo_hora, horas: Number(r.horas ?? 0), obra_jornales: r.obra_canonica_id }
    if (a.estado !== 'presente') {
      conflictos.push({ ...base, web: `${a.estado}${a.motivo ? ' ' + a.motivo : ''} (${a.origen})` })
      continue
    }
    if (!a.obra_canonica_id || a.obra_canonica_id === r.obra_canonica_id) continue
    const destino = { ...base, obra_web: a.obra_canonica_id, origen: a.origen }
    if (ocupadas.has(`${r.persona_id}|${fecha}|${a.obra_canonica_id}|${r.tipo_hora}`)) chocan.push(destino)
    else restaurar.push(destino)
  }
  return { restaurar, conflictos, chocan }
}

/** El rastro que queda en `notas`: de dónde salió la obra y qué decía la planilla. */
export const rastroDeRestauracion = (x, hoy) =>
  `obra del día según asistencia_dia (${x.origen}); la planilla la tenía en ${x.obra_jornales ?? 'sin obra'} · restaurado ${hoy}`

/**
 * SÓLO la obra, la marca y el autor: las horas y el tipo son los de la planilla y no se discuten acá.
 * La cerradura es el `where`: si entre el plan y la escritura la fila dejó de ser de la planilla o
 * alguien la tocó, el UPDATE no hace nada y el `returning` vacío lo dice.
 */
export const SQL_RESTAURAR = `
update public.registros_hh
   set obra_canonica_id = $2::text,
       fuente_legacy = '${MARCA_RESTAURADA}',
       actualizado_por = $3::uuid,
       notas = nullif(concat_ws(' · ', nullif(notas, ''), $4::text), ''),
       actualizado_en = now()
 where id = $1::uuid and fuente_legacy = '${FUENTE_PLANILLA}' and actualizado_por is null
returning id`
