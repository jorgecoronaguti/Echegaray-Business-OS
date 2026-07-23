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
import { parsearExtracto, novedades, verificarCadena, clave, emparejar, saldosACorregir, saldoAperturaSegun, sinDuplicadosDelDia, saldoDeclarado } from '../lib/banco-importar.mjs'
import { MOVIMIENTOS, MOVIMIENTOS_DIA, SALDO_INICIAL, CUENTA, ORIGEN } from '../lib/banco-santander.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260723120000_banco_movimientos.sql')
const DRY = process.argv.includes('--dry')
const IGUAL = process.argv.includes('--igual-cargalo')
const SOLO_SEMBRAR = process.argv.includes('--sembrar')
// Dar de baja lo que está cargado y el banco NO lista en la misma ventana. NUNCA por defecto: borrar
// un movimiento en silencio es peor que dejar uno de más, porque nadie se entera.
const SACAR = process.argv.includes('--sacar-los-que-el-banco-no-tiene')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))

const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
/** Con centavos. Los controles de saldo se comparan al centavo: redondeados no prueban nada. */
const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
    'select id, fecha, concepto, importe, saldo_despues as saldo from public.banco_movimientos where cuenta = $1 order by fecha, id',
    [CUENTA.numero],
  )
  const norm = existentes.map((r) => ({
    id: r.id,
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
    concepto: r.concepto, importe: Number(r.importe), saldo: r.saldo == null ? null : Number(r.saldo),
  }))

  // ── 3.a EL BANCO GANA SOBRE EL SALDO ──
  //
  // El extracto llega en orden inverso (lo más nuevo arriba). Se da vuelta para compararlo con la
  // base, que está en orden cronológico: el emparejamiento de las repeticiones depende del orden.
  const leidos = sinDuplicadosDelDia([...movimientos].reverse())
  const ventana = { desde: leidos[0]?.fecha, hasta: leidos[leidos.length - 1]?.fecha }
  const enVentana = norm.filter((m) => m.fecha >= ventana.desde && m.fecha <= ventana.hasta)
  const { pares, soloBase, soloExtracto } = emparejar(enVentana, leidos)
  const correcciones = saldosACorregir(pares)
  if (correcciones.length) {
    console.log(`\n⚠ ${correcciones.length} movimiento(s) tienen en la base un saldo distinto del que declara el banco.`)
    console.log('   El saldo corrido es un dato del banco, no una opinión del OS: gana el extracto.')
    for (const c of correcciones.slice(0, 5)) {
      console.log(`   ${c.base.fecha} ${String(c.base.concepto).slice(0, 40).padEnd(42)} base ${$(c.saldoBase).padStart(14)} → banco ${$(c.saldoBanco).padStart(14)}`)
    }
    if (correcciones.length > 5) console.log(`   … y ${correcciones.length - 5} más`)
    // Se corrigen EN MEMORIA antes de deduplicar: si no, los 126 movimientos con el saldo viejo no
    // se reconocerían (la clave incluye el saldo) y entrarían otra vez como si fueran nuevos.
    for (const c of correcciones) c.base.saldo = c.saldoBanco
  }
  // Lo que está cargado y el banco NO lista dentro de la misma ventana es sospechoso por definición:
  // o el extracto está incompleto, o alguien cargó un movimiento que nunca existió. No se borra solo
  // —borrar plata en silencio es peor que dejarla— pero se dice fuerte.
  if (soloBase.length) {
    console.log(`\n⚠ ${soloBase.length} movimiento(s) están cargados y el extracto ${ventana.desde}→${ventana.hasta} NO los lista:`)
    for (const m of soloBase.slice(0, 8)) console.log(`   #${m.id} ${m.fecha} ${String(m.concepto).slice(0, 50).padEnd(52)} ${$(m.importe).padStart(14)}`)
    console.log('   Revisalos a mano: puede ser un movimiento fuera de la ventana, o uno que no existió.')
  }

  // Lo nuevo es lo que el emparejamiento dejó sin pareja DENTRO de la ventana, más lo que caiga
  // fuera de ella (un extracto que trae historia anterior a la cargada). `novedades` cubre lo
  // segundo: para eso su clave incluye el saldo.
  const nuevos = novedades(soloExtracto, norm)
  console.log(`${nuevos.length} nuevo(s) · ${leidos.length - nuevos.length} ya estaban (las ventanas del extracto se superponen)`)
  // ── 4. La cadena de saldos ──
  //
  // Se verifica SIEMPRE, también cuando no hay nada que cargar: es el control del archivo, no del
  // alta. Volver a pasar el mismo extracto y ver que la cadena cierra y que el saldo declarado se
  // reproduce es la forma barata de confirmar que la base sigue diciendo lo que dice el banco.
  //
  // Se mide EN EL ORDEN DEL EXTRACTO, no en el de la base. Dentro de un mismo día el banco lista los
  // movimientos en un orden que la base no conserva (se cargaron cuando se cargaron), y la identidad
  // saldo(n)=saldo(n−1)+importe(n) sólo vale en el orden real: el 22/07 la base tenía Manufacturas
  // antes que el Cheque Nº 221 y así la cadena "no cerraba" por un motivo inventado.
  //
  // El saldo de apertura se DERIVA del propio extracto en vez de tomarse de la constante escrita a
  // mano: la constante decía −$169.586,65 y el banco dice −$313.086,65 ($143.500 de diferencia, el
  // error que obligó a inventar la fila del "hold intradía").
  const fuera = norm.filter((m) => m.fecha < ventana.desde || m.fecha > ventana.hasta)
  const antes = fuera.filter((m) => m.fecha < ventana.desde)
  const despues = fuera.filter((m) => m.fecha > ventana.hasta)
  const todo = [...antes, ...leidos, ...despues]
  const apertura = saldoAperturaSegun(todo) ?? SALDO_INICIAL
  if (!antes.length && apertura != null && Math.abs(apertura - SALDO_INICIAL) > 0.005) {
    console.log(`\n⚠ el saldo de apertura del extracto es ${$(apertura)} y la constante SALDO_INICIAL dice ${$(SALDO_INICIAL)} (${$(apertura - SALDO_INICIAL)}). Gana el banco.`)
  }
  const { ok, cortes } = verificarCadena(todo, apertura)
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

  // ── 4.a EL CONTROL FINAL: el "Saldo al …" que declara el extracto ──
  //
  // La cadena prueba que el detalle es consistente consigo mismo; esto prueba que TERMINA donde el
  // banco dice. Y de paso contesta la única pregunta que el detalle solo no contesta: cuál de los
  // movimientos del día ya impactó en la cuenta y cuál todavía está en clearing.
  const decl = saldoDeclarado(texto)
  if (decl) {
    const confirmado = [...todo].reverse().find((m) => m.saldo != null)
    const delDia = todo.filter((m) => m.saldo == null && m.fecha >= confirmado.fecha)
    const conTodo = Number(confirmado.saldo) + delDia.reduce((s, m) => s + Number(m.importe), 0)
    // "Todavía no acreditado" = el que hay que sacar de la cuenta para llegar al declarado.
    const pendientes = delDia.filter((m) => Math.abs(conTodo - Number(m.importe) - decl.saldo) < 0.005)
    const reconstruido = conTodo - pendientes.reduce((s, m) => s + Number(m.importe), 0)
    console.log(`\nsaldo que DECLARA el banco al ${decl.fecha}: ${$$(decl.saldo)}`)
    console.log(`   último saldo confirmado (${confirmado.fecha}): ${$$(confirmado.saldo)}`)
    for (const m of delDia) {
      const estado = pendientes.includes(m) ? 'TODAVÍA NO ACREDITADO (en clearing)' : 'ya impactó'
      console.log(`   ${m.fecha} ${String(m.concepto).slice(0, 42).padEnd(44)} ${$$(m.importe).padStart(16)}  ${estado}`)
    }
    console.log(Math.abs(reconstruido - decl.saldo) < 0.005
      ? `   ✓ el OS reproduce el saldo declarado: ${$$(reconstruido)}`
      : `   ⚠ el OS reconstruye ${$$(reconstruido)} y el banco declara ${$$(decl.saldo)} — ${$$(reconstruido - decl.saldo)} sin explicar`)
  }

  if (!nuevos.length && !correcciones.length && !(SACAR && soloBase.length)) {
    console.log('\n✓ nada que cargar: el extracto ya estaba entero en la base')
    return
  }

  // ── 5. Escribir ──
  const nuevaClave = new Set(nuevos.map(clave))
  console.log(`\nse van a cargar ${nuevos.length}:`)
  for (const m of nuevos.slice(0, 6)) console.log(`   ${m.fecha} ${String(m.concepto).slice(0, 52).padEnd(54)} ${$(m.importe).padStart(14)}`)
  if (nuevos.length > 6) console.log(`   … y ${nuevos.length - 6} más`)
  if (correcciones.length) console.log(`y se corrigen ${correcciones.length} saldo(s) contra el extracto`)
  if (SACAR && soloBase.length) console.log(`y se dan de baja ${soloBase.length} movimiento(s) que el banco no lista (--sacar-los-que-el-banco-no-tiene)`)
  if (DRY) { console.log('\n— dry: no escribí nada'); return }

  const origen = `${ARCHIVO ? `archivo ${ARCHIVO}` : 'pegado en la terminal'} · importado ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const n = await insertar(nuevos, origen)
  console.log(`\n✓ ${n} movimiento(s) cargados${n !== nuevaClave.size ? ` (${nuevaClave.size - n} los rechazó el índice único: ya estaban)` : ''}`)

  // El saldo corrido lo dice el banco. Corregirlo NO es inventar un movimiento: el hecho económico
  // (fecha, concepto, importe) no se toca — sólo el saldo que quedó después, y contra el documento.
  let corregidos = 0
  for (const c of correcciones) {
    const r = await query(
      'update public.banco_movimientos set saldo_despues = $1, origen = $2 where id = $3',
      [c.saldoBanco, `${origen} · saldo corregido contra el extracto (decía ${c.saldoBase})`, c.base.id],
    )
    corregidos += r.rowCount
  }
  if (corregidos) console.log(`✓ ${corregidos} saldo(s) corregidos contra el extracto`)

  if (SACAR && soloBase.length) {
    for (const m of soloBase) {
      await query('delete from public.banco_movimientos where id = $1', [m.id])
      console.log(`✓ dado de baja #${m.id} ${m.fecha} ${String(m.concepto).slice(0, 50)} ${$(m.importe)} — el banco no lo lista`)
    }
  }
  console.log('\nAhora corré  node orquestador/scripts/banco-raw-pestana.mjs  para que el Sheet lo tome,')
  console.log('y detrás de eso CAJA, Impuestos y Cheques se recalculan solos porque leen esa réplica.')
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
