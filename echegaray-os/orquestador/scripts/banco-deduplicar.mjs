#!/usr/bin/env node
// SACAR LOS MOVIMIENTOS DUPLICADOS DEL EXTRACTO. Con respaldo, en seco por defecto, y explicando cada baja.
//
// ═══ POR QUÉ (30/07) ═══
//
// El índice único de banco_movimientos incluye `saldo_despues`, y el comentario de su migración lo
// justificaba: dos transferencias iguales el mismo día son dos movimientos reales y sólo el saldo
// corrido las distingue. El agujero: DOS DESCARGAS DEL MISMO MOVIMIENTO REPORTAN SALDOS DISTINTOS —el
// saldo depende de la ventana con que el banco arma la descarga, no del movimiento—. Así el mismo
// movimiento entró de nuevo en cada descarga superpuesta: 62 duplicados, ~$46,8M de volumen doble.
//
// No dio ningún error. Un duplicado no grita: infla las sumas y deja la caja sin cerrar.
//
// ═══ CÓMO DECIDE QUÉ ES DUPLICADO — Y POR QUÉ NO ALCANZA (fecha, concepto, importe) ═══
//
// Dos cheques físicos de $200.000 debitados el mismo día son DOS movimientos legítimos con la misma
// fecha, el mismo concepto y el mismo importe. Agruparlos y dejar uno BORRARÍA plata real. Entonces:
//
//   1. Si los dos tienen REFERENCIA, manda la referencia: iguales = el mismo movimiento, distintas =
//      dos movimientos. Es una identidad, no una heurística.
//   2. Si no hay referencia, se agrupa por (fecha, concepto, importe) y se borra sólo el EXCEDENTE
//      ENTRE ORÍGENES DISTINTOS: si un origen trajo el movimiento N veces, esas N son reales (el banco
//      las listó N veces en una misma descarga). Lo que sobra es la REPETICIÓN DE OTRA DESCARGA.
//      Se conserva el máximo que declaró un solo origen, y se dan de baja las copias de los demás.
//
// SE CONSERVA LA FILA CON REFERENCIA. Entre dos copias, la que tiene referencia vale más: es la que va
// a poder cruzarse contra un cheque por identidad.
//
//   node orquestador/scripts/banco-deduplicar.mjs              (en seco: no borra, sólo dice qué haría)
//   node orquestador/scripts/banco-deduplicar.mjs --aplicar    (borra, después de dejar el respaldo)

import { writeFileSync } from 'node:fs'
import { query, closePool } from '../lib/db.mjs'
import { norm, agruparPorConcepto } from '../lib/banco-conceptos.mjs'

