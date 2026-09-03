#!/usr/bin/env node
// ¿EL MODELO DEL OS SIGUE SIENDO EL DEL LIBRO DEL DUEÑO? — la medición, no la afirmación.
//
// El cotizador se reconstruyó leyendo `Planilla para Cotizar.xlsm` y nadie volvió a compararlos
// hoja por hoja. Este script lo hace y devuelve NÚMEROS: la cascada escalón por escalón, el costo
// unitario de cada análisis, los precios de cada recurso, y una cotización completa por los dos
// caminos con su diferencia en pesos.
//
// NO CORRIGE NADA. La planilla es del dueño y una diferencia puede ser un criterio suyo que el
// código no capturó, o un error del libro que el código arregló sin decirlo. Las dos versiones
// salen impresas y la decisión es de él.
//
// LA COPIA VIGENTE es la PLANTILLA MADRE: Drive `1GBgblLgp_ns7C5nm9alSMvigCZkWdtH9`, en la raíz de
// `administracion/PRESUPUESTOS - CLIENTES/`. Las otras ocho copias del `.xlsm` viven DENTRO de una
// carpeta de obra (ARCOR, MESSINA, LA ESTRELLA…): son instancias de trabajo derivadas de ésta, no
// la plantilla. Medir contra una de ellas es medir contra una foto congelada de una cotización.
//
//   node orquestador/scripts/verificar-planilla-cotizar.mjs --libro <ruta.xlsm> [--con-base]
//
// `--con-base` agrega el cruce contra Postgres (tarea_tipo / analisis_linea / recurso_costo). Sin
// él, el script sólo audita el libro contra sí mismo, que es la mitad que no necesita credenciales.

import { createRequire } from 'node:module'
import { cascadaDelLibro } from '../lib/cotizador/libro-planilla.mjs'
import { cascada, politicaComercial } from '../lib/cotizador/comercial.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const COD_TAREA = /^T\d{4}(\.\d+)?$/
const LIBRO_POR_DEFECTO = '/home/jorge/Planilla para Cotizar (2).xlsm'
const fm = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** ¿EL LIBRO CALCULA CON «PRECISIÓN COMO SE MUESTRA»?
 *
 *  `<calcPr fullPrecision="0"/>` es una opción de LIBRO, no de celda: Excel trunca CADA valor a los
 *  decimales que la celda muestra, en cada paso. Un recurso de $16,9116 formateado a dos decimales
 *  vale $16,91 para todo el resto del cálculo. El OS calcula con doble precisión y NO lo replica,
 *  así que los dos modelos divergen por diseño en todas las celdas de pocos decimales — sobre todo
 *  en los recursos en dólares, donde dos decimales son medio punto porcentual.
 *
 *  Se MIDE cada vez porque es una casilla que el dueño puede tildar o destildar sin avisar. */
export function precisionComoSeMuestra(wb) {
  const xml = wb?.files?.['xl/workbook.xml']
  const txt = typeof xml?.asNodeBuffer === 'function' ? xml.asNodeBuffer().toString('utf8') : String(xml?._data?.getContent ? Buffer.from(xml._data.getContent()).toString('utf8') : (xml?.content ?? ''))
  return /fullPrecision="0"/.test(txt)
}

function args(argv) {
  const i = argv.indexOf('--libro')
  return { libro: i >= 0 ? argv[i + 1] : LIBRO_POR_DEFECTO, conBase: argv.includes('--con-base') }
}

const celda = (hoja, col, fila) => hoja[`${col}${fila}`]?.v ?? null
const formula = (hoja, col, fila) => hoja[`${col}${fila}`]?.f ?? null

/** Los bloques de la hoja Análisis. Un bloque arranca en una fila cuya columna A es un código
 *  `T####[.n]` y termina donde arranca el siguiente. OJO: en A también hay ETIQUETAS libres del
 *  dueño («TAPA», «MALLA», «ENCOFRADO») que NO abren un bloque nuevo — son las etapas de un mismo
 *  análisis, y tomarlas por códigos parte una tarea en dos y le roba la mitad del costo. */
