#!/usr/bin/env node
// LA PUERTA DE ENTRADA DEL EXTRACTO. Pegás lo que baja el banco y entra al OS.
//
// POR QUÉ EXISTE (23/07). El dueño: "a diario y quizás dos veces por día te tengo que cargar los
// movimientos bancarios vía archivo csv o capturas de pantalla, como se ha venido haciendo, y esto
// debe impactar en TODO el sheet conforme corresponde, no sólo en la pestaña CAJA".
//
// El IMPACTO ya estaba resuelto: la réplica `_BANCO_RAW` vive adentro del archivo y de ahí cuelgan
// por fórmula la disponibilidad de CAJA, el impuesto al cheque y los costos bancarios de Impuestos,
// y el cruce de Cheques. Lo que no existía era la PUERTA: los 127 movimientos estaban ESCRITOS A
// MANO en `lib/banco-santander.mjs`. Cargar el extracto del día significaba que yo editara
// JavaScript. Un dato operativo que sólo se actualiza tocando el código no se actualiza: envejece.
//
// ═══ QUÉ HACE, EN ORDEN, Y POR QUÉ ESE ORDEN ═══
//
//   1. Aplica la migración (idempotente) y SIEMBRA los 127 movimientos que hoy viven en el código,
//      declarados con su origen. No se tiran: son el extracto 22/06→22/07 verificado.
//   2. Parsea lo nuevo. Cada línea que no entiende la DEVUELVE — un importador que come 80 filas de
//      100 y no lo dice es peor que uno que falla.
//   3. DEDUPLICA. Las descargas del homebanking se piden con ventanas que se superponen, así que la
//      mayor parte de un extracto nuevo ya está cargada. Duplicar un débito no da error: da un saldo
//      equivocado.
//   4. VERIFICA LA CADENA DE SALDOS sobre el conjunto ya mezclado, no sobre lo nuevo suelto:
//      saldo(n) = saldo(n−1) + importe(n) es una identidad del extracto, y si no cierra hay un typo
//      o falta un movimiento. Es el control que ya encontró dos errores de transcripción.
//   5. Recién ahí escribe. Y si la cadena no cierra, NO escribe salvo que se lo pidan: meter un
//      extracto mal transcripto en la base es peor que no cargarlo.
//
//   node orquestador/scripts/importar-banco.mjs extracto.csv
//   cat extracto.txt | node orquestador/scripts/importar-banco.mjs
//   node orquestador/scripts/importar-banco.mjs --sembrar          (sólo la carga inicial)
//   node orquestador/scripts/importar-banco.mjs x.csv --dry        (no escribe nada)
//   node orquestador/scripts/importar-banco.mjs x.csv --igual-cargalo   (aunque la cadena no cierre)

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../lib/db.mjs'
import { parsearExtracto, novedades, verificarCadena, clave } from '../lib/banco-importar.mjs'
import { MOVIMIENTOS, MOVIMIENTOS_DIA, SALDO_INICIAL, CUENTA, ORIGEN } from '../lib/banco-santander.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260723120000_banco_movimientos.sql')
const DRY = process.argv.includes('--dry')
const IGUAL = process.argv.includes('--igual-cargalo')
const SOLO_SEMBRAR = process.argv.includes('--sembrar')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))