const APLICAR = process.argv.includes('--aplicar')
const RESPALDO = `/tmp/banco_movimientos-respaldo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

/**
 * EL CONCEPTO SE COMPARA NORMALIZADO. Sin esto, el mismo movimiento sobrevive dos veces.
 *
 * EL CASO REAL (30/07, encontrado por el cruce después de la primera pasada de dedup): el depósito de
 * $16.807.425,92 del 29/07 —los 5 cheques de la O/P 4865 de Messina— quedó DOS veces, porque una
 * descarga lo escribió "Deposito E-cheq 48hs Presencia Bsr" y la otra "Deposito e-cheq 48hs presencia
 * bsr". Agrupando por concepto exacto son dos grupos distintos y ninguno tiene copias. El cruce lo
 * delató: el lote consumió una fila y la otra quedó reportada como "movimiento que ningún cheque
 * explica" — $16,8M de falso hallazgo.
 *
 * Mayúsculas y espacios los pone el banco distinto en cada descarga; no son parte del movimiento.
 */
export const normalizarConcepto = norm

/**
 * NÚCLEO PURO: qué filas se dan de baja. Devuelve los ids a borrar con su motivo.
 *
 * @param {object[]} filas [{id, fecha, concepto, importe, saldo_despues, origen, referencia}]
 * @returns {{bajas:{id:number,motivo:string,fila:object}[], grupos:object[]}}
 */
export function planDedup(filas = []) {
  const bajas = []; const grupos = []

  // ── 1. POR REFERENCIA + IMPORTE: eso es identidad. La referencia SOLA no lo es.
  //
  // POR QUÉ EL IMPORTE ENTRA EN LA CLAVE (31/07). Este paso agrupaba por referencia sola y propuso dar de
  // baja un movimiento REAL: el 01/07 la compra en el exterior de Google Workspace ($-37.926,00) y su
  // percepción RG 5617 ($-11.203,92) comparten la referencia 00114824 —el banco las numera juntas porque
  // son la misma operación y las distingue por el Código Operativo, que el extracto CSV no expone en una
  // columna que el parser lea—. Con la referencia sola, "sin discusión" borraba una percepción de $11.203,92
  // que nadie iba a extrañar hasta que el IVA no cerrara.
  const porRef = new Map()
  for (const f of filas) {
    if (!f.referencia) continue
    const k = `${f.cuenta ?? ''}|${f.referencia}|${Number(f.importe).toFixed(2)}`
    if (!porRef.has(k)) porRef.set(k, [])
    porRef.get(k).push(f)
  }
  const yaDeBaja = new Set()
  for (const [k, g] of porRef) {
    if (g.length < 2) continue
    // Se queda el más viejo (el primero que entró); los demás son la misma cosa importada de nuevo.
    const orden = g.slice().sort((a, b) => a.id - b.id)
    grupos.push({ clave: k, tipo: 'referencia', total: g.length, conserva: 1 })
    for (const f of orden.slice(1)) { bajas.push({ id: f.id, motivo: `misma referencia ${f.referencia} y mismo importe que la fila ${orden[0].id}`, fila: f }); yaDeBaja.add(f.id) }
  }

  // ── 2. SIN REFERENCIA: el excedente ENTRE orígenes. Lo que un mismo origen repite es real.
  //
  // SE AGRUPA POR (cuenta, fecha, importe) Y RECIÉN AHÍ POR CONCEPTO COMPATIBLE (31/07). Antes la clave
  // incluía el concepto EXACTO normalizado, y así este deduplicador informaba "no hay duplicados" sobre una
  // base que tenía 42 movimientos contados dos veces: las dos descargas escriben el concepto con CONTENIDO
  // distinto —"Pago haberes - 260701507 260701507" en el CSV contra "Pago haberes - 260701507" en la
  // semilla—, caían en grupos separados de una fila cada uno, y ningún grupo tenía copias. Normalizar
  // mayúsculas y espacios no alcanzaba: lo que cambia es cuánto del concepto guardó cada descarga.
  const porNat = new Map()
  for (const f of filas) {
    if (yaDeBaja.has(f.id)) continue
    const k = `${f.cuenta ?? ''}|${f.fecha}|${f.importe}`
    if (!porNat.has(k)) porNat.set(k, [])
    porNat.get(k).push(f)
  }
  const grupitos = []
  for (const [k, bolsa] of porNat) {
    for (const g of agruparPorConcepto(bolsa)) grupitos.push([`${k}|${normalizarConcepto(g[0].concepto)}`, g])
  }
  for (const [k, g] of grupitos) {
    if (g.length < 2) continue
    const porOrigen = new Map()
    for (const f of g) {
      if (!porOrigen.has(f.origen)) porOrigen.set(f.origen, [])
      porOrigen.get(f.origen).push(f)
    }
    if (porOrigen.size < 2) continue // un solo origen lo repitió: son movimientos reales, no se toca
    // CUÁNTOS SON REALES: el máximo que declaró un solo origen. Si la descarga del 22/07 listó el
    // movimiento dos veces, hay dos; que otra descarga lo liste otras dos no los convierte en cuatro.
    const reales = Math.max(...[...porOrigen.values()].map((v) => v.length))
    // Se prefieren las filas CON referencia, y entre iguales las más viejas.
    const orden = g.slice().sort((a, b) => (b.referencia ? 1 : 0) - (a.referencia ? 1 : 0) || a.id - b.id)
    grupos.push({ clave: k, tipo: 'entre-origenes', total: g.length, conserva: reales, origenes: porOrigen.size })
    for (const f of orden.slice(reales)) bajas.push({ id: f.id, motivo: `${g.length} copias en ${porOrigen.size} descargas superpuestas; ${reales} es lo que declaró una sola`, fila: f })
  }
  return { bajas, grupos }
}

async function main() {
  const { rows } = await query(
    `select id, cuenta, fecha::text, concepto, importe::float8, saldo_despues::float8, origen, referencia
       from public.banco_movimientos order by id`)
  console.log(`banco_movimientos: ${rows.length} fila(s)`)
  const conRef = rows.filter((r) => r.referencia).length
  console.log(`  ${conRef} con referencia · ${rows.length - conRef} sin referencia (entraron por captura)\n`)

  const { bajas, grupos } = planDedup(rows)
  if (!bajas.length) {
    console.log('✓ no hay duplicados: cada movimiento aparece una sola vez.')
    return
  }

  const porTipo = new Map()
  for (const g of grupos) porTipo.set(g.tipo, (porTipo.get(g.tipo) ?? 0) + 1)
  console.log(`${grupos.length} grupo(s) con copias · ${bajas.length} fila(s) a dar de baja`)
  for (const [t, n] of porTipo) console.log(`   por ${t}: ${n} grupo(s)`)
  const volumen = bajas.reduce((s, b) => s + Math.abs(b.fila.importe), 0)
  console.log(`   volumen que se estaba contando dos veces: ${$(volumen)}\n`)

  console.log('LO QUE SE DA DE BAJA (las primeras 20):')
  bajas.slice(0, 20).forEach((b) => console.log(`   id${String(b.id).padStart(4)} ${b.fila.fecha} ${$(b.fila.importe).padStart(16)}  ${String(b.fila.concepto).slice(0, 38).padEnd(38)} — ${b.motivo.slice(0, 54)}`))
  if (bajas.length > 20) console.log(`   … ${bajas.length - 20} más`)

  // ── EL CONTROL QUE DECIDE SI ESTO ESTUVO BIEN ────────────────────────────────────────────────────
  // El saldo NO se toca ni se recalcula: lo declara el banco. Lo que tiene que pasar es que la CADENA
  // vuelva a cerrar — cada saldo = el anterior + el importe. Con duplicados no cierra nunca.
  const quedan = rows.filter((r) => !bajas.some((b) => b.id === r.id))
  const conSaldo = quedan.filter((r) => r.saldo_despues != null).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  let rotos = 0
  for (let i = 1; i < conSaldo.length; i++) {
    const esperado = Math.round((conSaldo[i - 1].saldo_despues + conSaldo[i].importe) * 100) / 100
    if (Math.abs(esperado - conSaldo[i].saldo_despues) > 0.01) rotos++
  }
  console.log(`\nCADENA DE SALDOS después de la baja: ${conSaldo.length} movimientos con saldo · ${rotos} eslabón(es) que no cierran`)
  console.log('  (la cadena no cierra igual con saldos de descargas distintas; el control fuerte es el SALDO DECLARADO al corte)')

  if (!APLICAR) {
    console.log('\nEN SECO: no borré nada. Corré con --aplicar para dar de baja (deja respaldo antes).')
    return
  }

  // ── RESPALDO ANTES DE BORRAR. Sin esto no hay vuelta atrás y el extracto es la única verdad.
  writeFileSync(RESPALDO, JSON.stringify({ generado: new Date().toISOString(), filas: bajas.map((b) => b.fila), motivo: 'dedup banco_movimientos 30/07' }, null, 1))
  console.log(`\nrespaldo de las ${bajas.length} filas → ${RESPALDO}`)

  const ids = bajas.map((b) => b.id)
  const r = await query('delete from public.banco_movimientos where id = any($1::bigint[])', [ids])
  console.log(`✔ ${r.rowCount} fila(s) dadas de baja`)

  const { rows: post } = await query('select count(*)::int n from public.banco_movimientos')
  console.log(`banco_movimientos ahora: ${post[0].n} fila(s) (antes ${rows.length})`)
  const { bajas: b2 } = planDedup((await query(
    `select id, cuenta, fecha::text, concepto, importe::float8, saldo_despues::float8, origen, referencia
       from public.banco_movimientos order by id`)).rows)
  console.log(`verificación: ${b2.length === 0 ? '✓ no quedan duplicados' : `✖ quedan ${b2.length}`}`)
  if (b2.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
}