export function leerAnalisis(wb) {
  const h = wb.Sheets['Análisis']
  const bloques = []
  for (let r = 6; r <= 1779; r++) {
    const a = celda(h, 'A', r)
    if (typeof a === 'string' && COD_TAREA.test(a.trim())) {
      bloques.push({ codigo: a.trim(), fila: r, descripcion: celda(h, 'C', r), unidad: celda(h, 'D', r), g: celda(h, 'G', r), sum: formula(h, 'G', r), lineas: [] })
    }
  }
  for (let i = 0; i < bloques.length; i++) {
    const fin = i + 1 < bloques.length ? bloques[i + 1].fila - 1 : 1779
    for (let r = bloques[i].fila + 1; r <= fin; r++) {
      const g = celda(h, 'G', r)
      if (typeof g !== 'number') continue
      const b = celda(h, 'B', r)
      // COD R VACÍO NO ES «SIN RECURSO»: el VLOOKUP de Excel lee la celda en blanco como 0, y el
      // recurso 0 del libro es OFICIAL ESPECIALIZADO. Saltear esa fila borra mano de obra real.
      bloques[i].lineas.push({ fila: r, recurso: b === null || String(b).trim() === '' ? '0' : String(b).trim(), recursoEnBlanco: b === null || String(b).trim() === '', descripcion: celda(h, 'C', r), cantidad: celda(h, 'E', r), precio: celda(h, 'F', r), total: g })
    }
  }
  return bloques
}

/** Los recursos con su precio ya con desperdicio (columna J = D×(1+I)). */
export function leerRecursos(wb) {
  const h = wb.Sheets['Recursos']
  const out = new Map()
  for (let r = 5; r <= 414; r++) {
    const a = celda(h, 'A', r)
    if (a === null || String(a).trim() === '' || !Number.isFinite(Number(a))) continue
    out.set(String(a).trim(), { nombre: celda(h, 'B', r), unidad: celda(h, 'C', r), costo: celda(h, 'D', r), desperdicio: celda(h, 'I', r), conDesperdicio: celda(h, 'J', r) })
  }
  return out
}

/** La cascada y las líneas cotizadas de la hoja Presupuesto. */
export function leerPresupuesto(wb) {
  const h = wb.Sheets['Presupuesto']
  const lineas = []
  for (let r = 10; r <= 51; r++) {
    const b = celda(h, 'B', r)
    if (b === null || String(b).trim() === '') continue
    lineas.push({ fila: r, codigo: String(b).trim(), cantidad: celda(h, 'E', r), costoUnitario: celda(h, 'F', r), coefAjuste: celda(h, 'G', r) ?? 1, subtotal: celda(h, 'H', r) })
  }
  const c = {}
  for (const k of ['H62', 'H64', 'H66', 'H68', 'H69', 'H71', 'H73', 'H75', 'H77', 'H79', 'H81', 'H83', 'H86', 'H89', 'I52']) c[k] = h[k]?.v ?? null
  const p = {}
  for (const [k, cel] of [['pctGastosGenerales', 'E64'], ['pctBeneficio', 'E68'], ['pctFinanciero', 'E71'], ['factorFinanciero', 'F71'], ['pctIibb', 'E73'], ['pctGanancias', 'E75'], ['pctCheque', 'E79'], ['pctIva', 'E83']]) p[k] = h[cel]?.v ?? null
  return { lineas, cascada: c, porcentajes: p }
}

/** Las 12 discrepancias del libro CONSIGO MISMO: el `SUM(...)` que no cubre su bloque. Sale acá y
 *  no en un comentario porque el rango se mueve cada vez que alguien inserta una fila. */
function auditarBloques(bloques) {
  const filas = []
  for (const b of bloques) {
    const suma = b.lineas.reduce((a, l) => a + Number(l.total), 0)
    const enBlanco = b.lineas.filter((l) => l.recursoEnBlanco).reduce((a, l) => a + Number(l.total), 0)
    const dif = suma - Number(b.g ?? 0)
    if (Math.abs(dif) > 0.05 || enBlanco > 0) filas.push({ ...b, suma, dif, enBlanco })
  }
  return filas.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))
}

