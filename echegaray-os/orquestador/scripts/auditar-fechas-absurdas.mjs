#!/usr/bin/env node
// LA FECHA MAL TIPEADA QUE NINGÚN RÓTULO DELATA.
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// Los rótulos de frescura salen de un `MAX(… ; … <=TODAY())` sobre una columna de fechas. Ese filtro
// tapa un solo lado del problema: una fecha tipeada para adelante (un 2027 por error) queda afuera
// del MAX y el rótulo no se mueve. LA DE ATRÁS NO LA VE NADIE. Un `MAX` se queda con la más nueva:
// una fila fechada en 2019 por un dedo en el año no cambia el rótulo ni un día, no da error, no
// descuadra ninguna suma — y sin embargo está mal, y se nota en otro lado:
//
//   · un cheque con emisión 2019 cae en el tramo "Vencido — averiguar por qué" y ensucia la única
//     alerta que esa pestaña tiene;
//   · una compra con fecha de caja 2019 sale del año y desaparece de todos los cuadros mensuales;
//   · una cobranza con fecha 2019 saca su retención del mes en que se sufrió.
//
// Es la misma familia que el rango fosilizado: no rompe nada, miente despacio. La diferencia es que
// el rango fosilizado esconde plata y éste la manda al año equivocado.
//
// ═══ POR QUÉ ES UN AUDITOR Y NO UNA CONDICIÓN MÁS EN LA FÓRMULA ═══
//
// Se podría acotar el MAX por abajo (`>=DATE(2024;1;1)`) y no serviría de nada: la fecha absurda
// seguiría en la fila, seguiría en el tramo equivocado, y encima quedaría TAPADA — la fórmula habría
// dejado de mostrar el síntoma sin tocar la causa. Silenciar un error no es arreglarlo. Un dato malo
// tiene que VERSE, con su fila y su valor, para que alguien lo corrija en el origen.
//
// ═══ QUÉ NO HACE ═══
//
// NO ESCRIBE. Ni una celda, ni una nota, ni un formato: abre el libro con los scopes de sólo lectura
// y no puede escribir aunque el código se lo pidiera. Un auditor que corrige lo que encuentra deja de
// ser un control independiente — un control nunca se valida contra la misma información que produce.
//
//   node orquestador/scripts/auditar-fechas-absurdas.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { resolverColumnas } from '../lib/compras-columnas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Días de una ventana razonable hacia atrás. Tres años cubre el cheque más viejo que la empresa
 *  todavía arrastra sin llegar a tolerar un año mal tipeado (2019 contra 2026 son siete). */
export const ATRAS_DIAS = 365 * 3
/** Y hacia adelante. Un cheque diferido a nueve meses es normal; a dos años es un dedo en el año. */
export const ADELANTE_DIAS = 365

/** El día 0 del calendario de Sheets. Las fechas viajan como número de serie desde el 30/12/1899. */
const EPOCA = Date.UTC(1899, 11, 30)
const MS_DIA = 86400000

/**
 * NÚCLEO PURO: el serial de Sheets de un día. Se calcula en UTC a propósito — con horas locales, un
 * huso al oeste de Greenwich devuelve el día anterior la mitad del año y el auditor correría contra
 * un "hoy" que no es hoy.
 * @param {Date} [d]
 * @returns {number}
 */
export const serialDeHoy = (d = new Date()) =>
  Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCA) / MS_DIA)

/** NÚCLEO PURO: el serial de vuelta a "dd/mm/aaaa", para poder nombrar la fila en el reporte. */
export const serialATexto = (n) => {
  const d = new Date(EPOCA + n * MS_DIA)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/**
 * NÚCLEO PURO: una celda de fecha a serial, o null si no es una fecha.
 *
 * LA COLUMNA VIENE EN FORMATO MIXTO y hay que leer los dos. La "Fecha de caja" de Compras tiene unas
 * filas como número de serie y otras como texto "dd/mm/aaaa" tipeado a mano; un auditor que sólo
 * mirara los números pasaría por alto justo las filas escritas a mano, que son las que más se tipean
 * mal. Es la misma coacción que hacen las fórmulas de lib/fecha-de-frescura.mjs.
 *
 * El texto se lee dd/mm/aaaa (es-AR) y NO con `new Date(texto)`, que interpreta "03/08/2026" como
 * mm/dd en varios entornos y convertiría marzo en agosto sin avisar.
 *
 * @param {unknown} celda
 * @returns {number|null}
 */
export function aSerial(celda) {
  if (typeof celda === 'number') return Number.isFinite(celda) && celda > 0 ? Math.floor(celda) : null
  const t = String(celda ?? '').trim()
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t)
  if (!m) return null
  const [, dd, mm, aa] = m
  const anio = aa.length === 2 ? 2000 + Number(aa) : Number(aa)
  const d = Date.UTC(anio, Number(mm) - 1, Number(dd))
  const serial = Math.floor((d - EPOCA) / MS_DIA)
  // Un día 31/02 lo "corrige" Date.UTC hacia marzo en silencio: eso ya no es la fecha que se tipeó.
  const back = new Date(d)
  if (back.getUTCDate() !== Number(dd) || back.getUTCMonth() !== Number(mm) - 1) return null
  return serial > 0 ? serial : null
}

