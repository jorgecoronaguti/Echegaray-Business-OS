#!/usr/bin/env node
// LAS PROPUESTAS DEL CAMINO VIEJO, JUZGADAS POR LAS REGLAS NUEVAS.
//
// ═══ QUÉ PASÓ (hallazgo de la auditoría adversarial, 27/08/2026) ═══
//
// El clasificador viejo escribía su sugerencia en `obra_actividad.propuesta_tarea_tipo_id`, y de ahí
// la publica la vista `actividades_sin_clasificar` — que es lo que una persona mira para aceptar o
// rechazar. El 27/08 se le agregó al clasificador el VETO DE SUSTITUCIÓN: dejó de proponer pares que
// cambian el trabajo («MUROS EXTERNOS» → «INTERNOS», «e=0,15 m» → «e=0,10 m»).
//
// Pero las propuestas ya escritas quedaron donde estaban. Siguen publicadas con su confianza intacta
// y una persona las puede aceptar con un click, sin que nada diga que la regla que las produjo ya
// fue retirada. **Arreglar el productor no cura lo producido**: es la capa fósil de siempre, sólo
// que en vez de un número viejo lo que queda es una decisión que el OS ya no tomaría.
//
// ═══ QUÉ HACE ═══
//
// Vuelve a pasar cada propuesta viva por `veredictoDe()` —las reglas de hoy— y retira las que no
// sobreviven, dejando escrito POR QUÉ se retiró. No inventa una clasificación nueva ni acepta nada:
// una propuesta que hoy no se haría, no se muestra.
//
//   node orquestador/scripts/reevaluar-propuestas-viejas.mjs           muestra, no escribe
//   node orquestador/scripts/reevaluar-propuestas-viejas.mjs --aplicar retira las que no pasan
//
// EL MOTIVO SE PERSISTE. Un AMBIGUO cuyo motivo se pierde obliga a la persona a redescubrir a mano
// por qué el OS no pudo decidir, que es exactamente el trabajo que el OS tenía que ahorrarle.

import { query, closePool } from '../lib/db.mjs'
import { veredictoDe } from '../lib/clasificar-actividades.mjs'

const APLICAR = process.argv.includes('--aplicar')

/** Las candidatas que el camino viejo había considerado, tal como quedaron en la evidencia. */
function candidatasDe(evidencia, propuesta) {
  const nombres = Array.isArray(evidencia?.candidatas) && evidencia.candidatas.length
    ? evidencia.candidatas
    : [evidencia?.candidata].filter(Boolean)
  return nombres.map((nombre) => ({
    nombre,
    tareaTipoId: nombre === (evidencia?.candidata ?? propuesta.propuesta_nombre) ? propuesta.propuesta_tarea_tipo_id : null,
    similitud: Number(evidencia?.similitud ?? 0),
    unidad: propuesta.tarea_unidad ?? null,
  })).filter((c) => c.tareaTipoId)
}

async function main() {
  const { rows } = await query(
    `select a.id, a.nombre, a.unidad, a.obra_id, a.propuesta_tarea_tipo_id, a.propuesta_evidencia,
            t.nombre as propuesta_nombre, t.unidad as tarea_unidad
       from public.obra_actividad a
       join public.tarea_tipo t on t.id = a.propuesta_tarea_tipo_id
      where a.tarea_tipo_id is null and a.archivada is not true
      order by a.nombre`)

  console.log(`\n  ${rows.length} propuesta(s) del camino viejo, todavía publicadas\n`)
  const retirar = []
  for (const r of rows) {
    const contexto = { nombre: r.nombre, unidad: r.unidad, obra: r.obra_id }
    const candidatas = candidatasDe(r.propuesta_evidencia, r)
    const v = veredictoDe(contexto, candidatas)
    const sobrevive = v.veredicto === 'EXACTO' || v.veredicto === 'PROBABLE'
    const marca = sobrevive ? '✔' : '✖'
    console.log(`  ${marca} ${String(r.nombre).slice(0, 42).padEnd(43)} → ${String(r.propuesta_nombre).slice(0, 30).padEnd(31)} ${v.veredicto}`)
    if (!sobrevive) {
      console.log(`      ${v.porQue}`)
      retirar.push({ id: r.id, porQue: v.porQue, veredicto: v.veredicto })
    }
  }

  console.log(`\n  ${rows.length - retirar.length} sobreviven · ${retirar.length} se retiran`)
  if (!retirar.length) return
  if (!APLICAR) { console.log('\n  — sin --aplicar no escribo nada\n'); return }

  for (const x of retirar) {
    // La propuesta se va, el MOTIVO se queda: la evidencia guarda por qué la regla de hoy la
    // rechazó, para que nadie tenga que volver a deducirlo.
    await query(
      `update public.obra_actividad
          set propuesta_tarea_tipo_id = null,
              propuesta_evidencia = coalesce(propuesta_evidencia, '{}'::jsonb)
                || jsonb_build_object('retirada_en', now(), 'retirada_veredicto', $2::text,
                                      'retirada_porque', $3::text, 'retirada_por', 'reglas vigentes 27/08/2026')
        where id = $1`, [x.id, x.veredicto, x.porQue])
  }
  console.log(`\n  ✔ ${retirar.length} propuesta(s) retiradas, con su motivo escrito en la evidencia\n`)
}

await main().catch((e) => { console.error('✖', e?.message ?? e); process.exitCode = 1 })
await closePool()
