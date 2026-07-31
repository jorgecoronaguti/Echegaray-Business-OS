#!/usr/bin/env node
// CONCILIAR LA BASE CONTRA UN EXTRACTO VERIFICADO. Uno a uno, por identidad, y con respaldo.
//
// ═══ POR QUÉ (31/07) ═══
//
// El extracto 01/07→31/07 se leyó y el importador dijo "138 nuevos · 0 ya estaban" contra una base que
// ya tenía 173 movimientos de julio. Dos defectos encadenados:
//
//   1. El INSERT del importador no escribía `referencia`. La migración del 30/07 declaró la referencia
//      como la única clave que identifica un movimiento, creó el índice único y arregló el parser —pero
//      la columna nunca se llenó: 206 de 206 filas en NULL. El índice vivía sobre una columna vacía.
//   2. `banco-deduplicar.mjs` no ve esta clase de duplicado. Agrupa por concepto normalizado (minúsculas
//      y espacios), y las dos descargas escriben el concepto con CONTENIDO distinto: "Pago haberes -
//      260701507 260701507" en el CSV contra "Pago haberes - 260701507" en la semilla. Son dos grupos
//      distintos, cada uno con una sola fila, así que el deduplicador informa "no hay duplicados".
//
// Resultado medido: 35 movimientos de julio contados dos veces. Un duplicado no grita — infla la suma
// del impuesto al cheque, los costos bancarios y el cruce de cheques, y deja la caja sin cerrar.
//
// ═══ POR QUÉ CONCILIAR Y NO DEDUPLICAR ═══
//
// Un deduplicador mira la base sola y adivina qué sobra. Acá hay algo mejor: un extracto cuya CADENA DE
// SALDOS CIERRA DE PUNTA A PUNTA. Eso lo vuelve completo por construcción —si faltara un movimiento, la
// identidad saldo(n) = saldo(n−1) + importe(n) se rompería en ese punto—, así que para su ventana el
// extracto ES la verdad y la pregunta deja de ser "¿qué se parece a qué?" y pasa a ser una asignación
// uno a uno: cada movimiento del extracto reclama exactamente una fila de la base.
//
//   · fila de la base con dueño        → se le escribe su referencia (el dato se sana, no se borra)
//   · fila de la base sin dueño        → es la copia de otra descarga: se da de baja, con respaldo
//   · movimiento del extracto sin fila → falta de verdad: se inserta con su referencia
//
// FUERA DE LA VENTANA NO SE TOCA NADA. Junio entró por la semilla y este extracto no lo cubre: no hay
// con qué juzgarlo, así que no se juzga.
//
// ═══ EL CONTROL FINAL ═══
//
// Después de aplicar, la ventana de la base tiene que ser el extracto: misma cantidad, misma suma al
// centavo, una referencia por movimiento y sin repetidas. Y la cadena de saldos de la base entera
// —junio incluido— tiene que cerrar, lo que verifica además el empalme 30/06→01/07.
//
//   node orquestador/scripts/banco-conciliar-extracto.mjs orquestador/datos/extracto-....csv
//   node orquestador/scripts/banco-conciliar-extracto.mjs x.csv --aplicar

import { readFileSync, writeFileSync } from 'node:fs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { parsearExtracto, verificarCadena } from '../lib/banco-importar.mjs'
import { norm, conceptoCompatible, numeroAnotado } from '../lib/banco-conceptos.mjs'
import { CUENTA } from '../lib/banco-santander.mjs'

const APLICAR = process.argv.includes('--aplicar')
// --control: sólo verifica que la ventana de la base sea el extracto, sin proponer ni escribir nada.
const SOLO_CONTROL = process.argv.includes('--control')
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

// La comparación de conceptos vive en la lib: el deduplicador necesita la MISMA definición, y con dos
// definiciones el mismo par de filas era "duplicado" para uno y "movimientos distintos" para el otro.
export { norm, conceptoCompatible, numeroAnotado }

