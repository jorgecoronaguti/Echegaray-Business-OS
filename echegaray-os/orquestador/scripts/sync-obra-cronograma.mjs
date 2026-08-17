#!/usr/bin/env node
// EL CRONOGRAMA DE DRIVE ENTRA A LA BASE, CON SUS FECHAS.
//
// Drive/Sheets sigue siendo la fuente operativa: el jefe de obra planifica ahí y no se le cambia la
// herramienta. Lo que hace esto es lo que declara la arquitectura del OS —
// `Drive/Sheets → sincronización → Supabase estructurado → Web / IA / Mattermost` — para que el
// cronograma deje de ser un jsonb sin fechas y pase a ser filas consultables.
//
// ═══ LAS TRES REGLAS QUE LO HACEN SEGURO ═══
//
// 1. NO PISA LO EDITADO A MANO. Una actividad con `editado_a_mano = true` se salta entera. Si
//    alguien corrigió una fecha en la web, esa fecha le gana al tracker.
// 2. NO SELLA BASELINE. `inicio_base`/`fin_base` no se tocan nunca acá. El plan aprobado se congela
//    con un acto explícito; si este script lo reescribiera, el desvío contra baseline daría siempre
//    cero y el módulo entero perdería sentido.
// 3. LO QUE DESAPARECE SE MARCA, NO SE BORRA. `avance_obra` tiene desde hace 14 días una fila
//    fantasma ("Estrella") de una pestaña que ya no existe, porque aquel sync nunca borra ni avisa.
//    Acá las actividades que dejaron de estar en el tracker se reportan; borrarlas es decisión de
//    una persona, no de un timer.
//
//   node orquestador/scripts/sync-obra-cronograma.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/sync-obra-cronograma.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { AVANCE_FILE_ID } from '../lib/avance-fisico.mjs'
import { parsearCronograma } from '../lib/obra-cronograma.mjs'

const APLICAR = process.argv.includes('--aplicar')

/**
 * Pestaña del tracker → obra canónica. Se resuelve por `obra_alias`, que es el mismo camino por el
 * que una compra llega a una obra: una sola tabla de sinónimos para todo el OS, no una segunda.
 * "Personal" no es una obra —es la lista de operarios— y por eso queda afuera declarándolo.
 */
export const PESTANAS_NO_OBRA = ['Personal']

export async function resolverObra(pestana) {
  const { rows } = await query(
    `select a.obra_id from obra_alias a where a.alias = public.norm_obra($1) and a.obra_id is not null`,
    [pestana]
  )
  return rows[0]?.obra_id ?? null
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig() })
  const pestanas = await g.listTabs(AVANCE_FILE_ID)
  console.log(`«Avances de Obra» · ${pestanas.length} pestaña(s): ${pestanas.join(', ')}\n`)

  let totalAct = 0, totalConFecha = 0
  const sinObra = []
  for (const pestana of pestanas) {
    if (PESTANAS_NO_OBRA.includes(pestana)) { console.log(`  — ${pestana}: no es una obra, se saltea`); continue }
    const obraId = await resolverObra(pestana)
    if (!obraId) { sinObra.push(pestana); console.log(`  ✖ ${pestana}: ninguna obra la reclama (falta el alias)`); continue }

    const rows = await g.readSheetValues(AVANCE_FILE_ID, `${pestana}!A1:R300`, { render: 'UNFORMATTED_VALUE' }).catch(() => [])
    const { actividades, motivo } = parsearCronograma(Array.isArray(rows) ? rows : [])
    if (!actividades.length) { console.log(`  — ${pestana} → ${obraId}: ${motivo ?? 'sin actividades'}`); continue }

    const conFecha = actividades.filter((a) => a.inicio_plan).length
    const hitos = actividades.filter((a) => a.tipo === 'hito').length
    const resumen = actividades.filter((a) => a.tipo === 'resumen').length
    console.log(`  ✓ ${pestana} → ${obraId}: ${actividades.length} actividades · ${conFecha} con fecha · ${resumen} de resumen · ${hitos} hito(s)`)
    totalAct += actividades.length; totalConFecha += conFecha

    if (!APLICAR) continue

    // Las editadas a mano ganan: se leen ANTES de escribir y se excluyen del upsert.
    const { rows: mias } = await query(
      `select codigo from obra_actividad where obra_id = $1 and editado_a_mano`, [obraId])
    const protegidas = new Set(mias.map((m) => m.codigo))
    const aEscribir = actividades.filter((a) => !protegidas.has(a.codigo))
    if (protegidas.size) console.log(`      ✋ ${protegidas.size} actividad(es) editadas a mano: no las piso`)

    for (const a of aEscribir) {
      await query(
        `insert into obra_actividad
           (obra_id, codigo, codigo_padre, nombre, tipo, orden, inicio_plan, fin_plan, dias_plan,
            dias_real, pct, estado, cuadrilla, comentario, fuente, fuente_pestana, fuente_fila, sincronizado_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'avances_de_obra_drive',$15,$16, now())
         on conflict (obra_id, codigo) do update set
           codigo_padre = excluded.codigo_padre, nombre = excluded.nombre, tipo = excluded.tipo,
           orden = excluded.orden, inicio_plan = excluded.inicio_plan, fin_plan = excluded.fin_plan,
           dias_plan = excluded.dias_plan, dias_real = excluded.dias_real, pct = excluded.pct,
           estado = excluded.estado, cuadrilla = excluded.cuadrilla, comentario = excluded.comentario,
           fuente_pestana = excluded.fuente_pestana, fuente_fila = excluded.fuente_fila,
           sincronizado_en = now()`,
        [obraId, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.inicio_plan, a.fin_plan,
          a.dias_plan, a.dias_real, a.pct, a.estado, a.cuadrilla, a.comentario, pestana, a.fuente_fila]
      )
    }

    // Lo que ya no está en el tracker se DECLARA. No se borra: el dato puede ser bueno y la pestaña
    // haber cambiado de nombre.
    const codigos = actividades.map((a) => a.codigo)
    const { rows: huerfanas } = await query(
      `select codigo, nombre from obra_actividad
        where obra_id = $1 and fuente_pestana = $2 and not (codigo = any($3::text[]))`,
      [obraId, pestana, codigos])
    for (const h of huerfanas) console.log(`      ⚠ "${h.codigo} ${h.nombre}" ya no está en el tracker — no la borro`)
  }

  if (sinObra.length) {
    console.log(`\n✖ ${sinObra.length} pestaña(s) sin obra: ${sinObra.join(', ')}`)
    console.log('  Cada una es un cronograma que no llega a ninguna pantalla. Se resuelve agregando su alias.')
  }
  console.log(`\n${APLICAR ? '✓ escrito' : '(sin --aplicar)'}: ${totalAct} actividades, ${totalConFecha} con fecha de inicio`)

  if (APLICAR) {
    // LA EVIDENCIA ES DEL EFECTO: se relee de la base, no se confía en el retorno del insert.
    const { rows } = await query(
      `select o.nombre, count(a.*)::int as n, count(a.inicio_plan)::int as con_fecha,
              min(a.inicio_plan) as desde, max(a.fin_plan) as hasta
         from obra_canonica o join obra_actividad a on a.obra_id = o.id
        group by o.nombre order by o.nombre`)
    console.log('\n  releído de la base:')
    for (const r of rows) console.log(`    ${String(r.nombre).padEnd(16)} ${String(r.n).padStart(3)} actividades · ${r.con_fecha} con fecha · ${r.desde ?? '—'} → ${r.hasta ?? '—'}`)
  }
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
