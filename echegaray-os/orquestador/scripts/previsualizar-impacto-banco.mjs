#!/usr/bin/env node
// PREVISUALIZAR EL IMPACTO DE UN EXTRACTO — EN FRÍO, SIN TOCAR NADA.
//
// POR QUÉ EXISTE. La puerta de verdad es importar-banco.mjs, que escribe en la base. Este script NO
// escribe, NO se conecta a la base, NO toca el Sheet y NO usa red: lee un texto pegado (CSV, extracto
// o el texto sacado de una captura por OCR), lo parsea con el MISMO parser del importador, verifica la
// cadena de saldos y muestra a QUÉ PESTAÑAS del "Flujo de Caja - Cash Flow" va a impactar cada
// movimiento. Es la herramienta para responder "si cargo esto, ¿qué se mueve?" antes de cargarlo, y
// para validar en frío el texto de una captura sin riesgo — cumple la regla de oro de no correr nada
// contra el Sheet real para probar.
//
//   node orquestador/scripts/previsualizar-impacto-banco.mjs extracto.csv
//   cat captura.txt | node orquestador/scripts/previsualizar-impacto-banco.mjs
//   pbpaste | node orquestador/scripts/previsualizar-impacto-banco.mjs
//
// Reusa lib/banco-importar.mjs (parser + cadena) y lib/impacto-bancario.mjs (mapa de impacto). No
// duplica ningún motor: es una vista.

import { readFileSync } from 'node:fs'
import { parsearExtracto, verificarCadena } from '../lib/banco-importar.mjs'
import { resumirImpacto, creditosParaConciliar, IMPACTO_UNIVERSAL } from '../lib/impacto-bancario.mjs'

const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))
const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

function leerEntrada() {
  if (ARCHIVO) return readFileSync(ARCHIVO, 'utf8')
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

function main() {
  const texto = leerEntrada()
  if (!texto.trim()) {
    console.log('Pasame un extracto. Uso:')
    console.log('  node orquestador/scripts/previsualizar-impacto-banco.mjs extracto.csv')
    console.log('  cat captura.txt | node orquestador/scripts/previsualizar-impacto-banco.mjs')
    process.exitCode = 1
    return
  }

  const { movimientos, rechazos } = parsearExtracto(texto)
  console.log(`\n📄 ${movimientos.length} movimiento(s) leído(s)${rechazos.length ? ` · ${rechazos.length} línea(s) que no entendí` : ''}`)
  for (const r of rechazos.slice(0, 8)) console.log(`   ⚠ línea ${r.linea}: ${r.motivo} — "${r.texto}"`)
  if (!movimientos.length) { console.error('no reconocí ningún movimiento: revisá el formato'); process.exitCode = 1; return }

  // La cadena de saldos: el único control que atrapa un signo o un importe mal leído de una captura.
  const { ok, cortes } = verificarCadena(movimientos, null)
  if (ok) console.log('✓ la cadena de saldos cierra de punta a punta (sin typos ni signos invertidos detectables)')
  else {
    console.log(`\n⚠ la cadena de saldos NO cierra en ${cortes.length} punto(s) — revisá el signo/importe ANTES de importar:`)
    for (const c of cortes.slice(0, 6)) {
      console.log(`   ${c.fecha} · ${String(c.concepto).slice(0, 44)} · esperaba ${$(c.esperado)} y dice ${$(c.declarado)} (${$(c.diferencia)})`)
    }
    console.log('   En capturas, la causa #1 es un débito mostrado en rojo sin signo menos: quedó POSITIVO.')
  }

  // El impacto, agrupado por pestaña destino.
  console.log('\n🎯 IMPACTO EN EL SHEET (qué se va a mover si cargás esto)')
  console.log('   Universal (siempre, por fórmula contra _BANCO_RAW):')
  for (const e of IMPACTO_UNIVERSAL) console.log(`   · ${e.pestaña}: ${e.seccion}`)
  console.log('\n   Por naturaleza de los movimientos:')
  for (const g of resumirImpacto(movimientos)) {
    const marca = g.escribe === 'no' ? '(el saldo lo absorbe)' : g.escribe === 'concilia' ? '(se concilia)' : `(escribe: ${g.escribe})`
    console.log(`   · ${g.pestaña.padEnd(28)} ← ${g.bucket} · ${g.cantidad} mov · ${$(g.monto)} ${marca}`)
  }

  // La conciliación de créditos: sólo 'cobranza' se compara contra Cobranzas.
  const cr = creditosParaConciliar(movimientos)
  const tot = (l) => l.reduce((s, m) => s + (Number(m.importe) || 0), 0)
  if (cr.cobranza.length || cr.traslado.length || cr.financiero.length) {
    console.log('\n💧 CRÉDITOS (un crédito NO es automáticamente un ingreso nuevo — el saldo ya lo contiene):')
    console.log(`   · cobranza  ${$(tot(cr.cobranza))}  → ÚNICO grupo que se compara contra Cobranzas`)
    console.log(`   · traslado  ${$(tot(cr.traslado))}  → plata propia cambiando de lugar (depósito, echeq en cartera)`)
    console.log(`   · financiero ${$(tot(cr.financiero))}  → rescate de inversión / préstamo — no es ingreso operativo`)
  }

  console.log('\n— previsualización en frío: NO escribí nada. Para cargar de verdad: importar-banco.mjs')
}

main()