/**
 * ¿Esta fila de la base y este movimiento del extracto son el mismo movimiento?
 *
 * Además del concepto, UNA REGLA DURA PARA LOS CHEQUES. La semilla anotó el número en el concepto
 * ("Cheque debitado - Nº 221") y el extracto lo trae en la referencia —para un cheque, la referencia ES
 * el número—. Sin comparar los dos números, dos cheques de $200.000 debitados el mismo día se emparejan
 * al azar y la referencia 221 puede terminar en la fila del 220: el cruce contra `public.cheques` pasa a
 * ser una identidad equivocada, que es peor que no tener identidad.
 */
export function emparejable(filaBase, movExtracto) {
  const modo = conceptoCompatible(filaBase?.concepto, movExtracto?.concepto)
  if (!modo) return null
  const anotado = numeroAnotado(filaBase?.concepto)
  if (anotado && movExtracto?.referencia && anotado !== String(movExtracto.referencia).replace(/^0+/, '')) return null
  return modo
}

/**
 * NÚCLEO PURO: la asignación uno a uno entre el extracto y la base, dentro de la ventana del extracto.
 *
 * @param {object[]} base [{id, fecha:'YYYY-MM-DD', concepto, importe, saldo, referencia, origen}]
 * @param {object[]} extracto [{fecha, concepto, importe, saldo, referencia}]
 * @returns {{ventana:{desde:string,hasta:string}, asignar:object[], sobran:object[], faltan:object[], fuera:number}}
 */
export function planConciliacion(base = [], extracto = []) {
  if (!extracto.length) return { ventana: null, asignar: [], sobran: [], faltan: [], fuera: base.length }
  const fechas = extracto.map((m) => m.fecha).sort()
  const ventana = { desde: fechas[0], hasta: fechas[fechas.length - 1] }

  const dentro = base.filter((b) => b.fecha >= ventana.desde && b.fecha <= ventana.hasta)
  const fuera = base.length - dentro.length

  // Un balde por (fecha, importe): dos movimientos sólo se confunden si coinciden en los dos.
  const balde = (m) => `${m.fecha}|${Number(m.importe).toFixed(2)}`
  const libres = new Map()
  for (const b of dentro) {
    const k = balde(b)
    if (!libres.has(k)) libres.set(k, [])
    libres.get(k).push(b)
  }
  // Orden estable: la fila más vieja se empareja primero, así el resultado no depende del azar.
  for (const g of libres.values()) g.sort((p, q) => Number(p.id) - Number(q.id))

  const asignar = []; const tomadas = new Set(); const resueltos = new Set()

  // DOS PASADAS. Primero los conceptos exactos: si un movimiento tiene su gemelo exacto, ése es, y no
  // se lo puede robar un prefijo. Recién después los recortados. Con una sola pasada, un concepto
  // recortado podía quedarse con la fila del exacto y dejar al exacto huérfano (= una baja inventada).
  // El estado va en Sets locales y NO en el objeto que me pasaron: marcar la entrada la ensucia para
  // el que la use después.
  for (const modo of ['exacto', 'prefijo']) {
    for (const [i, m] of extracto.entries()) {
      if (resueltos.has(i)) continue
      const g = libres.get(balde(m)) ?? []
      const cand = g.find((b) => !tomadas.has(b.id) && emparejable(b, m) === modo)
      if (!cand) continue
      tomadas.add(cand.id)
      resueltos.add(i)
      asignar.push({ id: cand.id, referencia: m.referencia ?? null, saldo: m.saldo ?? null, modo, fecha: m.fecha, concepto: cand.concepto, importe: Number(m.importe), saldoViejo: cand.saldo == null ? null : Number(cand.saldo) })
    }
  }
  const faltan = extracto.filter((_, i) => !resueltos.has(i))

  // ── EL SEGURO DE LA BAJA ──
  //
  // Una fila sin dueño puede ser dos cosas muy distintas: la COPIA de un movimiento que sí quedó
  // emparejado (borrarla es sanear), o un movimiento que el extracto no explica (borrarla es perder
  // plata real). La diferencia es verificable: si entre las emparejadas hay una con la misma fecha y el
  // mismo importe, el movimiento SIGUE en la base después de la baja. Si no la hay, no se toca y se
  // reporta como huérfana — un extracto completo no debería dejar ninguna, así que es una alarma.
  const conDueño = new Set(asignar.map((a) => `${a.fecha}|${Number(a.importe).toFixed(2)}`))
  const sinDueño = dentro.filter((b) => !tomadas.has(b.id))
  const sobran = []; const huerfanas = []
  for (const b of sinDueño) {
    if (conDueño.has(`${b.fecha}|${Number(b.importe).toFixed(2)}`)) sobran.push(b)
    else huerfanas.push(b)
  }

  return { ventana, asignar, sobran, faltan, fuera, huerfanas }
}

