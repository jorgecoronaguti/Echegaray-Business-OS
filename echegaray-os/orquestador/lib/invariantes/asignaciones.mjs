// Invariantes de `obra_asignacion`: reglas que la base tiene que cumplir SIEMPRE, escritas como
// función pura para que se puedan probar en rojo sin base y correr en verde contra la base viva.
//
// ═══ POR QUÉ (08/09/2026) ═══
// El historial de obra se reconstruye desde JORNALES y se corrige desde ASISTENCIA. Los dos
// generadores pueden equivocarse en silencio: nadie mira `obra_asignacion` fila por fila. Estas dos
// reglas son las que hacen ruido cuando algo se rompió, y las dos ya dieron rojo con datos reales:
//   · gente vigente en una obra `cerrada` (sf-mamposteria, le-galpon-9 recibieron días de agosto
//     y septiembre) — es correcto que salga: o la obra sigue viva y el catálogo miente, o la
//     imputación está mal. Lo decide el dueño, no este archivo.
//   · dos asignaciones vigentes a la vez para la misma persona: la ficha, la grilla y el costo por
//     obra empiezan a contar a esa persona dos veces.
//
// UN CONTROL QUE NO PUEDE DECIR QUE NO NO ES UN CONTROL: los tests le pasan datos rotos y exigen
// que salga rojo.

/** Las filas de prueba (E2E, semillas ZZ) no son datos: nunca disparan un invariante. */
export const esDePrueba = (a) => /PRUEBA|ZZ-E2E/i.test(a.notas ?? '') || /^ZZ/i.test(a.obra_id ?? '')

export const REGLAS = Object.freeze({
  VIGENTE_EN_OBRA_CERRADA: 'asignacion_vigente_sobre_obra_cerrada',
  DOS_VIGENTES: 'persona_con_mas_de_una_asignacion_vigente',
  TERMINA_DESPUES_DEL_CIERRE: 'asignacion_termina_despues_del_cierre_de_la_obra',
})

/**
 * @param asignaciones [{ id, persona_id, persona, obra_id, desde, hasta, notas }] — `hasta` null = vigente
 * @param obras        [{ id, estado, fecha_fin }] — `fecha_fin` 'YYYY-MM-DD' o null
 * @returns { hallazgos, revisadas, vigentes }  `hallazgos` vacío = verde.
 */
export function revisarAsignaciones({ asignaciones = [], obras = [] } = {}) {
  const estado = new Map(obras.map((o) => [o.id, String(o.estado ?? '')]))
  const fin = new Map(obras.map((o) => [o.id, o.fecha_fin ? String(o.fecha_fin).slice(0, 10) : null]))
  const filas = asignaciones.filter((a) => !esDePrueba(a))
  const vigentes = filas.filter((a) => a.hasta === null || a.hasta === undefined)
  const hallazgos = []

  for (const a of vigentes) {
    if (estado.get(a.obra_id) === 'cerrada') {
      hallazgos.push({
        regla: REGLAS.VIGENTE_EN_OBRA_CERRADA, id: a.id,
        persona: a.persona ?? a.persona_id, obra_id: a.obra_id, desde: a.desde ?? null,
        detalle: `vigente en «${a.obra_id}», que figura cerrada`,
      })
    }
  }

  // Desde el 09/09/2026 la obra cerrada SÍ conserva su historial, pero acotado a su fecha de cierre:
  // nadie puede figurar en una obra después del día en que terminó. Las vigentes ya las reporta la
  // regla de arriba — acá sólo las que tienen `hasta` y se pasan, para no gritar dos veces por lo mismo.
  for (const a of filas) {
    if (a.hasta === null || a.hasta === undefined) continue
    if (estado.get(a.obra_id) !== 'cerrada') continue
    const f = fin.get(a.obra_id)
    if (!f || String(a.hasta).slice(0, 10) <= f) continue
    hallazgos.push({
      regla: REGLAS.TERMINA_DESPUES_DEL_CIERRE, id: a.id,
      persona: a.persona ?? a.persona_id, obra_id: a.obra_id, desde: a.desde ?? null,
      detalle: `termina el ${String(a.hasta).slice(0, 10)} y «${a.obra_id}» cerró el ${f}`,
    })
  }

  const porPersona = new Map()
  for (const a of vigentes) {
    if (!porPersona.has(a.persona_id)) porPersona.set(a.persona_id, [])
    porPersona.get(a.persona_id).push(a)
  }
  for (const [persona_id, vs] of porPersona) {
    if (vs.length < 2) continue
    hallazgos.push({
      regla: REGLAS.DOS_VIGENTES, id: null,
      persona: vs[0].persona ?? persona_id, obra_id: null, desde: null,
      detalle: `${vs.length} asignaciones vigentes: ${vs.map((v) => v.obra_id).sort().join(', ')}`,
    })
  }

  hallazgos.sort((a, b) => a.regla.localeCompare(b.regla) || String(a.persona).localeCompare(String(b.persona)))
  return { hallazgos, revisadas: filas.length, vigentes: vigentes.length }
}

/** Una línea por hallazgo, para el log del timer y para el pipeline. */
export const formatearHallazgos = (hallazgos = []) =>
  hallazgos.map((h) => `   ROJO ${h.regla} · ${h.persona} · ${h.detalle}`).join('\n')

export const SQL_ASIGNACIONES = `
  select a.id, a.persona_id, p.nombre_completo as persona, a.obra_id,
         to_char(a.desde, 'YYYY-MM-DD') as desde, to_char(a.hasta, 'YYYY-MM-DD') as hasta, a.notas
    from public.obra_asignacion a
    left join public.personas p on p.id = a.persona_id
   where coalesce(p.es_prueba, false) = false`
// `fecha_fin_real` es la fecha de cierre de la obra; el invariante la lee como `fecha_fin`. No se
// usa `fecha_fin_plan`: es una previsión, y una obra que se estiró seguiría teniendo gente adentro.
export const SQL_OBRAS = `select id, estado, to_char(fecha_fin_real, 'YYYY-MM-DD') as fecha_fin
    from public.obra_canonica`
