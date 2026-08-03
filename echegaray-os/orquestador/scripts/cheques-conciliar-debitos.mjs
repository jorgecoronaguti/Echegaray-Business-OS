#!/usr/bin/env node
// ¿QUÉ CHEQUE DE "Cheques Emitidos" YA SALIÓ DE LA CUENTA, SEGÚN EL BANCO?
//
// POR QUÉ (03/08). El FÍSICO 223 de Corralón figuraba "vencido sin debitar" —el tramo que la pestaña
// rotula "averiguar por qué"— y el banco lo había debitado el 20/07 como "Canje interno recibido
// 24 hs". El OS sólo entendía "Cheque debitado": los otros tres conceptos con los que el Santander
// anuncia la misma salida no los leía nadie. Un cheque cobrado se leía como una alerta.
//
// SÓLO LEE. Cruza banco_movimientos (Postgres) contra el registro de la pestaña y dice, cheque por
// cheque, qué cambia y qué NO se puede saber. No escribe la columna DEBITADO: eso es una escritura
// sobre el Flujo de Caja y la decide quien la mira. Este script produce la evidencia para decidirla.
//
//   node orquestador/scripts/cheques-conciliar-debitos.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { conciliarDebitosDeCheques, claveCheque } from '../lib/cheques-debito-banco.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const $ = (n) => `$${Math.round(Math.abs(Number(n) || 0)).toLocaleString('es-AR')}`

/**
 * NÚCLEO PURO: el registro de la pestaña, con la fila física de cada cheque.
 * El registro arranca donde la columna A dice FISICO/ECHEQ, no en una fila fija: la banda de arriba
 * cambia de alto y anclar en un número deja todo corrido una fila.
 * @param {unknown[][]} grid filas crudas desde A1
 */
export function registroDeLaPestana(grid = []) {
  const out = []
  grid.forEach((r, i) => {
    const instrumento = String(r?.[0] ?? '').trim().toUpperCase()
    if (instrumento !== 'FISICO' && instrumento !== 'ECHEQ') return
    out.push({
      instrumento,
      numero: r?.[1],
      beneficiario: String(r?.[4] ?? '').trim(),
      importe: Number(r?.[5]) || 0,
      // DEBITADO es un desplegable SI/No: cualquier cosa que no sea "SI" es "todavía no salió".
      debitado: String(r?.[10] ?? '').trim().toUpperCase() === 'SI',
      fila: i + 1,
    })
  })
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const grid = await google.readSheetValues(ID, `${PESTANA}!A1:M400`, { render: 'UNFORMATTED_VALUE' })
  const registro = registroDeLaPestana(grid)
  const { rows: movs } = await query(
    `select fecha::text, concepto, importe::float8, referencia
       from public.banco_movimientos where importe < 0 order by fecha, id`)

  const { resultados, resumen } = conciliarDebitosDeCheques(movs, registro)
  const deCheques = resultados.filter((r) => r.estado !== 'no_es_debito_de_cheque')
  console.log(`${registro.length} cheques en "${PESTANA}" · ${movs.length} débitos del banco · ${deCheques.length} de ellos son salidas de cheque\n`)

  // ── LO QUE CAMBIA DE ESTADO ──────────────────────────────────────────────────────────────────
  const cambian = resultados.filter((r) => r.estado === 'emparejado' && !r.cheque.debitado)
  const yaEstaban = resumen.emparejados - cambian.length
  console.log('═══ CHEQUES QUE EL BANCO YA DEBITÓ Y LA PESTAÑA DA POR NO DEBITADOS ═══')
  if (!cambian.length) console.log('  ninguno: la columna DEBITADO coincide con el banco')
  for (const r of cambian) {
    console.log(`  ${r.clave.padEnd(12)} ${$(r.cheque.importe).padStart(14)}  ${r.cheque.beneficiario.slice(0, 24).padEnd(26)}`
      + `fila ${String(r.cheque.fila).padStart(3)} · DEBITADO "No" → el banco lo pagó el ${r.mov.fecha} ("${r.mov.concepto}")`)
  }
  console.log(`\n  ${cambian.length} cheque(s) cambian de estado · ${yaEstaban} ya estaban bien marcados`)

  // ── LO QUE NO SE PUEDE SABER: SE DECLARA, NO SE ADIVINA ──────────────────────────────────────
  console.log('\n═══ AMBIGUOS — el banco no alcanza para decidir cuál cheque salió ═══')
  const ambiguos = resultados.filter((r) => r.estado === 'ambiguo')
  if (!ambiguos.length) console.log('  ninguno')
  for (const r of ambiguos) {
    console.log(`  ⚠ ${r.mov.fecha} ref ${String(r.mov.referencia)} ${$(r.mov.importe)} — ${r.motivo}`)
    for (const c of r.candidatos ?? []) console.log(`       candidato ${claveCheque(c)} ${$(c.importe)} ${c.beneficiario ?? ''}`)
  }

  console.log('\n═══ SALIDAS DE CHEQUE QUE NINGÚN CHEQUE DEL REGISTRO EXPLICA ═══')
  const sin = resultados.filter((r) => r.estado === 'sin_cheque' || r.estado === 'sin_referencia')
  if (!sin.length) console.log('  ninguna')
  for (const r of sin) console.log(`  · ${r.mov.fecha} ref ${String(r.mov.referencia ?? '∅')} ${$(r.mov.importe)} "${String(r.mov.concepto).slice(0, 40)}" — ${r.motivo}`)

  console.log(`\nRESUMEN  emparejados ${resumen.emparejados} · ambiguos ${resumen.ambiguos} · sin cheque ${resumen.sin_cheque} · sin referencia ${resumen.sin_referencia}`)
  console.log('Este script NO escribe la pestaña. La columna DEBITADO la aplica quien mira el Flujo de Caja.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
}
