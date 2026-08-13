#!/usr/bin/env node
/**
 * ¿COMPRAS Y COBRANZAS LLEGAN A LAS DOS VISTAS DE CASH FLOW, Y MUEVEN LOS SALDOS?
 *
 * SÓLO LEE. No escribe una celda. Se puede correr contra el Sheet real sin riesgo.
 *
 * POR QUÉ EXISTE (06/08/2026). El dueño pidió verificar que "Compras" —con sus distintos MÉTODOS DE
 * PAGO— y "Cobranzas" estén conectadas a "Cash Flow Semanal" y "Cash Flow Mensual", CON IMPACTO EN
 * LOS SALDOS. `caja-conectividad.mjs` ya contesta esa pregunta para CAJA, que es un STOCK a una
 * fecha. Este script la contesta para las dos MATRICES, donde hay una pregunta más que CAJA no
 * puede tener: **¿en qué fila y en qué columna cae cada peso, y hay alguno que no cae en ninguna?**
 *
 * ═══ EL CONTROL NO SE VALIDA CONTRA LO QUE PRODUCE ═══
 *
 * No se le pregunta al cuadro si el cuadro está bien. Se cruzan TRES productores independientes:
 *
 *   · el LIBRO (`_MOVIMIENTOS`), que es lo que las fórmulas suman;
 *   · la GEOMETRÍA declarada (`cash-flow-matriz` + `cash-flow-conectividad`), que dice qué celda
 *     debería contener cada movimiento;
 *   · las PESTAÑAS DE ORIGEN (Compras, Cobranzas, `_CHEQUES_RAW`) y las celdas vivas de CAJA, que
 *     son de dónde salió el libro y con qué se ancla el saldo.
 *
 * Cada hallazgo sale de dos fuentes que no se conocen entre sí. Un hueco que se ve desde una sola
 * no es un hueco: es una opinión.
 *
 * SALE CON 1 SI HAY PLATA SIN COLUMNA O PLATA CONTADA DOS VECES.
 *
 *   node orquestador/scripts/cf-conectividad.mjs
 */

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { LIBRO } from '../lib/libro-sumas.mjs'
import { filaDeConcepto } from '../lib/cash-flow-matriz.mjs'
import {
  rejilla, ubicar, plataSinColumna, dobleConteoDelAncla,
  valorPorDosPuertas, rubrosEnOtros, bordesEntreVistas,
} from '../lib/cash-flow-conectividad.mjs'
import { PESTANA_SEMANAL } from '../lib/cash-flow-semanas.mjs'
import { PESTANA_MENSUAL } from '../lib/cash-flow-meses.mjs'
import { instrumentoDePago } from '../lib/caja-canales.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const fechaAR = (s) => (Number.isFinite(s)
  ? new Date(Date.UTC(1899, 11, 30) + s * 86400000).toISOString().slice(0, 10) : '—')
const raya = (n = 100) => '─'.repeat(n)

/**
 * El libro leído de su propia pestaña — no reconstruido desde las de origen.
 *
 * SE LEE LO MATERIALIZADO Y NO SE VUELVE A EXTRAER a propósito: lo que las fórmulas de las dos
 * vistas suman es ESTA tabla. Si el control corriera los extractores otra vez, estaría verificando
 * el código contra sí mismo y daría verde aunque la pestaña estuviera vieja o a medio escribir.
 */
async function leerLibro(g) {
  const filas = await g.readSheetValues(ID, `${LIBRO.pestana}!A1:P`, { render: 'UNFORMATTED_VALUE' })
  const enc = filas?.[0] ?? []
  const i = Object.fromEntries(enc.map((h, k) => [String(h).trim(), k]))
  for (const c of ['Fecha', 'Signo', 'Importe', 'Rubro', 'Estado', 'Instrumento', 'Origen']) {
    if (i[c] === undefined) {
      throw new Error(`cf-conectividad: ${LIBRO.pestana} no tiene la columna "${c}". `
        + 'Leer por posición daría un veredicto plausible y equivocado — no verifico.')
    }
  }
  return (filas ?? []).slice(1)
    .filter((f) => typeof f?.[i.Fecha] === 'number')
    .map((f) => ({
      fecha: f[i.Fecha], signo: f[i.Signo], importe: f[i.Importe], rubro: String(f[i.Rubro] ?? ''),
      estado: String(f[i.Estado] ?? ''), instrumento: String(f[i.Instrumento] ?? ''),
      contraparte: String(f[i.Contraparte] ?? ''), origen: String(f[i.Origen] ?? ''),
      fila: f[i.Fila] ?? null,
    }))
}

