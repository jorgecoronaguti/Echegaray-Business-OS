#!/usr/bin/env node
// SINCRONIZA EL DEBITADO DE LOS ECHEQ DE "Cheques Emitidos" CONTRA EL BANCO (fuente única).
//
// POR QUÉ (22/07). El dueño trajo la consulta completa de echeq emitidos del Santander y pidió que el
// DEBITADO de la pestaña quede bien "en todos los casos". El estado de un echeq (Pagado = ya salió de
// la cuenta / Aceptado = todavía no) lo sabe el BANCO, no una marca a mano — y la pestaña tenía al 305
// como "No" cuando el banco ya lo había pagado, inflando el outstanding en $893.098,79.
//
// QUÉ HACE, y qué NO. Toma la lista `ECHEQS_EMITIDOS` de banco-santander.mjs (la fuente) y, por número
// de echeq, escribe en la columna DEBITADO: Pagado→"SI", Aceptado→"No". Agrega los echeq del banco que
// falten en la pestaña (con DEBITADO ya correcto). NO toca los cheques FÍSICOS (el banco no los lista
// acá) ni los echeq que la pestaña tiene y el banco no (posteriores al corte). Los MUERTOS —anulado,
// repudiado— no se agregan ni se marcan como outstanding: un repudiado suele ser un duplicado de uno
// que sí se pagó (el 281 es el gemelo del 282), y contarlo sería inventar una deuda que no existe.
//
// Es idempotente: si el DEBITADO ya está bien y los echeq ya están, no escribe nada.
//
//   node orquestador/scripts/cheques-emitidos-sync-banco.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { ECHEQS_EMITIDOS } from '../lib/banco-santander.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')

const norm = (n) => String(n ?? '').replace(/\D/g, '').replace(/^0+/, '')
const isoAar = (s) => { const [a, m, d] = String(s).split('-'); return `${d}/${m}/${a}` }
// La columna DEBITADO es un desplegable estricto SI/No: hay que respetar la mayúscula exacta.
const debitadoDe = (estado) => (estado === 'Pagado' ? 'SI' : estado === 'Aceptado' ? 'No' : null)

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const banco = new Map(ECHEQS_EMITIDOS.map((e) => [norm(e.numero), e]))

  // El registro empieza después de la banda-resumen. Se ubica el encabezado por su rótulo "TIPO",
  // así no depende de cuántas filas tenga la banda.
  const col = await google.readSheetValues(ID, `${PESTANA}!A1:A20`)
  const filaHdr = col.findIndex((r) => String(r[0]).toUpperCase() === 'TIPO') + 1 || 1
  const grid = await google.readSheetValues(ID, `${PESTANA}!A${filaHdr + 1}:M400`)

  const enPest = new Set()
  const updates = []
  let ultima = filaHdr
  grid.forEach((r, i) => {
    const fila = filaHdr + 1 + i
    if (r[0] || r[1]) ultima = fila
    if (String(r[0]).toUpperCase() !== 'ECHEQ') return
    const nro = norm(r[1]); enPest.add(nro)
    const b = banco.get(nro); if (!b) return
    const k = debitadoDe(b.estado); if (!k) return
    if (String(r[10] ?? '') !== k) updates.push({ fila, nro, de: r[10] || '∅', a: k })
  })

  const faltan = [...banco.values()].filter((e) => !enPest.has(norm(e.numero)))
  const agregar = faltan.filter((e) => debitadoDe(e.estado)) // sólo pagados/aceptados; muertos no
  const muertos = faltan.filter((e) => !debitadoDe(e.estado))

  console.log(`${PESTANA}: ${updates.length} DEBITADO a corregir · ${agregar.length} echeq a agregar · ${muertos.length} muertos (no se agregan)`)
  updates.forEach((u) => console.log(`  fila${u.fila} echeq ${u.nro}: ${u.de} → ${u.a}`))
  agregar.forEach((e) => console.log(`  + ${norm(e.numero)} ${e.beneficiario} $${e.importe} ${e.estado}`))
  muertos.forEach((e) => console.log(`  (muerto) ${norm(e.numero)} ${e.beneficiario} ${e.estado}`))
  if (DRY || (!updates.length && !agregar.length)) { if (DRY) console.log('(--dry)'); else console.log('nada que sincronizar'); return }

  const data = updates.map((u) => ({ range: `${PESTANA}!K${u.fila}`, values: [[u.a]] }))
  if (agregar.length) {
    const nuevas = agregar.map((e) => ['ECHEQ', norm(e.numero), '', '', e.beneficiario, e.importe, '', '', isoAar(e.pago), '', debitadoDe(e.estado), '', 'agregado del banco'])
    data.push({ range: `${PESTANA}!A${ultima + 1}`, values: nuevas })
  }
  await google.batchUpdateValues(ID, data)
  console.log(`✔ ${updates.length} corregidos + ${agregar.length} agregados`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
