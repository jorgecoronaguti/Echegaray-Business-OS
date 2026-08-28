#!/usr/bin/env node
// `Planilla para Cotizar (2).xlsm` → la auditoría de moneda, ajuste y genealogía. SÓLO LECTURA.
//
//   node orquestador/scripts/auditar-planilla-cotizar.mjs           ← usa el caché si el hash no cambió
//   node orquestador/scripts/auditar-planilla-cotizar.mjs --forzar  ← reprocesa igual
//   node orquestador/scripts/auditar-planilla-cotizar.mjs --json    ← el informe entero, para diffear
//
// NO TOCA EL LIBRO. Lo abre en modo lectura y nada más: el .xlsm es evidencia y es del dueño.
//
// ═══ POR QUÉ EL HASH GOBIERNA ═══
//
// Esto es una INGESTIÓN, no algo que corra en cada cotización. Leer las 16 hojas y sus 10.400
// fórmulas tarda segundos y no cambia mientras el archivo no cambie. Si el sha256 coincide con el
// del último informe, se devuelve ese informe y no se abre el archivo: el trabajo frío se hace una
// vez y el caliente es leer un JSON.
//
// ═══ CERO LLAMADAS A CLAUDE ═══
//
// Todo lo que hace este comando es determinístico: `monedaDe` mira la unidad y el nombre,
// `clasificarAjuste` cruza la composición contra la cotización del libro, `auditarOferta` compara
// dos listas. Con el saldo de Claude en cero, la auditoría entera sigue corriendo igual — que es la
// condición que el OS tiene que cumplir para que XSAS siga cotizando.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import XLSX from 'xlsx'
import { aISO, ANA, REC, numero, texto, codigo } from '../lib/base-maestra-xlsm.mjs'
import { MONEDA, costoPresupuestario, monedaDe, monedaDeComposicion, tipoDeCambioDeLibro } from '../lib/base-maestra-moneda.mjs'
import { TIPO_AJUSTE, aplicarAjuste, clasificarAjuste, repasoDeAjustes } from '../lib/base-maestra-ajuste.mjs'
import { COTEJO, cotejar, resumirCotejo } from '../lib/base-maestra-cotejo.mjs'
import { auditarOferta } from '../lib/conocimiento/genealogia-oferta.mjs'

const LIBRO = process.argv.find((a) => a.endsWith('.xlsm')) ?? '/home/jorge/Planilla para Cotizar (2).xlsm'
const CACHE = resolve(process.cwd(), 'orquestador/datos/conocimiento/planilla-cotizar-auditoria.json')
const FORZAR = process.argv.includes('--forzar')
const JSON_CRUDO = process.argv.includes('--json')

const celda = (h, ref) => { const c = h[ref]; return c === undefined || c.v === undefined ? null : (c.t === 'e' ? { error: c.w ?? '#ERROR' } : c.v) }
const $ = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** Lo que ya se sabe del archivo, si el archivo es el mismo. */
function cacheVigente(hash) {
  if (FORZAR) return null
  try {
    const previo = JSON.parse(readFileSync(CACHE, 'utf8'))
    return previo.hash === hash ? previo : null
  } catch { return null }
}

/** Las filas de `Recursos`, con la moneda ya resuelta. */
function leerRecursos(wb) {
  const h = wb.Sheets.Recursos
  const fin = XLSX.utils.decode_range(h['!ref']).e.r + 1
  const recursos = []
  for (let f = 5; f <= fin; f++) {
    const cod = codigo(celda(h, REC.codigo + f))
    const nombre = texto(celda(h, REC.nombre + f))
    if (!cod || !nombre) continue
    const unidad = texto(celda(h, REC.unidad + f))
    const m = monedaDe({ nombre, unidad })
    recursos.push({
      fila: f, codigo: cod, nombre, unidad,
      costo: numero(celda(h, REC.costo + f)),
      fecha: aISO(celda(h, REC.fecha + f)),
      fuente: texto(celda(h, REC.fuente + f)),
      familia: texto(celda(h, REC.familia + f)),
      desperdicio: numero(celda(h, REC.desperdicio + f)) ?? 0,
      moneda: m.moneda, confianzaMoneda: m.confianza, porqueMoneda: m.porque,
    })
  }
  return recursos
}