/**
 * NÚCLEO PURO: las fechas de una columna que caen fuera de la ventana razonable.
 *
 * @param {any[][]} filas la columna leída, una fila por elemento (sin encabezados)
 * @param {{hoy:number, desdeFila?:number, atras?:number, adelante?:number, col?:number}} opts
 *        `desdeFila` = el número de fila REAL de `filas[0]`, para poder nombrarla en el reporte.
 * @returns {{fila:number, valor:unknown, serial:number, motivo:'muy vieja'|'muy futura', dias:number}[]}
 */
export function fechasAbsurdas(filas = [], { hoy, desdeFila = 1, atras = ATRAS_DIAS, adelante = ADELANTE_DIAS, col = 0 } = {}) {
  const out = []
  filas.forEach((f, i) => {
    const celda = Array.isArray(f) ? f[col] : f
    // Una celda vacía no es un defecto: falta cargarla, y eso lo dice otro control. Un texto que no
    // es fecha tampoco entra acá — el rango abierto barre rótulos y notas, y reportarlos ahogaría
    // los hallazgos reales entre ruido, que es como muere un auditor.
    const s = aSerial(celda)
    if (s === null) return
    if (hoy - s > atras) out.push({ fila: desdeFila + i, valor: celda, serial: s, motivo: 'muy vieja', dias: hoy - s })
    else if (s - hoy > adelante) out.push({ fila: desdeFila + i, valor: celda, serial: s, motivo: 'muy futura', dias: s - hoy })
  })
  return out
}

/**
 * LAS COLUMNAS QUE SE AUDITAN: exactamente las que alimentan un rótulo de frescura.
 *
 * No es "todas las fechas del libro" a propósito. Un auditor que grita por noventa cosas logra que
 * nadie mire la lista — ya pasó con el detector de textos cortados y sus 688 falsos positivos. Estas
 * son las que deciden qué fecha se le muestra al dueño arriba de un número con el que decide.
 */
export const COLUMNAS = [
  { hoja: 'Cheques Emitidos', col: 'C', desde: 2, que: 'fecha de emisión' },
  { hoja: 'Cheques Emitidos', col: 'I', desde: 2, que: 'fecha de pago' },
  { hoja: 'Cobranzas', col: 'Q', desde: 5, que: 'fecha de cobro' },
  // El extracto no tiene futuro: un movimiento fechado mañana no es un diferido, es un error de
  // importación. La ventana hacia adelante se cierra sólo donde de verdad no puede haber nada.
  { hoja: '_BANCO_RAW', col: 'A', desde: 4, que: 'fecha del movimiento', adelante: 0 },
  // LA LETRA DE COMPRAS NO SE ESCRIBE: se resuelve por su ENCABEZADO. Es la columna que más se carga
  // a mano —y por lo tanto la que más se tipea mal—, y también la que ya dejó un cuadro entero en
  // #REF! el día que alguien movió una columna. Un auditor con la letra clavada auditaría la columna
  // de al lado y diría "0 hallazgos", que es la peor respuesta posible.
  { hoja: 'Compras', encabezado: 'Fecha de caja', desde: 4, que: 'fecha de caja' },
]

async function main() {
  // SIN `scopes`: el cliente queda con los de SÓLO LECTURA por defecto. No es un descuido, es el
  // control — este script no tiene con qué escribir.
  const google = makeGoogleClient({ config: loadConfig() })
  // Las columnas que se piden por encabezado se resuelven ANTES de leer nada: si el rótulo no está,
  // el auditor lo dice y no audita una columna al azar.
  for (const c of COLUMNAS.filter((x) => x.encabezado)) {
    const cab = (await google.readSheetValues(ID, `'${c.hoja}'!A${c.desde - 1}:BZ${c.desde - 1}`).catch(() => []))[0] || []
    const { col } = resolverColumnas(cab, { x: c.encabezado })
    c.col = col.x ?? null
  }
  const hoy = serialDeHoy()
  let total = 0
  for (const c of COLUMNAS) {
    if (!c.col) {
      console.error(`  ✖ ${c.hoja}: no encontré la columna "${c.encabezado}" — NO audito una columna al azar`)
      total = -1
      continue
    }
    const rango = `'${c.hoja}'!${c.col}${c.desde}:${c.col}`
    const filas = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }).catch((e) => {
      console.error(`  ✖ no pude leer ${rango}: ${e.message}`)
      return null
    })
    // NO SE CUENTA COMO "SIN HALLAZGOS" LO QUE NO SE PUDO MIRAR. Un control que no corrió se declara
    // como tal: un log que felicita sin haber leído nada es peor que ningún log.
    if (!filas) { total = -1; continue }
    const malas = fechasAbsurdas(filas, { hoy, desdeFila: c.desde, ...(c.adelante !== undefined ? { adelante: c.adelante } : {}) })
    console.log(`${malas.length ? '⚠' : '✔'} ${c.hoja}!${c.col} — ${c.que} · ${filas.length} fila(s) leída(s) · ${malas.length} fuera de rango`)
    for (const m of malas) {
      console.log(`    fila ${m.fila}: ${JSON.stringify(m.valor)} → ${serialATexto(m.serial)} (${m.motivo}, ${m.dias} días)`)
    }
    if (total >= 0) total += malas.length
  }
  if (total < 0) { console.error('\nHubo columnas que no se pudieron leer: el resultado NO es "todo bien".'); process.exitCode = 1; return }
  console.log(`\n${total} fecha(s) fuera de la ventana razonable (${ATRAS_DIAS} días atrás · ${ADELANTE_DIAS} adelante).`)
  if (total) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
