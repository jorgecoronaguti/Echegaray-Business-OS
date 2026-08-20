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
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { AVANCE_FILE_ID, parsearCronograma } from '../lib/obra-cronograma.mjs'

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
    //
    // POR CLAVE, NO POR POSICIÓN. Cuando la clave era el renglón, este candado protegía a la
    // actividad EQUIVOCADA en cuanto alguien insertaba una fila en el tracker: la fila 57 editada a
    // mano dejaba de ser la misma actividad, y el sync le escribía encima a la de al lado creyendo
    // que respetaba algo. Ver `claveDe()` en lib/obra-cronograma.mjs.
    const { rows: mias } = await query(
      `select clave from obra_actividad where obra_id = $1 and editado_a_mano`, [obraId])
    const protegidas = new Set(mias.map((m) => m.clave))
    const aEscribir = actividades.filter((a) => !protegidas.has(a.clave))
    if (protegidas.size) console.log(`      ✋ ${protegidas.size} actividad(es) editadas a mano: no las piso`)

    for (const a of aEscribir) {
      await query(
        `insert into obra_actividad
           (obra_id, clave, seccion, codigo, codigo_padre, nombre, tipo, orden, inicio_plan, fin_plan,
            dias_plan, dias_real, pct, estado, cuadrilla, comentario, fuente, fuente_pestana, fuente_fila, sincronizado_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'avances_de_obra_drive',$17,$18, now())
         on conflict (obra_id, clave) do update set
           seccion = excluded.seccion, codigo = excluded.codigo, codigo_padre = excluded.codigo_padre,
           nombre = excluded.nombre, tipo = excluded.tipo,
           orden = excluded.orden, inicio_plan = excluded.inicio_plan, fin_plan = excluded.fin_plan,
           dias_plan = excluded.dias_plan, dias_real = excluded.dias_real, pct = excluded.pct,
           estado = excluded.estado, cuadrilla = excluded.cuadrilla, comentario = excluded.comentario,
           fuente_pestana = excluded.fuente_pestana, fuente_fila = excluded.fuente_fila,
           sincronizado_en = now()`,
        [obraId, a.clave, a.seccion, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.inicio_plan,
          a.fin_plan, a.dias_plan, a.dias_real, a.pct, a.estado, a.cuadrilla, a.comentario, pestana, a.fuente_fila]
      )
    }

    // Lo que ya no está en el tracker se DECLARA. No se borra: el dato puede ser bueno y la pestaña
    // haber cambiado de nombre. Con la clave por contenido, acá aparece además todo lo que alguien
    // RENOMBRÓ en el tracker — que es exactamente lo que queremos ver antes de que se propague solo.
    const claves = actividades.map((a) => a.clave)
    const { rows: huerfanas } = await query(
      `select clave, nombre from obra_actividad
        where obra_id = $1 and fuente_pestana = $2 and not (clave = any($3::text[]))`,
      [obraId, pestana, claves])
    for (const h of huerfanas) console.log(`      ⚠ "${h.nombre}" (${h.clave}) ya no está en el tracker — no la borro`)
  }

  if (sinObra.length) {
    console.log(`\n✖ ${sinObra.length} pestaña(s) sin obra: ${sinObra.join(', ')}`)
    console.log('  Cada una es un cronograma que no llega a ninguna pantalla. Se resuelve agregando su alias.')
  }
  console.log(`\n${APLICAR ? '✓ escrito' : '(sin --aplicar)'}: ${totalAct} actividades, ${totalConFecha} con fecha de inicio`)

  if (APLICAR) {
    // LA EVIDENCIA ES DEL EFECTO: se relee de la base —y del avance canónico, que es lo que van a
    // ver las pantallas—, no se confía en el retorno del insert.
    const { rows } = await query(
      `select obra, n_actividades, n_medidas, n_sin_planificar, avance_pct, desde, hasta
         from obra_avance where n_actividades > 0 order by obra`)
    console.log('\n  releído de la base (vista obra_avance, la que leen todos):')
    for (const r of rows) {
      console.log(`    ${String(r.obra).padEnd(16)} ${String(r.avance_pct ?? '—').padStart(3)}% · ` +
        `${r.n_medidas}/${r.n_actividades} medidas · ${r.n_sin_planificar} sin planificar · ${r.desde ?? '—'} → ${r.hasta ?? '—'}`)
    }
    // La frescura la alimentaba `sync-avance-obra.mjs`, que se dio de baja. Sin esto el archivo de
    // Avances de Obra empezaría a figurar atrasado justo cuando el OS lo está leyendo todos los días.
    const fr = await registrarSincronizacion({ query }, { driveFileId: AVANCE_FILE_ID })
    console.log(fr.ok ? `\n  frescura: "${fr.nombre}" → ${fr.estado}` : `\n  frescura no registrada: ${fr.motivo}`)
  }
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
