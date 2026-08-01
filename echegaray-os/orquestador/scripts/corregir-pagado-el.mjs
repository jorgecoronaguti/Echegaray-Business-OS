#!/usr/bin/env node
// CORRIGE LA COLUMNA "Pagado el" DEL REGISTRO DE QUINCENAS, QUE ESTABA CORRIDA UNA FILA.
//
// El diagnóstico completo está en lib/pagado-el-corrido.mjs. En una línea: cada quincena tenía la
// fecha de pago de la SIGUIENTE, así que todo el cash flow imputaba la nómina dos semanas tarde y
// AF15 (semana del 27/07) mostraba $15.475.250 donde salieron $8.248.000.
//
// ESTA COLUMNA ES DEL DUEÑO — ningún generador la escribe. Por eso este script:
//   · la lee, detecta el corrimiento y NO hace nada si no lo hay (idempotente);
//   · contrasta las fechas corregidas contra los lotes de "Pago haberes" del extracto del Santander,
//     que es la única fuente sobre cuándo salió la plata de verdad;
//   · muestra celda por celda qué va a cambiar;
//   · escribe SÓLO esa columna, y sólo con --aplicar.
//
//   node orquestador/scripts/corregir-pagado-el.mjs            (mira y no toca)
//   node orquestador/scripts/corregir-pagado-el.mjs --aplicar

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectarCorrimiento, corregir, cambios, contraBanco } from '../lib/pagado-el-corrido.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const EXTRACTO = process.env.ORQ_EXTRACTO || new URL('../datos/extracto-santander-2026-07-31.csv', import.meta.url).pathname
const APLICAR = process.argv.includes('--aplicar')

const fecha = (s) => (Number.isFinite(s) && s > 40000
  ? new Date(Date.UTC(1899, 11, 30) + s * 86400000).toISOString().slice(0, 10) : '—')
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/** Los días en que el extracto muestra un lote de haberes. Es el control que no sale de la planilla. */
function lotesDeHaberes(ruta) {
  let txt = ''
  try { txt = readFileSync(ruta, 'latin1') } catch { return [] }
  const dias = new Set()
  for (const l of txt.split(/\r?\n/)) {
    const c = l.split(';')
    if (c.length < 8 || !/haberes/i.test(c[5] ?? '')) continue
    const [d, m, a] = String(c[0]).split('/').map(Number)
    if (!a) continue
    dias.add(Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000))
  }
  return [...dias]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // El registro: se ubica por el encabezado, no por un número de fila. Este archivo ya se rompió una
  // vez por anclar en la posición — y fue justamente esta columna.
  const grid = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:N400`, { render: 'UNFORMATTED_VALUE' })
  const cab = grid.findIndex((f) => String(f?.[0] ?? '').trim() === 'Quincena' && String(f?.[13] ?? '').trim() === 'Pagado el')
  if (cab < 0) throw new Error(`no encontré el encabezado del registro ("Quincena" … "Pagado el") en "${PESTAÑA}"`)

  const filas = []
  for (let i = cab + 1; i < grid.length; i++) {
    const f = grid[i] || []
    if (!Number.isFinite(f[0]) || !Number.isFinite(f[1])) break // el total corta el bloque
    filas.push({
      fila: i + 1,
      quincena: `${fecha(f[0]).slice(5)}–${fecha(f[1]).slice(5)}`,
      sePagaEl: Number.isFinite(f[2]) ? f[2] : NaN,
      pagadoEl: Number.isFinite(f[13]) ? f[13] : '',
      total: Number(f[10]) || 0,
    })
  }
  console.log(`${filas.length} quincena(s) en el registro, desde la fila ${filas[0]?.fila}\n`)

  const d = detectarCorrimiento(filas)
  console.log(`coincidencias con la fecha de la quincena SIGUIENTE: ${d.coinciden}/${d.comparables} · con la propia: ${d.propias}`)
  if (!d.corrido) {
    console.log('\n✓ la columna "Pagado el" NO está corrida: no hay nada que corregir.')
    return
  }
  console.log('⚠ la columna está CORRIDA una fila: cada quincena tiene la fecha de pago de la siguiente.\n')

  const nuevos = corregir(filas)
  const lotes = lotesDeHaberes(EXTRACTO)
  console.log(`extracto: ${lotes.length} día(s) con lote de "Pago haberes" — ${lotes.map(fecha).join(' · ')}`)
  const antes = contraBanco(filas, filas.map((f) => f.pagadoEl), lotes)
  const despues = contraBanco(filas, nuevos, lotes)
  console.log(`  quincenas cuyo lote del banco calza con su fecha de pago:  antes ${antes.calzan}/${antes.calzan + antes.noCalzan} · después ${despues.calzan}/${despues.calzan + despues.noCalzan}`)
  if (despues.calzan <= antes.calzan) {
    console.error('\n✖ la corrección NO mejora el calce contra el banco: no la aplico.')
    process.exit(1)
  }

  console.log('\nlo que cambia:')
  const cs = cambios(filas, nuevos)
  for (const c of cs) {
    const f = filas[c.i]
    console.log(`  fila ${String(f.fila).padStart(3)} · ${f.quincena} · ${ars(f.total).padStart(13)} · ${fecha(c.de)} → ${fecha(c.a)}`)
  }

  if (!APLICAR) { console.log(`\n(${cs.length} celda(s). Nada escrito: corré con --aplicar)`); return }

  // ═══ ACÁ SE PISA UNA COLUMNA DEL DUEÑO, A PROPÓSITO Y DECLARADO ═══
  //
  //   respetar: false — y el motivo, que es el único que justifica hacerlo.
  //
  // La Regla 0 dice que lo que el dueño escribe a mano gana. Esta corrección la viola de frente y
  // tiene que hacerlo: la columna está CORRIDA UNA FILA ENTERA, y "respetar" catorce fechas que
  // pertenecen todas a la quincena de al lado es preservar el defecto. Respetar el dato del dueño
  // significa respetar lo que él quiso decir —qué quincena se pagó cuándo—, no las coordenadas en
  // las que quedaron después de que YO las restaurara mal el 31/07.
  //
  // Lo que hace que esto no sea un cheque en blanco:
  //   · no se escribe nada si `detectarCorrimiento` no encuentra el patrón (idempotente);
  //   · no se escribe nada si la corrección no MEJORA el calce contra los lotes del extracto, que es
  //     una fuente ajena a la planilla;
  //   · se imprime celda por celda qué cambia, y hace falta --aplicar;
  //   · el rango es UNA columna del bloque, ubicada por encabezado. Ni una celda más de la pestaña.
  const r0 = filas[0].fila
  await google.updateSheetValues(ID, `'${PESTAÑA}'!N${r0}:N${r0 + filas.length - 1}`,
    nuevos.map((v) => [v === '' ? '' : v]), { yaGuardado: true, respetar: false })

  const ver = await google.readSheetValues(ID, `'${PESTAÑA}'!N${r0}:N${r0 + filas.length - 1}`, { render: 'UNFORMATTED_VALUE' })
  const mal = nuevos.filter((v, i) => String(ver[i]?.[0] ?? '') !== String(v))
  console.log(mal.length ? `\n✖ ${mal.length} celda(s) no quedaron como pedí` : `\n✓ escrito y verificado contra el Sheet: ${cs.length} celda(s)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