/** Las composiciones de `Análisis`: `{ codigoTarea: { nombre, unidad, fila, lineas[] } }`. */
function leerComposiciones(wb, porCodigo) {
  const h = wb.Sheets['Análisis']
  const fin = XLSX.utils.decode_range(h['!ref']).e.r + 1
  const tareas = new Map()
  let actual = null
  for (let f = 7; f <= fin; f++) {
    const esLinea = /VLOOKUP/i.test(h[ANA.descripcion + f]?.f ?? '')
    const codT = codigo(celda(h, ANA.tarea + f))
    if (!esLinea && codT !== null) {
      actual = { codigo: codT, nombre: texto(celda(h, ANA.descripcion + f)), unidad: texto(celda(h, ANA.unidad + f)), fila: f, lineas: [] }
      if (!tareas.has(codT)) tareas.set(codT, actual)
      continue
    }
    const codR = codigo(celda(h, ANA.recurso + f))
    if (!actual || codR === null) continue
    const r = porCodigo.get(codR)
    const cantidad = numero(celda(h, ANA.cantidad + f))
    if (!r || cantidad === null) continue
    const c = costoPresupuestario({ observado: r.costo ?? 0, desperdicio: r.desperdicio, moneda: r.moneda })
    actual.lineas.push({ fila: f, codigoRecurso: codR, nombre: r.nombre, cantidad, moneda: r.moneda, ...c, importe: cantidad * c.presupuestario })
  }
  return tareas
}

/** Los renglones de `Presupuesto`, con su coeficiente ya clasificado. */
function leerPresupuesto(wb, composiciones, tipoDeCambio) {
  const h = wb.Sheets.Presupuesto
  const items = []
  for (let f = 8; f <= 51; f++) {
    const cod = codigo(celda(h, 'B' + f))
    if (!cod) continue
    const comp = composiciones.get(cod) ?? composiciones.get(cod.toUpperCase()) ?? null
    const composicion = comp ? monedaDeComposicion(comp.lineas) : null
    const ajuste = clasificarAjuste({ coeficiente: numero(celda(h, 'G' + f)), composicion, tipoDeCambio, donde: `Presupuesto!G${f}` })
    const costoUnitarioExcel = numero(celda(h, 'F' + f))
    const costoXSAS = comp ? comp.lineas.reduce((s, l) => s + l.importe, 0) : null
    items.push({
      fila: f, codigo: cod, tarea: texto(celda(h, 'C' + f)), unidad: texto(celda(h, 'D' + f)),
      cantidad: numero(celda(h, 'E' + f)),
      costoUnitarioExcel, costoUnitarioXSAS: costoXSAS,
      monedaComposicion: composicion?.moneda ?? null,
      subtotalExcel: numero(celda(h, 'H' + f)),
      ajuste,
      convertido: aplicarAjuste({ costoUnitario: costoXSAS, moneda: composicion?.moneda ?? MONEDA.ARS, ajuste }),
      nLineas: comp?.lineas.length ?? 0,
    })
  }
  return items
}

/** La hoja OFERTA como matriz de filas, tal cual la espera `auditarOferta`. */
function filasDe(wb, hoja) {
  const h = wb.Sheets[hoja]
  if (!h) return []
  return XLSX.utils.sheet_to_json(h, { header: 1, raw: true, defval: null, blankrows: true })
}

/** Los renglones de la hoja OFERTA, leídos por posición conocida (A=cod, B=tarea, …, F=subtotal). */
function leerOfertaDelLibro(wb) {
  const h = wb.Sheets.OFERTA
  const fin = XLSX.utils.decode_range(h['!ref']).e.r + 1
  const items = []
  let subtotal = null
  for (let f = 13; f <= fin; f++) {
    if (String(celda(h, 'D' + f) ?? '').trim().toUpperCase().startsWith('SUB TOTAL')) {
      const c = h['F' + f]
      subtotal = { valor: c?.t === 'e' ? null : numero(c?.v), error: c?.t === 'e' ? (c.w ?? '#ERROR') : null, celda: `F${f}` }
      break
    }
    const tarea = texto(celda(h, 'B' + f))
    if (!tarea) continue
    items.push({
      codigo: codigo(celda(h, 'A' + f)), tarea, unidad: texto(celda(h, 'C' + f)),
      cantidad: numero(celda(h, 'D' + f)), precioUnitario: numero(celda(h, 'E' + f)),
      subtotal: numero(celda(h, 'F' + f)), celda: `A${f}`,
    })
  }
  return { items, subtotal, encabezado: { fila: 11, columnas: { CODIGO: 0, TAREA: 1, UN: 2, CANT: 3, PRECIO: 4, 'SUB TOTAL': 5 } } }
}

/**
 * EL COTEJO EXCEL-CONTRA-XSAS de las partidas representativas.
 *
 * Se cotejan DOS cosas por partida y no una, porque miden cosas distintas:
 *
 *  · el COSTO UNITARIO prueba la composición —cantidades, precios, desperdicios— y ahí los dos
 *    tienen que dar lo mismo salvo el redondeo de dos decimales que Excel hace línea por línea;
 *  · el SUBTOTAL prueba el AJUSTE, y ahí es donde el modelo nuevo se separa a propósito: un
 *    coeficiente que nadie pudo explicar no se aplica, así que T1058 pasa de $ 2.616.960 a
 *    $ 1.308.480 y esa diferencia es el trabajo, no un error.
 *
 * Las siete elegidas cubren MO intensiva (T1001 replanteo), material intensiva (T1018
 * mampostería, T1107.2 piso), hormigón (T1007 viga), un rubro con coeficiente sin explicar
 * (T1058 eléctrica), un subcontrato (T1122 escombros) y la única partida en dólares (T1126.1).
 */