async function main() {
  if (!ARCHIVO) { console.error('uso: banco-conciliar-extracto.mjs <extracto.csv> [--aplicar]'); process.exitCode = 1; return }
  const { movimientos, rechazos } = parsearExtracto(readFileSync(ARCHIVO, 'utf8'))
  if (!movimientos.length) { console.error('no reconocí ningún movimiento en el archivo'); process.exitCode = 1; return }

  // LA VERDAD SE VERIFICA ANTES DE USARLA COMO VERDAD. Si la cadena del extracto no cierra, no está
  // completo y no puede decidir qué sobra en la base: conciliar contra él borraría plata real.
  const { ok, cortes } = verificarCadena(movimientos, null)
  console.log(`extracto: ${movimientos.length} movimiento(s)${rechazos.length ? ` · ${rechazos.length} línea(s) ilegibles` : ''}`)
  if (!ok) {
    console.error(`\n⚠ la cadena de saldos del extracto NO cierra en ${cortes.length} punto(s). NO concilio.`)
    for (const c of cortes.slice(0, 5)) console.error(`   ${c.fecha} · ${String(c.concepto).slice(0, 44)} · esperaba ${$(c.esperado)} y dice ${$(c.declarado)}`)
    console.error('   Un extracto incompleto no puede decidir qué sobra en la base.')
    process.exitCode = 1
    return
  }
  console.log('✓ la cadena del extracto cierra de punta a punta: es completo para su ventana')

  if (SOLO_CONTROL) {
    const fechas = movimientos.map((m) => m.fecha).sort()
    await controlar(movimientos, { desde: fechas[0], hasta: fechas[fechas.length - 1] })
    return
  }

  const { rows } = await query(
    `select id, fecha, concepto, importe, saldo_despues as saldo, referencia, origen
       from public.banco_movimientos where cuenta = $1 order by fecha, id`, [CUENTA.numero])
  const base = rows.map((r) => ({
    id: Number(r.id), fecha: r.fecha.toISOString().slice(0, 10), concepto: r.concepto,
    importe: Number(r.importe), saldo: r.saldo == null ? null : Number(r.saldo),
    referencia: r.referencia ?? null, origen: r.origen,
  }))

  const { ventana, asignar, sobran, faltan, fuera, huerfanas } = planConciliacion(base, movimientos)
  const dentro = base.length - fuera
  console.log(`\nventana ${ventana.desde} → ${ventana.hasta}`)
  console.log(`  base: ${dentro} fila(s) dentro · ${fuera} fuera (no se tocan)`)
  console.log(`  ${asignar.length} emparejada(s) (${asignar.filter((a) => a.modo === 'exacto').length} por concepto exacto · ${asignar.filter((a) => a.modo === 'prefijo').length} por concepto recortado)`)
  console.log(`  ${sobran.length} copia(s) de un movimiento que se queda → baja` + (sobran.length ? '' : ' (nada)'))
  console.log(`  ${faltan.length} del extracto sin fila → alta` + (faltan.length ? '' : ' (nada)'))
  console.log(`  ${huerfanas.length} huérfana(s): el extracto no las explica → NO se tocan${huerfanas.length ? ' ⚠' : ''}`)

  if (huerfanas.length) {
    console.log('\n── huérfanas (se quedan, y hay que entender por qué están) ──')
    for (const h of huerfanas) console.log(`   #${h.id} ${h.fecha} · ${String(h.concepto).slice(0, 50).padEnd(50)} · ${$(h.importe).padStart(16)} · ${String(h.origen).slice(0, 26)}`)
  }

  // LA ARITMÉTICA, ANTES DE ESCRIBIR. Si base − bajas + altas ≠ extracto, mi plan está mal y no se
  // aplica: es la prueba de que la ventana va a quedar SIENDO el extracto y no algo parecido.
  const sumaDentro = base.filter((b) => b.fecha >= ventana.desde && b.fecha <= ventana.hasta).reduce((a, b) => a + b.importe, 0)
  const sumaBajas = sobran.reduce((a, b) => a + b.importe, 0)
  const sumaAltas = faltan.reduce((a, b) => a + Number(b.importe), 0)
  const sumaExtracto = movimientos.reduce((a, m) => a + Number(m.importe), 0)
  const proyectada = sumaDentro - sumaBajas + sumaAltas
  const cierra = Math.abs(proyectada - sumaExtracto) < 0.005
  console.log(`\n── la aritmética del plan ──`)
  console.log(`  base en la ventana        ${$(sumaDentro).padStart(20)}   ${dentro} fila(s)`)
  console.log(`  − bajas                   ${$(sumaBajas).padStart(20)}   ${sobran.length}`)
  console.log(`  + altas                   ${$(sumaAltas).padStart(20)}   ${faltan.length}`)
  console.log(`  = quedaría                ${$(proyectada).padStart(20)}   ${dentro - sobran.length + faltan.length}`)
  console.log(`  extracto                  ${$(sumaExtracto).padStart(20)}   ${movimientos.length}`)
  console.log(`  ${cierra && dentro - sobran.length + faltan.length === movimientos.length ? '✓ la ventana va a quedar siendo el extracto' : '⚠ NO cierra: el plan está mal'}`)
  if (!cierra) { console.log('\nNO aplico: si la aritmética no cierra, el emparejamiento tiene un error.'); process.exitCode = 1; return }

  if (sobran.length) {
    console.log('\n── las que se dan de baja ──')
    for (const s of sobran) console.log(`   #${s.id} ${s.fecha} · ${String(s.concepto).slice(0, 50).padEnd(50)} · ${$(s.importe).padStart(16)} · ${String(s.origen).slice(0, 28)}`)
    const suma = sobran.reduce((a, s) => a + s.importe, 0)
    console.log(`   ${sobran.length} fila(s) · volumen doble ${$(suma)}`)
  }
  if (faltan.length) {
    console.log('\n── las que se dan de alta ──')
    for (const f of faltan) console.log(`   ${f.fecha} · ref ${String(f.referencia ?? '—').padStart(9)} · ${String(f.concepto).slice(0, 48).padEnd(48)} · ${$(f.importe).padStart(16)}`)
  }

  if (!APLICAR) {
    console.log('\n— en seco: no escribí nada. Repetilo con --aplicar cuando el detalle de arriba esté bien.')
    return
  }

  // RESPALDO ANTES DE TOCAR. La ventana entera, como está ahora, en disco.
  const respaldo = `/tmp/banco_movimientos-conciliacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
  writeFileSync(respaldo, JSON.stringify({ ventana, archivo: ARCHIVO, filas: base.filter((b) => b.fecha >= ventana.desde && b.fecha <= ventana.hasta) }, null, 2))
  console.log(`\n✓ respaldo de la ventana: ${respaldo}`)

  // TODO O NADA. La primera corrida se cortó a mitad —el índice único de ayer rechazó una fila legítima—
  // y dejó 6 filas con referencia y 41 bajas sin hacer: un estado que no es ni el viejo ni el nuevo. Una
  // conciliación que borra y da de alta tiene que ser una sola transacción.
  try {
    await withTx(async (cx) => {
      // El orden importa: primero las BAJAS. Las copias comparten importe con la fila que se queda, y el
      // índice único (cuenta, referencia, importe) las haría chocar si la copia todavía está ahí.
      if (sobran.length) {
        const r = await cx.query('delete from public.banco_movimientos where id = any($1::bigint[])', [sobran.map((s) => s.id)])
        console.log(`✓ ${r.rowCount} duplicado(s) de baja`)
        if (r.rowCount !== sobran.length) throw new Error(`esperaba dar de baja ${sobran.length} y bajé ${r.rowCount}`)
      }
      let n = 0
      for (const a of asignar) {
        // El saldo también se unifica: mezclar el saldo corrido de dos descargas deja una cadena que no
        // se puede verificar, y el saldo no es propiedad del movimiento sino de la descarga.
        const r = await cx.query(
          'update public.banco_movimientos set referencia = $2, saldo_despues = $3 where id = $1',
          [a.id, a.referencia, a.saldo])
        n += r.rowCount
      }
      console.log(`✓ ${n} fila(s) con su referencia y el saldo de esta descarga`)
      if (n !== asignar.length) throw new Error(`esperaba actualizar ${asignar.length} y actualicé ${n}`)

      let m = 0
      for (const f of faltan) {
        const r = await cx.query(
          `insert into public.banco_movimientos (cuenta, fecha, concepto, importe, saldo_despues, origen, referencia)
           values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing returning id`,
          [CUENTA.numero, f.fecha, f.concepto, f.importe, f.saldo, `Santander Empresas · ${ARCHIVO.split('/').pop()} (conciliado ${new Date().toISOString().slice(0, 10)})`, f.referencia ?? null])
        m += r.rowCount
      }
      console.log(`✓ ${m} alta(s)`)
      if (m !== faltan.length) throw new Error(`esperaba dar de alta ${faltan.length} y entraron ${m} (¿la clave única rechazó una?)`)
    })
  } catch (e) {
    console.error(`\n⚠ NADA se aplicó (rollback): ${e?.message ?? e}`)
    console.error(`   La base quedó como estaba. El respaldo de la ventana igual está en ${respaldo}`)
    process.exitCode = 1
    return
  }

  await controlar(movimientos, ventana)
}

/**
 * EL CONTROL: la ventana de la base tiene que SER el extracto.
 *
 * POR QUÉ ASÍ Y NO "LA CADENA DE LA BASE ENTERA" (que fue mi primer intento y era un control imposible).
 * La cadena saldo(n) = saldo(n−1) + importe(n) sólo se puede verificar EN EL ORDEN EN QUE EL BANCO LISTÓ
 * los movimientos, y ese orden dentro de un mismo día no vive en la base: se aproximaba con el `id`, que
 * es el orden de inserción, y cualquier alta posterior lo rompe —las 6 altas del 30 y 31/07 recibieron
 * los ids más altos y quedaron al final de su día—. La cadena se verifica donde el orden existe: sobre el
 * PROPIO extracto, antes de aplicar. Adentro de la base, lo verificable es la identidad conjunto a
 * conjunto, día por día, más el saldo de cierre.
 */
async function controlar(movimientos, ventana) {
  const { rows: post } = await query(
    `select id, fecha, concepto, importe, saldo_despues as saldo, referencia from public.banco_movimientos
      where cuenta = $1 and fecha between $2 and $3`, [CUENTA.numero, ventana.desde, ventana.hasta])
  const enBase = post.map((r) => ({ ...r, fecha: r.fecha.toISOString().slice(0, 10), importe: Number(r.importe) }))

  const sumaBase = enBase.reduce((a, r) => a + r.importe, 0)
  const sumaExt = movimientos.reduce((a, m) => a + Number(m.importe), 0)
  console.log('\n── control: ¿la ventana de la base ES el extracto? ──')
  console.log(`  cantidad  base ${enBase.length} · extracto ${movimientos.length}  ${enBase.length === movimientos.length ? '✓' : '⚠'}`)
  console.log(`  suma      base ${$(sumaBase)} · extracto ${$(sumaExt)}  ${Math.abs(sumaBase - sumaExt) < 0.005 ? '✓' : '⚠'}`)

  // DÍA POR DÍA. Una suma total igual puede esconder un movimiento corrido de día, que en un cuadro por
  // período (cada columna suma una ventana que arranca en su encabezado) cambia la columna que lo captura.
  const porDia = (arr) => {
    const m = new Map()
    for (const x of arr) {
      const k = x.fecha
      const v = m.get(k) ?? { n: 0, suma: 0 }
      v.n += 1; v.suma += Number(x.importe); m.set(k, v)
    }
    return m
  }
  const dB = porDia(enBase); const dE = porDia(movimientos)
  const dias = [...new Set([...dB.keys(), ...dE.keys()])].sort()
  const malos = dias.filter((d) => (dB.get(d)?.n ?? 0) !== (dE.get(d)?.n ?? 0) || Math.abs((dB.get(d)?.suma ?? 0) - (dE.get(d)?.suma ?? 0)) >= 0.005)
  console.log(`  día por día  ${dias.length} día(s) · ${malos.length ? `⚠ ${malos.length} no coincide(n)` : '✓ todos coinciden en cantidad y suma'}`)
  for (const d of malos) console.log(`     ${d}: base ${dB.get(d)?.n ?? 0}/${$(dB.get(d)?.suma ?? 0)} · extracto ${dE.get(d)?.n ?? 0}/${$(dE.get(d)?.suma ?? 0)}`)

  // LA CLAVE, con el importe: la referencia SOLA se repite legítimamente (una operación y su percepción
  // comparten referencia). Lo que no puede repetirse es (referencia, importe): eso sí sería un duplicado.
  const claves = enBase.filter((r) => r.referencia).map((r) => `${r.referencia}|${r.importe.toFixed(2)}`)
  const repetidas = claves.filter((k, i) => claves.indexOf(k) !== i)
  const soloRef = new Set(enBase.filter((r) => r.referencia).map((r) => r.referencia))
  console.log(`  referencias  ${claves.length} de ${enBase.length} con referencia · ${soloRef.size} referencias distintas`)
  console.log(`               (referencia, importe) repetida(s): ${repetidas.length}  ${repetidas.length ? '⚠ ' + [...new Set(repetidas)].join(', ') : '✓ ninguna'}`)
  if (claves.length !== enBase.length) console.log(`               ⚠ ${enBase.length - claves.length} fila(s) sin referencia adentro de la ventana`)

  // EL SALDO DE CIERRE: el número que el dueño compara contra el homebanking.
  const ultimo = movimientos[movimientos.length - 1]
  const cierre = movimientos.filter((m) => m.saldo != null).slice(-1)[0]
  if (cierre) console.log(`  saldo al ${cierre.fecha}: ${$(cierre.saldo)} (el que declara el extracto en su último movimiento)`)
  else console.log(`  saldo al ${ultimo?.fecha}: el extracto no lo declara`)

  // La cadena, sobre el extracto: es donde el orden existe y donde el control tiene sentido.
  const c = verificarCadena(movimientos, null)
  console.log(`  cadena del extracto (${movimientos.length} movimientos): ${c.ok ? '✓ cierra' : `⚠ ${c.cortes.length} corte(s)`}`)
}

// Sólo cuando se corre directo: importarlo (los tests lo hacen) no tiene que ejecutar nada.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => { console.error('ERROR:', e?.message ?? e); process.exitCode = 1; await closePool() })
}
