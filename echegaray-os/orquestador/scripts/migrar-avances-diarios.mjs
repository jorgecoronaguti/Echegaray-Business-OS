#!/usr/bin/env node
// LA GRILLA DIARIA DE «AVANCES DE OBRA» → `obra_ejecucion`.
//
//   node orquestador/scripts/migrar-avances-diarios.mjs             # informa
//   node orquestador/scripts/migrar-avances-diarios.mjs --aplicar
//
// El Excel lleva, a la derecha del cronograma, una columna por día con el avance de ESE día. Es el
// único registro histórico de CUÁNDO avanzó cada actividad, y no se puede reconstruir desde el
// `% Done` acumulado. Se trae tal cual.
//
// ═══ LA FILA SE EMPAREJA POR SU ORIGEN, NO POR SU NOMBRE ═══
//
// `obra_actividad` guarda de dónde vino cada actividad —`fuente_pestana` y `fuente_fila`—, así que
// el emparejamiento es exacto y no hay que adivinar por nombre. Una fila del Excel que no tenga su
// actividad en la base NO se migra: se declara. Inventar la actividad para poder colgarle el parte
// sería crear trabajo que nadie planificó.
//
// ═══ NO SE APAGA EL SHEET ═══
//
// Esto es la transición: el histórico entra a la base y los datos NUEVOS se cargan por la web. La
// migración es idempotente —un índice único impide que la misma celda entre dos veces— así que se
// puede re-correr mientras las dos cosas convivan.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { AVANCE_FILE_ID, ubicarColumnas, parsePct } from '../lib/obra-cronograma.mjs'
import { coherencia, fechasDelCalendario, partesDeLaFila } from '../lib/avances-grilla.mjs'

const enSeco = !process.argv.includes('--aplicar')
const PESTANAS_NO_OBRA = ['Personal']

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WORKSPACE_SCOPES })
  const pestanas = (await google.listTabs(AVANCE_FILE_ID)).filter((p) => !PESTANAS_NO_OBRA.includes(p))
  const { rows: actividades } = await query(
    `select id, obra_id, nombre, fuente_pestana, fuente_fila, pct
       from obra_actividad where fuente_pestana is not null and fuente_fila is not null`)
  const porOrigen = new Map(actividades.map((a) => [`${a.fuente_pestana}#${a.fuente_fila}`, a]))

  const partesTodos = []
  const sinActividad = []
  const discrepan = []

  for (const pestana of pestanas) {
    const rows = await google.readSheetValues(AVANCE_FILE_ID, `${pestana}!A1:CZ300`,
      { render: 'UNFORMATTED_VALUE' }).catch(() => [])
    const col = ubicarColumnas(rows)
    if (!col) { console.log(`  — ${pestana}: sin encabezado reconocible`); continue }
    // El calendario arranca después de la última columna del bloque de la izquierda.
    const finIzquierda = Math.max(col.act, col.ini, col.fin, col.dias, col.diasReales, col.estado,
      col.pct, col.comentario) + 1
    const fechas = fechasDelCalendario(rows[col.header] ?? [], finIzquierda)
    if (fechas.length === 0) { console.log(`  — ${pestana}: no tiene calendario diario`); continue }

    let conPartes = 0
    for (let i = col.header + 1; i < rows.length; i++) {
      const fila = rows[i] ?? []
      const partes = partesDeLaFila(fila, fechas)
      if (partes.length === 0) continue
      // `fuente_fila` la escribió el sincronizador con el mismo índice base 1 de la planilla.
      const actividad = porOrigen.get(`${pestana}#${i + 1}`)
      if (!actividad) {
        sinActividad.push({ pestana, fila: i + 1, nombre: String(fila[col.act] ?? '').trim(), partes: partes.length })
        continue
      }
      const { suma, diferencia } = coherencia(partes, parsePct(fila[col.pct]))
      if (diferencia !== null && Math.abs(diferencia) > 1) {
        discrepan.push({ obra: actividad.obra_id, nombre: actividad.nombre, suma, declarado: parsePct(fila[col.pct]) })
      }
      conPartes++
      for (const p of partes) partesTodos.push({ actividad, ...p })
    }
    console.log(`  ✓ ${pestana}: ${conPartes} actividades con grilla diaria`)
  }

  console.log(`\nPARTES DIARIOS       ${partesTodos.length}`)
  console.log(`FILAS SIN ACTIVIDAD  ${sinActividad.length} — no se migran`)
  for (const s of sinActividad.slice(0, 12)) console.log(`  · ${s.pestana} fila ${s.fila}: «${s.nombre}» (${s.partes} partes)`)
  console.log(`\nLA GRILLA NO CIERRA CON EL % DECLARADO (${discrepan.length}) — se migra la grilla y se declara:`)
  for (const d of discrepan.slice(0, 15)) console.log(`  · ${d.obra} · ${d.nombre}: grilla ${d.suma}% vs declarado ${d.declarado}%`)

  if (enSeco) { console.log('\nEN SECO. Nada se escribió. Para aplicar: --aplicar\n'); return }

  let escritos = 0
  for (const p of partesTodos) {
    const { rowCount } = await query(
      `insert into obra_ejecucion (obra_id, actividad_id, fecha, avance_pct, fuente)
       values ($1, $2, $3, $4, 'avances_de_obra_drive')
       on conflict (actividad_id, fecha) where fuente = 'avances_de_obra_drive' do nothing`,
      [p.actividad.obra_id, p.actividad.id, p.fecha, p.pct])
    escritos += rowCount ?? 0
  }
  console.log(`\n✓ ${escritos} partes migrados · ${partesTodos.length - escritos} ya estaban\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
