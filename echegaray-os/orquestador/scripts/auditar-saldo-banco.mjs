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
// ═══ Y DESDE EL 10/09/2026 SE MIDE CONTRA EL BANCO, NO CONTRA SÍ MISMO ═══
//
// La identidad `saldo inicial + Σ importes = último saldo cargado` compara la suma de los importes
// contra un número que —para los "Movimientos del Día"— sale de sumar esos mismos importes. Con el día
// abierto cierra siempre. Este script firmó "✓ todos los saldos cierran" el día en que el saldo
// publicado estaba $38.572.526,23 por encima del real, porque dos depósitos de eCheq retenidos 48 hs
// entraron a la cadena como si fueran plata disponible.
//
// El término independiente es `public.banco_saldo_declarado`: la línea "Saldo al DD/MM/AAAA" del pie
// del extracto, escrita por el banco. La identidad interna se sigue mostrando —ubica el movimiento
// que falta— pero el VEREDICTO lo da el contraste externo.
//
//   node orquestador/scripts/auditar-saldo-banco.mjs
//
// Sale con código 1 si algún saldo no cierra, para que el pipeline lo marque en rojo.

import { query, closePool } from '../lib/db.mjs'
import { auditarCuenta, contrastarConDeclarado } from '../lib/banco-cadena-saldos.mjs'

const $ = (n) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

/** ¿La base ya tiene la marca de retención? El auditor corre en pipelines que pueden ir por delante
 *  de la migración: preguntarlo evita un rojo que no dice nada sobre el saldo. */
async function hayColumnaPendiente() {
  const { rows } = await query(
    `select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'banco_movimientos' and column_name = 'acreditacion_pendiente'`)
  return rows.length > 0
}

async function main() {
  const cuentas = (await query('select distinct cuenta from public.banco_movimientos order by cuenta')).rows
  if (!cuentas.length) { console.log('No hay movimientos de banco cargados: nada que auditar.'); return }
  let malas = 0
  for (const { cuenta } of cuentas) {
    // EL ORDEN DEL EXTRACTO, que es (fecha, id de importación): la cadena depende de él y la identidad no.
    const mov = (await query(
      `select fecha::text, concepto, importe, saldo_despues, referencia,
              ${await hayColumnaPendiente() ? 'acreditacion_pendiente' : 'false as acreditacion_pendiente'}
         from public.banco_movimientos where cuenta = $1 order by fecha, id`,
      [cuenta],
    )).rows
    const { identidad, roturas, culpables, veredicto } = auditarCuenta(mov)
    const declarado = (await query(
      'select fecha::text, saldo from public.banco_saldo_declarado where cuenta = $1 order by fecha desc limit 1',
      [cuenta],
    )).rows[0] ?? null
    const contraste = contrastarConDeclarado(mov, declarado)
    console.log(`\n── cuenta ${cuenta} · ${mov.length} movimientos · ${mov[0]?.fecha} → ${mov[mov.length - 1]?.fecha} ──`)
    if (!identidad) { console.log(`  ${veredicto}`); continue }
    console.log(`  saldo inicial            ${$(identidad.inicial).padStart(18)}`)
    console.log(`  + suma de los importes   ${$(identidad.suma).padStart(18)}`)
    console.log(`  = saldo que debería dar  ${$(identidad.esperado).padStart(18)}`)
    console.log(`  saldo que declara el banco ${$(identidad.declarado).padStart(16)}`)
    // EL VEREDICTO: el contraste contra el banco. La identidad interna queda como pista de DÓNDE mirar.
    if (contraste.estado === 'cierra') {
      console.log(`  ✓ cierra contra el saldo que declara el banco al ${contraste.fecha}: ${$(contraste.declarado)}`
        + (contraste.retenidos ? ` (excluidos ${contraste.retenidos} depósito(s) retenido(s) por ${$(contraste.retenido)})` : ''))
      continue
    }
    if (contraste.estado === 'no_cierra') {
      malas++
      console.log(`  ⚠ NO CIERRA CONTRA EL BANCO al ${contraste.fecha}: declara ${$(contraste.declarado)} `
        + `y los movimientos cargados reconstruyen ${$(contraste.esperado)} (dif ${$(contraste.diferencia)})`)
      if (contraste.retenidos) console.log(`     ya se excluyeron ${contraste.retenidos} depósito(s) retenido(s) por ${$(contraste.retenido)}`)
      console.log('     o falta un movimiento, o hay uno cargado dos veces, o un depósito retenido que el OS no reconoce '
        + '(ver PATRONES_RETENCION en orquestador/lib/banco-acreditacion.mjs).')
    }
    if (contraste.estado !== 'no_cierra') {
      // Sin pie del banco no hay control posible, y decirlo es parte del veredicto: la alternativa es
      // el "✓" mudo que este script firmaba mirando su propio resultado.
      malas++
      console.log(contraste.estado === 'sin_declarado'
        ? '  ⚠ NO PUEDO VERIFICAR: no hay saldo declarado por el banco para esta cuenta. '
          + 'Importá el extracto completo (importar-banco.mjs guarda la línea "Saldo al DD/MM/AAAA").'
        : `  ⚠ NO PUEDO VERIFICAR: no hay ningún movimiento con saldo hasta el ${contraste.fecha}.`)
    }
    if (identidad.cierra) { console.log('  · la cadena interna cierra consigo misma (no prueba nada sobre el banco)'); continue }
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
  console.log(malas
    ? `\n⚠ ${malas} cuenta(s) sin cerrar contra el saldo que declara el banco.`
    : '\n✓ todos los saldos cierran contra el saldo declarado por el banco.')
  if (malas) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) }).finally(() => closePool())