function imprimirCascada(libro, pol) {
  const A = cascadaDelLibro({ costoDirecto: libro.H62, politica: pol })
  const B = cascada({ costoDirecto: libro.H62, politica: pol })
  console.log('\n═══ 1 · LA CASCADA, ESCALÓN POR ESCALÓN ═══')
  console.log('escalón'.padEnd(20), 'celda'.padEnd(6), 'libro'.padStart(18), 'libro replicado'.padStart(18), 'comercial.mjs'.padStart(18), 'dif código−libro'.padStart(18))
  const filas = [['COSTO DIRECTO', 'H62', 'costoDirecto'], ['GASTOS GRALES', 'H64', 'gastosGenerales'], ['COSTO INDUSTRIAL', 'H66', 'costoIndustrial'], ['BENEFICIO', 'H68', 'beneficio'], ['COSTO FINANCIERO', 'H71', 'financiero'], ['IIBB+LOTE HOGAR', 'H73', 'iibb'], ['GANANCIAS', 'H75', 'ganancias'], ['SUBTOTAL', 'H77', 'subtotal'], ['IMP. AL CHEQUE', 'H79', 'impuestoCheque'], ['VENTA SIN IVA', 'H81', 'ventaSinIva'], ['IVA', 'H83', 'iva'], ['VENTA FINAL', 'H86', 'ventaFinal']]
  for (const [n, cel, k] of filas) console.log(n.padEnd(20), cel.padEnd(6), fm(libro[cel]).padStart(18), fm(A[k]).padStart(18), fm(B[k]).padStart(18), fm(B[k] - libro[cel]).padStart(18))
  console.log('COEFICIENTE'.padEnd(20), 'H89'.padEnd(6), String(libro.H89).padStart(18), String(A.coeficienteConIva).padStart(18), String(B.coeficienteConIva).padStart(18))
  return { A, B }
}

async function main() {
  const { libro: ruta, conBase } = args(process.argv)
  const wb = XLSX.readFile(ruta, { cellFormula: true, bookFiles: true })
  console.log(`libro: ${ruta}`)
  console.log(`«precisión como se muestra» (calcPr fullPrecision="0"): ${precisionComoSeMuestra(wb) ? 'ACTIVADA — el libro TRUNCA cada valor a sus decimales visibles' : 'no'}`)
  console.log(`hojas: ${wb.SheetNames.length} · ${wb.SheetNames.join(' · ')}`)

  const presu = leerPresupuesto(wb)
  const bloques = leerAnalisis(wb)
  const recursos = leerRecursos(wb)
  const pol = politicaComercial({ fuente: `hoja Presupuesto de ${ruta}`, ...presu.porcentajes })
  console.log('\nporcentajes leídos del libro:', JSON.stringify(presu.porcentajes))
  console.log('escalón de RIESGO o CONTINGENCIA entre H62 y H89:',
    ['H63', 'H65', 'H67', 'H70', 'H72', 'H74', 'H76', 'H78', 'H80'].some((c) => /riesg|conting/i.test(String(wb.Sheets.Presupuesto[c.replace('H', 'B')]?.v ?? ''))) ? 'SÍ' : 'NO — no existe')

  imprimirCascada(presu.cascada, pol)

  console.log(`\n═══ 2 · EL LIBRO CONTRA SÍ MISMO — ${bloques.length} análisis ═══`)
  const malos = auditarBloques(bloques)
  console.log('cod'.padEnd(9), 'descripción'.padEnd(44), 'G del libro'.padStart(15), 'suma del bloque'.padStart(15), 'dif'.padStart(14), 'rango')
  for (const m of malos) console.log(m.codigo.padEnd(9), String(m.descripcion).slice(0, 44).padEnd(44), fm(m.g).padStart(15), fm(m.suma).padStart(15), fm(m.dif).padStart(14), m.sum, m.enBlanco ? `| COD R en blanco $${fm(m.enBlanco)}` : '')
  console.log(`${malos.length} de ${bloques.length} bloques con discrepancia · recursos leídos: ${recursos.size}`)

  if (!conBase) { console.log('\n(sin --con-base: no se cruzó contra Postgres)'); return }
  const { query } = await import('../lib/db.mjs')
  await cruzarConLaBase(query, { bloques, presu, pol })
}