function cotejarPartidas(items) {
  const elegidas = ['T1001', 'T1007', 'T1018', 'T1107.2', 'T1058', 'T1122', 'T1126.1']
  const resultados = []
  for (const i of items.filter((x) => elegidas.includes(x.codigo))) {
    resultados.push(cotejar({
      que: `${i.codigo} · costo unitario · ${i.tarea}`,
      excel: i.costoUnitarioExcel,
      xsas: i.costoUnitarioXSAS,
    }))
    const esFX = i.ajuste.tipo === TIPO_AJUSTE.FX
    const sinResolver = i.ajuste.tipo === TIPO_AJUSTE.UNKNOWN
    // El subtotal del sistema: cantidad × costo unitario, con el ajuste aplicado SÓLO si se explicó.
    const xsas = i.cantidad === null || i.convertido.valor === null ? null : i.cantidad * i.convertido.valor
    resultados.push(cotejar({
      que: `${i.codigo} · subtotal · ${i.tarea}`,
      excel: i.subtotalExcel,
      xsas,
      explicacion: sinResolver
        ? `el Excel multiplica por un coeficiente ${i.ajuste.valor} que no se pudo explicar (${i.ajuste.donde}) y acá NO se aplica: la partida queda en su costo sin ajustar hasta que alguien diga qué es ese número`
        : esFX
          ? `el Excel redondea a dos decimales el costo de cada línea antes de convertir; acá se convierte con precisión completa a ${i.ajuste.valor} $/USD`
          : null,
      clase: sinResolver || esFX ? COTEJO.CAMBIO_DE_MODELO : null,
    }))
  }
  return resultados
}

function auditar() {
  const bytes = readFileSync(LIBRO)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const previo = cacheVigente(hash)
  if (previo) return { ...previo, deCache: true }

  const wb = XLSX.read(bytes, { cellFormula: true, type: 'buffer' })
  const hojas = wb.SheetNames.map((n) => {
    const h = wb.Sheets[n]
    let formulas = 0, errores = 0
    for (const k of Object.keys(h)) { if (k[0] === '!') continue; if (h[k].f) formulas++; if (h[k].t === 'e') errores++ }
    return { nombre: n, formulas, errores, oculta: Boolean((wb.Workbook?.Sheets ?? []).find((s) => s.name === n)?.Hidden) }
  })

  const recursos = leerRecursos(wb)
  const porCodigo = new Map(recursos.map((r) => [r.codigo, r]))
  const tipoDeCambio = tipoDeCambioDeLibro(recursos)
  const composiciones = leerComposiciones(wb, porCodigo)
  const presupuesto = leerPresupuesto(wb, composiciones, tipoDeCambio)
  const oferta = leerOfertaDelLibro(wb)
  const auditoriaOferta = auditarOferta({
    oferta,
    presupuesto: { items: presupuesto.map((p) => ({ codigo: p.codigo, tarea: p.tarea, celda: `B${p.fila}` })) },
    filasDeLaOferta: filasDe(wb, 'OFERTA'),
  })

  const informe = {
    hash, libro: LIBRO, ingestadoEn: new Date().toISOString(), deCache: false,
    hojas,
    monedas: contar(recursos.map((r) => r.moneda)),
    tipoDeCambio,
    recursosUSD: recursos.filter((r) => r.moneda === MONEDA.USD).map((r) => ({ fila: r.fila, codigo: r.codigo, nombre: r.nombre, costo: r.costo, unidad: r.unidad })),
    recursosAmbiguos: recursos.filter((r) => r.moneda === MONEDA.AMBIGUA).map((r) => ({ fila: r.fila, codigo: r.codigo, nombre: r.nombre, costo: r.costo, porque: r.porqueMoneda })),
    recursosSinPrecio: recursos.filter((r) => r.costo === null || r.costo === 0).length,
    nRecursos: recursos.length,
    nComposiciones: composiciones.size,
    nLineas: [...composiciones.values()].reduce((s, t) => s + t.lineas.length, 0),
    ajustes: repasoDeAjustes(presupuesto.map((p) => p.ajuste)),
    partidas: presupuesto.map((p) => ({
      codigo: p.codigo, tarea: p.tarea, unidad: p.unidad, cantidad: p.cantidad, nLineas: p.nLineas,
      monedaComposicion: p.monedaComposicion,
      costoUnitarioExcel: p.costoUnitarioExcel, costoUnitarioXSAS: p.costoUnitarioXSAS,
      ajuste: { tipo: p.ajuste.tipo, valor: p.ajuste.valor, porque: p.ajuste.porque, donde: p.ajuste.donde },
      convertido: { valor: p.convertido.valor, moneda: p.convertido.moneda, aplicado: p.convertido.aplicado },
    })),
    oferta: {
      puedeEmitirse: auditoriaOferta.puedeEmitirse,
      bloqueos: auditoriaOferta.bloqueos,
      conciliacion: auditoriaOferta.conciliacion,
    },
    cotejo: resumirCotejo(cotejarPartidas(presupuesto)),
    cotejoDetalle: cotejarPartidas(presupuesto),
  }
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, `${JSON.stringify(informe, null, 2)}\n`)
  return informe
}

