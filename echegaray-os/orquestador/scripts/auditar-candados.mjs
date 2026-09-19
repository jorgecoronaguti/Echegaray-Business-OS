#!/usr/bin/env node
// ¿QUÉ PESTAÑAS ESTÁN CANDADAS, Y CUÁLES LO ESTÁN POR ALGO QUE HIZO EL OS?
//
// El dueño perdió trabajo seis veces por generadores que pisaron sus ediciones, así que el candado
// falla hacia el lado cerrado y eso está bien. El problema es el otro extremo: una pestaña candada
// deja de actualizarse, y si el motivo es una edición que el dueño nunca hizo, se congela un cuadro
// vivo sin que nadie se entere. Pasó con "Cash Flow Mensual": tres días congelada por 45 celdas que
// había escrito el propio OS, y la corrección de la nómina de administración no llegaba a ella.
//
// Este auditor no levanta ningún candado. Muestra, para cada pestaña candada automáticamente, si las
// diferencias contra el snapshot del OS las escribió una persona o un generador. La decisión sigue
// siendo del dueño; lo que cambia es que se toma mirando la evidencia.
//
//   node orquestador/scripts/auditar-candados.mjs
//   node orquestador/scripts/auditar-candados.mjs --detalle

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { diferencias, veredicto, resumen } from '../lib/candado-falso.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DETALLE = process.argv.includes('--detalle')

const ICONO = { falso: '⚠', real: '✋', desconocido: '?', 'sin-cambios': '⚠' }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const { rows: candados } = await query(
    'select pestana, bloqueada_por, motivo, bloqueada_en from sheet_pestanas_bloqueadas where file_id = $1 order by bloqueada_en', [ID])
  if (!candados.length) { console.log('no hay ninguna pestaña candada'); return }

  const auto = candados.filter((c) => c.bloqueada_por === 'auto')
  const suyos = candados.filter((c) => c.bloqueada_por !== 'auto')

  console.log(`${candados.length} pestaña(s) candada(s): ${auto.length} automática(s) y ${suyos.length} que tomaste vos o el OS a propósito.\n`)
  if (suyos.length) {
    console.log('LAS QUE SON TUYAS POR DECISIÓN — no se auditan, no se tocan:')
    for (const c of suyos) console.log(`  ✋ ${c.pestana.padEnd(22)} ${c.motivo.slice(0, 90)}`)
    console.log('')
  }
  if (!auto.length) return

  console.log('LAS AUTOMÁTICAS — ¿la diferencia la escribió una persona o un generador?\n')
  const falsos = []
  for (const c of auto) {
    const { rows } = await query('select grid from sheet_tab_firma where file_id = $1 and pestana = $2', [ID, c.pestana])
    const crudo = rows[0]?.grid
    const delOS = crudo ? (typeof crudo === 'string' ? JSON.parse(crudo) : crudo) : null
    const vivo = await google.readSheetValues(ID, `'${c.pestana}'!A1:BZ400`, { render: 'FORMULA' }).catch(() => null)

    if (!vivo) { console.log(`  ? ${c.pestana.padEnd(22)} no pude leerla`); continue }
    const diffs = delOS ? diferencias(vivo, delOS) : []
    // Los rótulos que el OS ya escribía antes NO cuentan como texto pegado: si el mismo texto está en
    // el snapshot en cualquier parte, es nuestro.
    const rotulosDelOS = new Set((delOS ?? []).flat().map((v) => String(v ?? '').trim()).filter(Boolean))
    const v = veredicto({ diffs, huboSnapshot: Boolean(delOS), rotulosDelOS })

    console.log(`  ${ICONO[v.veredicto]} ${c.pestana.padEnd(22)} ${v.veredicto.toUpperCase().padEnd(13)} ${v.motivo}`)
    if (v.veredicto === 'falso' || v.veredicto === 'sin-cambios') falsos.push(c.pestana)
    if (DETALLE && diffs.length) {
      for (const r of resumen(diffs)) {
        console.log(`        fila ${String(r.fila).padStart(3)} · cols ${r.cols.join(',')}${r.pegada ? ' · ✋ PEGADA' : ''} · ${r.muestra}`)
      }
      if (diffs.length > 8) console.log(`        …y ${diffs.length - 8} diferencia(s) más`)
    }
  }

  if (falsos.length) {
    console.log(`\n⚠ ${falsos.length} candado(s) SIN sustento: ${falsos.join(', ')}`)
    console.log('  Esas pestañas están congeladas por una edición que vos no hiciste. Decime cuál destrabo')
    console.log('  y la vuelvo a poner en el circuito; la fusión celda a celda sigue protegiendo lo tuyo.')
  } else {
    console.log('\n✓ todos los candados automáticos tienen sustento: hay ediciones tuyas detrás de cada uno.')
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