/** El cruce contra Postgres: catálogo, líneas, precios y la cotización completa. */
async function cruzarConLaBase(query, { bloques, presu, pol }) {
  const lin = await query(`select tt.codigo tarea, rc.codigo rec, al.cantidad
     from tarea_tipo tt join analisis a on a.tarea_tipo_id = tt.id and a.vigente
     join analisis_linea al on al.analisis_id = a.id join recurso rc on rc.id = al.recurso_id`)
  const base = new Map()
  for (const x of lin.rows) {
    const m = base.get(x.tarea) ?? new Map()
    m.set(String(x.rec), (m.get(String(x.rec)) ?? 0) + Number(x.cantidad))
    base.set(x.tarea, m)
  }
  const delLibro = new Map()
  for (const b of bloques) {
    if (delLibro.has(b.codigo)) continue
    const m = new Map()
    for (const l of b.lineas) m.set(l.recurso, (m.get(l.recurso) ?? 0) + Number(l.cantidad))
    delLibro.set(b.codigo, m)
  }
  console.log('\n═══ 3 · CATÁLOGO Y LÍNEAS ═══')
  const soloLibro = [...delLibro.keys()].filter((k) => !base.has(k))
  const soloBase = [...base.keys()].filter((k) => !delLibro.has(k))
  console.log(`tareas: libro ${delLibro.size} · base ${base.size} · sólo en el libro [${soloLibro}] · sólo en la base [${soloBase}]`)
  let iguales = 0
  const difs = []
  for (const [cod, mp] of delLibro) {
    const md = base.get(cod)
    if (!md) continue
    const claves = new Set([...mp.keys(), ...md.keys()])
    const d = [...claves].filter((k) => Math.abs((mp.get(k) ?? 0) - (md.get(k) ?? 0)) > 1e-9)
    if (d.length) difs.push({ cod, detalle: d.map((k) => `${k}: libro ${mp.get(k) ?? 0} → base ${md.get(k) ?? 0}`) })
    else iguales++
  }
  console.log(`análisis idénticos línea por línea: ${iguales} · con diferencia: ${difs.length}`)
  for (const d of difs) console.log('  ', d.cod, d.detalle.join(' ; '))
  await cotizacionCompleta(query, { presu, pol })
}

/** LA COTIZACIÓN COMPLETA POR LOS DOS CAMINOS. Es el número que zanja la discusión. */
async function cotizacionCompleta(query, { presu, pol }) {
  const c = await query('select t.codigo, ac.costo_directo from analisis_costo ac join tarea_tipo t on t.id = ac.tarea_tipo_id where ac.vigente')
  const cu = new Map(c.rows.map((x) => [String(x.codigo).toUpperCase(), Number(x.costo_directo)]))
  let cdLibro = 0
  let cdBase = 0
  const detalle = []
  for (const l of presu.lineas) {
    const q = Number(l.cantidad) * Number(l.coefAjuste ?? 1)
    const uB = cu.get(l.codigo.toUpperCase())
    if (!Number.isFinite(uB)) { detalle.push({ cod: l.codigo, falta: true }); continue }
    cdLibro += Number(l.costoUnitario) * q
    cdBase += uB * q
    detalle.push({ cod: l.codigo, uL: Number(l.costoUnitario), uB, impacto: (uB - Number(l.costoUnitario)) * q })
  }
  const A = cascadaDelLibro({ costoDirecto: presu.cascada.I52, politica: pol })
  const B = cascada({ costoDirecto: cdBase, politica: pol })
  console.log('\n═══ 4 · LA COTIZACIÓN COMPLETA, POR LOS DOS CAMINOS ═══')
  console.log(`renglones: ${presu.lineas.length} · sin análisis en la base: ${detalle.filter((d) => d.falta).length}`)
  console.log('CAMINO A · libro .xlsm      costo directo', fm(presu.cascada.I52).padStart(18), 'venta final', fm(presu.cascada.H86).padStart(18))
  console.log('  (control: los renglones del libro recomputados dan', fm(cdLibro), 'contra el I52 de', fm(presu.cascada.I52) + ')')
  console.log('CAMINO A · replicado        costo directo', fm(A.costoDirecto).padStart(18), 'venta final', fm(A.ventaFinal).padStart(18), 'dif', fm(A.ventaFinal - presu.cascada.H86))
  console.log('CAMINO B · base + código    costo directo', fm(cdBase).padStart(18), 'venta final', fm(B.ventaFinal).padStart(18), 'dif', fm(B.ventaFinal - presu.cascada.H86))
  console.log('\ntareas que explican la diferencia:')
  for (const d of detalle.filter((x) => !x.falta && Math.abs(x.impacto) > 1).sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto))) {
    console.log('  ', d.cod.padEnd(9), '$/u libro', fm(d.uL).padStart(14), '$/u base', fm(d.uB).padStart(14), 'impacto', fm(d.impacto).padStart(14))
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
