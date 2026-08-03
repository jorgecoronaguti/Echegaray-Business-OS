#!/usr/bin/env node
// ¿EL SALDO DEL BANCO CIERRA? El control que faltaba sobre el número del que cuelga todo el archivo.
//
// El dueño: "está mal el saldo de caja en todos lados". CAJA muestra el saldo que declara el extracto en
// su último movimiento —es el dato del banco, no un invento— pero el extracto CARGADO puede tener un
// agujero, y de ese saldo cuelgan CAJA_TOTAL_DISPONIBLE, el efectivo inicial de los dos cash flow, el
// piso proyectado y las decisiones de pago. Un agujero acá se propaga a todas las pantallas en silencio.
//
// No arregla nada: no puede. Un movimiento que falta sólo lo tiene el banco. Dice CUÁNTO falta y DÓNDE
// mirar, que es lo que convierte una desconfianza en trabajo.
//
//   node orquestador/scripts/auditar-saldo-banco.mjs
//
// Sale con código 1 si algún saldo no cierra, para que el pipeline lo marque en rojo.

import { query, closePool } from '../lib/db.mjs'
import { auditarCuenta } from '../lib/banco-cadena-saldos.mjs'

const $ = (n) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

async function main() {
  const cuentas = (await query('select distinct cuenta from public.banco_movimientos order by cuenta')).rows
  if (!cuentas.length) { console.log('No hay movimientos de banco cargados: nada que auditar.'); return }
  let malas = 0
  for (const { cuenta } of cuentas) {
    // EL ORDEN DEL EXTRACTO, que es (fecha, id de importación): la cadena depende de él y la identidad no.
    const mov = (await query(
      'select fecha::text, concepto, importe, saldo_despues, referencia from public.banco_movimientos where cuenta = $1 order by fecha, id',
      [cuenta],
    )).rows
    const { identidad, roturas, culpables, veredicto } = auditarCuenta(mov)
    console.log(`\n── cuenta ${cuenta} · ${mov.length} movimientos · ${mov[0]?.fecha} → ${mov[mov.length - 1]?.fecha} ──`)
    if (!identidad) { console.log(`  ${veredicto}`); continue }
    console.log(`  saldo inicial            ${$(identidad.inicial).padStart(18)}`)
    console.log(`  + suma de los importes   ${$(identidad.suma).padStart(18)}`)
    console.log(`  = saldo que debería dar  ${$(identidad.esperado).padStart(18)}`)
    console.log(`  saldo que declara el banco ${$(identidad.declarado).padStart(16)}`)
    if (identidad.cierra) { console.log('  ✓ cierra: no falta ni sobra un movimiento'); continue }
    malas++
    console.log(`  ⚠ FALTA ${$(Math.abs(identidad.diferencia))} — el saldo del banco NO es la suma de los movimientos cargados`)
    // Las roturas que se compensan son desorden intradía: se cuentan, no se listan.
    console.log(`  la cadena se corta en ${roturas.length} punto(s); ${culpables.length} coincide(n) con el monto que falta:`)
    for (const c of culpables.slice(0, 5)) {
      console.log(`     ${c.fecha} · "${c.concepto.slice(0, 44)}" · ref ${c.referencia ?? '—'} · ${$(c.diferencia)}`)
    }
    if (!culpables.length) {
      console.log('     ninguna sola lo explica: el agujero está repartido, o hay un movimiento cargado dos veces.')
    }
    console.log('  ⇒ el saldo que muestra CAJA es el del extracto; para que sea el REAL falta cargar ese movimiento.')
  }
  console.log(malas ? `\n⚠ ${malas} cuenta(s) con el saldo sin cerrar.` : '\n✓ todos los saldos cierran contra sus movimientos.')
  if (malas) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) }).finally(() => closePool())