/**
 * Una celda con nombre, o `null`. NO devuelve 0: un cero es un saldo declarado y un `null` es "no hay
 * ancla". Confundirlos haría que el control 2 diga "ningún doble conteo" sobre una pestaña sin ancla,
 * que es el caso donde toda la cadena de saldos está rota.
 */
async function nombrado(g, nombre) {
  const v = (await g.readSheetValues(ID, nombre, { render: 'UNFORMATTED_VALUE' }))?.[0]?.[0]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * ¿Qué método de pago llega a qué fila y a qué columna de cada vista, y cuánta plata mueve?
 *
 * SE AGRUPA POR (origen, método, MEDIDA) Y SE INFORMA LA FILA DEL SUBTOTAL, no la de un rubro. Un
 * mismo método reparte su plata en varias sub-líneas —el efectivo de Compras toca Materiales, Nómina
 * y Estructura—, así que mostrar el rubro del primer movimiento del grupo sería declarar una fila
 * exacta para un conjunto que vive en catorce. Lo que SÍ es una propiedad del grupo es la medida: el
 * subtotal contiene a todos, siempre. Las sub-líneas se cuentan aparte, que es la información honesta.
 */
function porMetodo(libro, anio) {
  const gS = rejilla('semana', anio)
  const gM = rejilla('mes', anio)
  const acc = new Map()
  for (const m of libro) {
    if (m.origen !== 'Compras' && m.origen !== 'Cobranzas') continue
    const uS = ubicar(m, 'semana', gS)
    const uM = ubicar(m, 'mes', gM)
    if (!uS.medida) continue
    const k = `${m.origen}|${m.instrumento}|${uS.medida}`
    const a = acc.get(k) ?? {
      origen: m.origen, metodo: m.instrumento, medida: uS.medida,
      rotulo: ROTULO_MEDIDA[uS.medida],
      filaS: filaDeConcepto('semana', uS.medida), filaM: filaDeConcepto('mes', uS.medida),
      subLineas: new Set(), filas: 0, monto: 0, sinColumna: 0, enOtros: 0,
    }
    a.filas++
    a.monto += m.signo * m.importe
    a.subLineas.add(uS.fila)
    if (uS.enOtros) a.enOtros++
    if (uS.columna === null || uM.columna === null) a.sinColumna++
    acc.set(k, a)
  }
  return [...acc.values()].sort((a, b) => (a.origen === b.origen
    ? Math.abs(b.monto) - Math.abs(a.monto) : a.origen.localeCompare(b.origen)))
}

/** Los rótulos de las cuatro medidas, tal como los escribe la pestaña. */
const ROTULO_MEDIDA = {
  ingresoReal: 'Ingresos reales', ingresoProyectado: 'Ingresos proyectados',
  egresoReal: 'Egresos reales', egresoProyectado: 'Egresos proyectados',
}

/** Los métodos de pago que Compras declara hoy — de la pestaña, no de una lista tipeada acá. */
async function metodosDeclarados(g) {
  const filas = await g.readSheetValues(ID, 'Compras!P4:P', { render: 'UNFORMATTED_VALUE' })
  const s = new Set()
  for (const f of filas ?? []) {
    const t = String(f?.[0] ?? '').trim()
    if (t) s.add(`${t} → ${instrumentoDePago(t)}`)
  }
  return [...s].sort()
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const anio = Number(process.env.ORQ_CF_ANIO) || new Date().getUTCFullYear()
  const libro = await leerLibro(g)
  const fechaSaldo = await nombrado(g, 'CAJA_FECHA_SALDO')
  const total = await nombrado(g, 'CAJA_TOTAL_DISPONIBLE')
  let rojo = 0

  console.log(`\n¿COMPRAS Y COBRANZAS LLEGAN A LAS DOS VISTAS DE CASH FLOW ${anio}?`)
  console.log(`  libro: ${libro.length} movimientos · CAJA_TOTAL_DISPONIBLE ${pesos(total ?? 0)}`
    + ` al ${fechaAR(fechaSaldo)}`)
  console.log(`  vistas: "${PESTANA_SEMANAL}" (${rejilla('semana', anio).length} columnas)`
    + ` · "${PESTANA_MENSUAL}" (${rejilla('mes', anio).length} columnas)`)

  console.log(`\nMÉTODOS DE PAGO QUE DECLARA COMPRAS HOY (columna P)`)
  console.log(raya())
  for (const m of await metodosDeclarados(g)) console.log(`  · ${m}`)

  console.log(`\n¿EN QUÉ FILA Y CUÁNTA PLATA? (fila del subtotal SEM/MES · sub-líneas que toca)`)
  console.log(raya(112))
  for (const v of porMetodo(libro, anio)) {
    const marca = v.sinColumna ? '✗' : '✓'
    console.log(`  ${marca} ${v.origen.padEnd(10)} ${String(v.metodo).padEnd(14)}`
      + ` ${pesos(v.monto).padStart(16)} ${String(v.filas).padStart(4)} mov`
      + `  f${String(v.filaS).padStart(2)}/${String(v.filaM).padStart(2)} ${v.rotulo.padEnd(21)}`
      + ` ${v.subLineas.size} sub-línea(s)${v.enOtros ? ` · ${v.enOtros} en "· Otros"` : ''}`)
  }

  // ── 1. LA PARTICIÓN: ¿hay plata que no cae en ninguna columna? ───────────────────────────────────
  console.log(`\n1 · PLATA SIN COLUMNA — el movimiento existe en el libro y no está en el cuadro`)
  console.log(raya())
  for (const [tipo, pest] of [['semana', PESTANA_SEMANAL], ['mes', PESTANA_MENSUAL]]) {
    const v = plataSinColumna(libro, tipo, anio)
    if (!v.filas) { console.log(`  ✓ ${pest.padEnd(20)} ningún movimiento queda fuera de toda columna.`); continue }
    rojo++
    console.log(`  ✗ ${pest.padEnd(20)} ${v.filas} mov · ${pesos(v.neto)} que NINGUNA celda contiene`)
    for (const o of v.porOrigen) {
      console.log(`      · ${o.origen.padEnd(28)} ${o.estado.padEnd(13)} ${String(o.filas).padStart(3)} mov ${pesos(o.neto).padStart(16)}`)
    }
    for (const m of v.movimientos.slice(0, 6)) {
      console.log(`        ${fechaAR(m.fecha)} ${String(m.origen).padEnd(24)} f${m.fila} ${pesos(m.signo * m.importe)}`)
    }
  }
  const b = bordesEntreVistas(libro, anio)
  console.log(`\n  las semanas ISO del cuadro tocan el año vecino — semanal [${fechaAR(b.semanal.desde)}, ${fechaAR(b.semanal.hasta)})`
    + ` vs mensual [${fechaAR(b.mensual.desde)}, ${fechaAR(b.mensual.hasta)})`)
  console.log(`  del año vecino, a la vista en el rango pero FUERA de los totales: ${b.soloSemanal.length} mov · ${pesos(b.neto)}`)
  console.log('  (desde el 13/08 la ventana de las columnas de borde se recorta en el 1° de enero, así que')
  console.log('   esa plata no está en ningún TOTAL: las dos vistas tienen que coincidir, y se controla.)')

  // ── 2. EL IMPACTO EN SALDOS: lo que el ancla ya contiene y la columna vuelve a contar ────────────
  console.log(`\n2 · IMPACTO EN SALDOS — ¿el saldo declarado ya contiene lo que la columna vuelve a sumar?`)
  console.log(raya())
  if (fechaSaldo === null) {
    rojo++
    console.log('  ✗ CAJA_FECHA_SALDO no devuelve un número: sin ancla, TODA la cadena de saldos de las')
    console.log('    dos vistas queda en blanco o pegada al saldo declarado. No se puede verificar nada más.')
  } else {
    const d = dobleConteoDelAncla(libro, fechaSaldo)
    if (!d.filas) {
      console.log(`  ✓ ningún REAL con fecha posterior a ${fechaAR(fechaSaldo)}: el ancla y las columnas no se pisan.`)
    } else {
      rojo++
      console.log(`  ✗ ${d.filas} movimientos REAL con fecha POSTERIOR a CAJA_FECHA_SALDO (${fechaAR(fechaSaldo)}):`)
      console.log(`    entra ${pesos(d.entra)} · sale ${pesos(d.sale)} · neto ${pesos(d.neto)}`)
      for (const m of d.movimientos) {
        console.log(`      ${fechaAR(m.fecha)} ${String(m.origen).padEnd(22)} f${String(m.fila).padEnd(6)}`
          + ` ${String(m.instrumento).padEnd(14)} ${pesos(m.signo * m.importe).padStart(16)} ${m.contraparte.slice(0, 30)}`)
      }
      console.log('')
      console.log('    LA ARITMÉTICA: el saldo inicial del período ancla es')
      console.log('        CAJA_TOTAL_DISPONIBLE − REAL[inicio del período , CAJA_FECHA_SALDO]')
      console.log('    y CAJA_TOTAL_DISPONIBLE NO está acotado por esa fecha: su línea "Movimientos')
      console.log('    posteriores al corte" incluye todo lo real posterior al corte del extracto, sin techo.')
      console.log('    Esta plata está DENTRO del saldo declarado, el término del ancla no la resta, y la')
      console.log('    columna de su propia fecha la vuelve a sumar. Mueve el SALDO FINAL de esa columna y')
      console.log('    de todas las siguientes.')
      console.log('    ⚠ DECISIÓN DE ARQUITECTURA, NO UN PARCHE: cambiar la ventana del ancla cambia también')
      console.log('      lo que mide el control A5 del anexo de CAJA, que verifica exactamente esa identidad.')
    }
  }

  // ── 3. EL MISMO VALOR POR DOS PUERTAS ────────────────────────────────────────────────────────────
  console.log(`\n3 · EL MISMO VALOR POR DOS PUERTAS — Cobranzas y "Valores en cartera"`)
  console.log(raya())
  const pares = valorPorDosPuertas(libro)
  if (!pares.length) {
    console.log('  ✓ ningún cobro con cheque/echeq coincide en monto y fecha con un valor de la cartera.')
  } else {
    rojo++
    const suma = pares.reduce((a, x) => a + x.importe, 0)
    console.log(`  ✗ ${pares.length} valor(es) por ${pesos(suma)} suman DOS VECES en "Ingresos proyectados":`)
    for (const x of pares) {
      console.log(`      ${fechaAR(x.fecha)} ${pesos(x.importe).padStart(16)}`
        + `  ${x.cobranzas.origen} f${x.cobranzas.fila} (${x.cobranzas.estado})`
        + ` ‖ ${x.cartera.origen} f${x.cartera.fila} (${x.cartera.estado})`)
    }
    console.log('    Las dos filas tienen claves de dedup distintas porque Cobranzas no trae el número del')
    console.log('    cheque, así que `deduplicar` no las puede colapsar. El emparejamiento por (monto, fecha)')
    console.log('    es una HEURÍSTICA: por eso esto reporta y no borra. Cargar el número del valor en')
    console.log('    Cobranzas es una decisión de datos del dueño, no algo que el código pueda deducir.')
  }

  // ── 4. LOS RUBROS QUE SE ESCONDEN EN "· Otros" ───────────────────────────────────────────────────
  console.log(`\n4 · RUBROS QUE CAEN EN "· Otros" — la plata está, el nombre no`)
  console.log(raya())
  const otros = rubrosEnOtros(libro)
  if (!otros.length) console.log('  ✓ todo rubro del libro tiene su sub-línea en la vista.')
  for (const r of otros) {
    console.log(`  · ${(r.signo === 1 ? 'ENTRA' : 'SALE ')} ${String(r.rubro).padEnd(40)}`
      + ` ${String(r.filas).padStart(3)} mov ${pesos(r.monto).padStart(16)}`)
  }
  if (otros.length) {
    console.log('    No es un hueco: "Otros" se DESPEJA del subtotal, así que el total sigue cerrando. Lo')
    console.log('    que no se puede leer es de quién vuelve esa plata — son notas de crédito de proveedor,')
    console.log('    que entran con signo de ingreso y rubro de egreso.')
  }

  console.log(`\n${raya()}`)
  if (rojo) {
    console.log(`  ✗ ${rojo} control(es) en rojo. Hay plata que no está en ninguna celda, o está en dos.\n`)
    process.exitCode = 1
  } else {
    console.log('  ✓ cada peso del libro cae en exactamente una fila y una columna de cada vista.\n')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