const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/** Lee de un archivo o de la entrada estándar (para pegar directo desde la terminal). */
function leerEntrada() {
  if (ARCHIVO) return readFileSync(ARCHIVO, 'utf8')
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

/** Inserta ignorando los que ya están: la deduplicación la impone el índice único de la BASE. */
async function insertar(movs, origen) {
  if (!movs.length) return 0
  let n = 0
  for (const m of movs) {
    const r = await query(
      `insert into public.banco_movimientos (cuenta, fecha, concepto, importe, saldo_despues, origen)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing
       returning id`,
      [CUENTA.numero, m.fecha, m.concepto, m.importe, m.saldo, origen],
    )
    n += r.rowCount
  }
  return n
}

async function main() {
  // ── 1. La tabla, y la semilla ──
  if (!DRY) {
    await query(readFileSync(MIGRACION, 'utf8'))
    console.log('✓ public.banco_movimientos lista')
  }

  const { rows: [{ n: yaHabia }] } = await query('select count(*)::int as n from public.banco_movimientos')
  if (!yaHabia && !DRY) {
    // Los del código son el extracto verificado 22/06→22/07: se siembran una vez, declarados.
    const semilla = [...MOVIMIENTOS, ...MOVIMIENTOS_DIA].map((m) => ({ ...m, saldo: m.saldo ?? null }))
    const n = await insertar(semilla, ORIGEN)
    console.log(`✓ semilla: ${n} movimiento(s) del extracto ya verificado (${ORIGEN.slice(0, 60)}…)`)
  } else {
    console.log(`— ya hay ${yaHabia} movimiento(s) cargados`)
  }
  if (SOLO_SEMBRAR) return

  // ── 2. Lo nuevo ──
  const texto = leerEntrada()
  if (!texto.trim()) {
    console.log('\nNo me pasaste ningún extracto. Uso:')
    console.log('  node orquestador/scripts/importar-banco.mjs extracto.csv')
    console.log('  cat extracto.txt | node orquestador/scripts/importar-banco.mjs')
    return
  }
  const { movimientos, rechazos } = parsearExtracto(texto)
  console.log(`\nextracto: ${movimientos.length} movimiento(s) leído(s)${rechazos.length ? ` · ${rechazos.length} línea(s) que no entendí` : ''}`)
  // LAS LÍNEAS QUE NO ENTENDÍ SE MUESTRAN. Callarlas es cómo se pierde un movimiento sin que nadie
  // se entere, y después la caja no cierra por un motivo que nadie puede rastrear.
  for (const r of rechazos.slice(0, 8)) console.log(`   ⚠ línea ${r.linea}: ${r.motivo} — "${r.texto}"`)
  if (!movimientos.length) { console.error('no reconocí ningún movimiento: revisá el formato'); process.exitCode = 1; return }

  // ── 3. Deduplicar contra lo que ya está ──
  const { rows: existentes } = await query(
    // ORDER BY IMPORTA: la cadena de saldos se verifica en el orden del extracto, y dos movimientos
    // del MISMO día sólo se distinguen por el orden en que el banco los listó — que es el orden en
    // que se insertaron. Sin esto llegan en el orden que quiera Postgres y la cadena "no cierra" por
    // un motivo inventado: un auditor que grita sin razón se deja de mirar.
    'select fecha, concepto, importe, saldo_despues as saldo from public.banco_movimientos where cuenta = $1 order by fecha, id',
    [CUENTA.numero],
  )
  const norm = existentes.map((r) => ({
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
    concepto: r.concepto, importe: Number(r.importe), saldo: r.saldo == null ? null : Number(r.saldo),
  }))
  const nuevos = novedades(movimientos, norm)
  console.log(`${nuevos.length} nuevo(s) · ${movimientos.length - nuevos.length} ya estaban (las ventanas del extracto se superponen)`)
  if (!nuevos.length) { console.log('\n✓ nada que cargar: el extracto ya estaba entero en la base'); return }

  // ── 4. La cadena de saldos, sobre el conjunto MEZCLADO ──
  //
  // No se verifica lo nuevo suelto: un extracto que arranca a mitad de la serie no tiene con qué
  // comparar su primer saldo. Se ordena todo junto y se mide de punta a punta.
  // `sort` de JS es ESTABLE: los del mismo día conservan su orden relativo —los de la base primero,
  // en el orden en que se cargaron, y detrás los nuevos—, que es el orden real del extracto.
  const todo = [...norm, ...nuevos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  const { ok, cortes } = verificarCadena(todo, SALDO_INICIAL)
  if (ok) console.log('✓ la cadena de saldos cierra de punta a punta')
  else {
    console.log(`\n⚠ la cadena de saldos NO cierra en ${cortes.length} punto(s):`)
    for (const c of cortes.slice(0, 5)) {
      console.log(`   ${c.fecha} · ${String(c.concepto).slice(0, 46)} · esperaba ${$(c.esperado)} y dice ${$(c.declarado)} (${$(c.diferencia)})`)
    }
    console.log('   Un corte es un typo, un movimiento que falta, o un extracto que empieza en otra ventana.')
    if (!IGUAL) {
      console.error('\nNO cargo nada: un extracto mal transcripto adentro de la base es peor que uno sin cargar.')
      console.error('Si sabés que el corte es legítimo (un tramo que el banco no explica), repetilo con --igual-cargalo')
      process.exitCode = 1
      return
    }
    console.log('   --igual-cargalo: cargo igual, con el corte declarado.')
  }

  // ── 5. Escribir ──
  const nuevaClave = new Set(nuevos.map(clave))
  console.log(`\nse van a cargar ${nuevos.length}:`)
  for (const m of nuevos.slice(0, 6)) console.log(`   ${m.fecha} ${String(m.concepto).slice(0, 52).padEnd(54)} ${$(m.importe).padStart(14)}`)
  if (nuevos.length > 6) console.log(`   … y ${nuevos.length - 6} más`)
  if (DRY) { console.log('\n— dry: no escribí nada'); return }

  const origen = `${ARCHIVO ? `archivo ${ARCHIVO}` : 'pegado en la terminal'} · importado ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const n = await insertar(nuevos, origen)
  console.log(`\n✓ ${n} movimiento(s) cargados${n !== nuevaClave.size ? ` (${nuevaClave.size - n} los rechazó el índice único: ya estaban)` : ''}`)
  console.log('\nAhora corré  node orquestador/scripts/banco-raw-pestana.mjs  para que el Sheet lo tome,')
  console.log('y detrás de eso CAJA, Impuestos y Cheques se recalculan solos porque leen esa réplica.')
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