const contar = (xs) => xs.reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})

function imprimir(i) {
  if (JSON_CRUDO) { process.stdout.write(`${JSON.stringify(i, null, 2)}\n`); return }
  console.log(`\n═══ ${i.libro}`)
  console.log(`sha256 ${i.hash}`)
  console.log(`${i.deCache ? 'DEL CACHÉ (el hash no cambió: no se reprocesó)' : `ingestado ${i.ingestadoEn}`}`)
  console.log(`\n── HOJAS (${i.hojas.length}) ──`)
  for (const h of i.hojas) console.log(`  ${h.nombre.padEnd(24)} fórmulas=${String(h.formulas).padStart(5)} errores=${String(h.errores).padStart(4)}${h.oculta ? '  OCULTA' : ''}`)

  console.log(`\n── RECURSOS: ${i.nRecursos} · ${i.nComposiciones} composiciones · ${i.nLineas} líneas ──`)
  console.log(`  monedas: ${JSON.stringify(i.monedas)} · sin precio: ${i.recursosSinPrecio}`)
  console.log(`  tipo de cambio del libro: ${i.tipoDeCambio ? `$ ${$(i.tipoDeCambio.valor)} al ${i.tipoDeCambio.fecha} · ${i.tipoDeCambio.fuente} · ${i.tipoDeCambio.origen}` : 'NO DECLARADO'}`)
  for (const r of i.recursosUSD) console.log(`  USD  ${String(r.codigo).padEnd(7)} ${String(r.costo).padStart(8)} ${r.unidad.padEnd(6)} ${r.nombre}`)
  for (const r of i.recursosAmbiguos) console.log(`  ¿?   ${String(r.codigo).padEnd(7)} ${String(r.costo).padStart(8)} ${r.nombre}`)

  console.log(`\n── COEF. AJUSTE: ${i.ajustes.total} renglones ── ${JSON.stringify(i.ajustes.porTipo)}`)
  for (const p of i.partidas.filter((p) => p.ajuste.tipo !== TIPO_AJUSTE.NEUTRO)) {
    console.log(`  ${p.ajuste.donde.padEnd(18)} ${String(p.ajuste.valor).padStart(7)} → ${p.ajuste.tipo.padEnd(8)} ${p.codigo} ${String(p.tarea).slice(0, 34)}`)
    console.log(`  ${' '.repeat(18)} ${p.ajuste.porque}`)
  }
  console.log(`  ${i.ajustes.bloquea ? `BLOQUEA: ${i.ajustes.sinResolver.length} ajuste(s) sin explicar` : 'todos los ajustes están explicados'}`)

  console.log('\n── OFERTA ──')
  const c = i.oferta.conciliacion
  console.log(`  con genealogía  $ ${$(c.conGenealogia)}`)
  console.log(`  SIN genealogía  $ ${$(c.sinGenealogia)}`)
  console.log(`  declarado       $ ${$(c.declarado)} (diferencia ${$(c.diferencia)})`)
  console.log(`  ¿se puede emitir? ${i.oferta.puedeEmitirse ? 'SÍ' : 'NO'}`)
  for (const b of i.oferta.bloqueos) console.log(`    ✗ ${b.tipo.padEnd(24)} ${String(b.donde).padEnd(6)} ${String(b.que ?? '').slice(0, 44).padEnd(44)} ${b.importe !== null ? `$ ${$(b.importe)}` : ''}`)

  console.log(`\n── COTEJO EXCEL vs XSAS ── ${JSON.stringify(i.cotejo.porClase)} · ${i.cotejo.pasa ? 'PASA' : 'NO PASA'}`)
  for (const d of i.cotejoDetalle) {
    console.log(`  ${d.cotejo.padEnd(20)} excel=${String($(d.excel)).padStart(14)}  xsas=${String($(d.xsas)).padStart(14)}  ${d.que}`)
    if (d.cotejo !== COTEJO.MATCH) console.log(`  ${' '.repeat(20)} ${d.porque}`)
  }
  console.log()
}

imprimir(auditar())
