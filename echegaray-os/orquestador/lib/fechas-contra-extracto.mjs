// LA FECHA CON LA QUE UN MOVIMIENTO APARECE EN EL SHEET TIENE QUE SER LA DEL EXTRACTO.
//
// ═══ EL PEDIDO (17/08/2026, el dueño textual) ═══
//
// *"imagino q dejarás todas las fechas en orden de acuerdo al extracto en todo el sheet, eso tb es
// actualizar todo"*.
//
// La réplica del banco ya está en orden: 405 movimientos del 28/05 al 14/08, ascendentes, sin un solo
// paso hacia atrás. Lo que está corrido son las fechas que se tipean en las OTRAS pestañas — la
// "Fecha de caja" de Compras, la fecha de pago de Cheques Emitidos— porque se cargan cuando se
// PREVÉ el pago y nadie las vuelve a tocar cuando el banco lo hace en otro día.
//
// Medido contra el archivo vivo, ventana del extracto 46170 → 46248:
//
//   Cheques Emitidos ... 115 filas · 15 cruzables 1 a 1 · 5 coinciden · 10 corridas por $9.067.994
//   Compras (transf/déb) 248 filas · 31 cruzables 1 a 1 · 20 coinciden · 11 corridas por $14.579.494
//   Cobranzas (transf) .. 46 filas · CERO cruzables: el importe que acredita el banco no es el
//                        "TOTAL a cobrar (neto de retenciones)" de la planilla. Ver el límite abajo.
//
// ═══ EL ÚNICO IDENTIFICADOR DISPONIBLE ES EL IMPORTE, Y ESO MANDA TODO EL DISEÑO ═══
//
// El extracto del Santander NO trae el número del cheque: el concepto es literalmente «Cheque
// debitado», sin un dígito. Tampoco trae el comprobante de la transferencia. Así que el único dato
// que puede ligar una fila con un movimiento del banco es el IMPORTE, y por eso la regla es dura:
//
//   **UNO DE CADA LADO.** Un solo movimiento del banco con ese importe en la ventana, Y una sola fila
//   de la pestaña con ese importe. Con dos de cualquiera de los dos lados no se empareja nada.
//
// LA MITAD QUE PARECE DE MÁS ES LA QUE MÁS ATAJA. "Un solo débito con ese importe" sola habría
// corrido la cuota del prendario: Compras tiene SEIS filas «Banco» de $1.282.811 —una pagada en julio
// y cinco proyectadas hasta diciembre— contra un único débito de ese importe el 46210. Emparejarlo
// con la fila de agosto le habría movido la fecha 31 días hacia atrás, y la de julio, que es la que
// ese débito pagó, habría quedado sin testigo.
//
// ═══ EL PESO DE DIFERENCIA ES SEÑAL, Y ACÁ SEPARA DOS CHEQUES ═══
//
// El caso que disparó esto llegó como *"el cheque 312 de Corralon Progreso lo debitó el banco el
// 06/08 por $470.945; el registro dice $470.944"*. La planilla dice otra cosa:
//
//   Cheques Emitidos f81 · FISICO **313** · Corralon Progreso · $470.9**45** · pago 46220 · DEBITADO SI
//   Cheques Emitidos f93 · FISICO **312** · Corralon Progreso · $470.9**44** · pago 46251 · DEBITADO No
//
// El débito de $470.945 empareja EXACTO con el 313. El peso no es un redondeo: es lo que distingue
// dos cheques al mismo proveedor. Corregir la fecha del 312 habría movido el cheque equivocado y
// dejado sin fecha al que sí se debitó. Por eso la comparación es al CENTAVO y no tolera cercanía.
//
// ═══ LA HOLGURA NO ES NUEVA ═══
//
// Se importa `HOLGURA_MENSUAL` de `libro-cruce-banco.mjs`: diez días, menor que medio mes, para que
// el pago de un mes no pueda explicar el vencimiento del siguiente. Un segundo número tipeado acá
// sería una segunda definición del mismo criterio, y se desincronizaría sin dar un error.
//
// LO QUE CAE FUERA DE LA HOLGURA NO SE DESCARTA: SE REPORTA (`lejos`). El cheque 313 está a 20 días
// del débito que lo explica, y ese corrimiento es exactamente lo que el dueño quiere ver — pero
// escribirlo automáticamente sobre una coincidencia de importe a tres semanas es adivinar.
//
// NÚCLEO PURO. No lee Google, no escribe, no toca la base.

import { HOLGURA_MENSUAL } from './libro-cruce-banco.mjs'

/** La holgura de emparejamiento. Una sola definición para todo el cruce contra el banco. */
export const HOLGURA_FECHA = HOLGURA_MENSUAL

/** Los veredictos. Cada uno dice por qué, y ninguno dice "no sé" sin nombrar la causa. */
export const VEREDICTO_FECHA = Object.freeze({
  coincide: 'COINCIDE',                   // la planilla ya dice la fecha del banco
  corregir: 'CORREGIR',                   // 1 a 1, dentro de la holgura: manda el banco
  lejos: 'LEJOS',                         // 1 a 1 pero fuera de la holgura: se reporta, no se toca
  ambiguoBanco: 'AMBIGUO_BANCO',          // dos movimientos del banco con ese importe
  ambiguoPlanilla: 'AMBIGUO_PLANILLA',    // dos filas de la pestaña con ese importe
  sinTestigo: 'SIN_TESTIGO',              // ningún movimiento del banco tiene ese importe
  fueraDeVentana: 'FUERA_DE_VENTANA',     // el extracto no llega a esa fecha
  sinDatos: 'SIN_DATOS',                  // la fila no tiene fecha o no tiene importe
})

/** Los que hay que MIRAR: el banco y la planilla dicen fechas distintas. */
export const GRITAN_FECHA = Object.freeze([VEREDICTO_FECHA.corregir, VEREDICTO_FECHA.lejos])

const cent = (v) => (Number.isFinite(Number(v)) ? Math.round(Math.abs(Number(v)) * 100) : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Cuántas veces aparece cada importe (en centavos) en una lista. */
function conteoPorImporte(items) {
  const m = new Map()
  for (const x of items) {
    const k = cent(x.importe)
    if (k === null || k === 0) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const dictamen = (veredicto, extra = {}) =>
  ({ veredicto, fechaBanco: null, dias: null, filaBanco: null, motivo: '', ...extra })

/**
 * NÚCLEO PURO: EL VEREDICTO DE UNA FILA. Se separa del recorrido para que quepa en la cabeza.
 *
 * @param {{fecha:number, importe:number}} f
 * @param {{porImporteBanco:Map, porImportePlanilla:Map, indice:Map, ventana:object, holgura:number}} ctx
 */
function veredictoDeFila(f, ctx) {
  const fecha = num(f.fecha)
  const k = cent(f.importe)
  if (fecha === null || k === null || k === 0) {
    return dictamen(VEREDICTO_FECHA.sinDatos, { motivo: 'la fila no tiene fecha o no tiene importe' })
  }
  const { desde, hasta } = ctx.ventana
  if (fecha < desde - ctx.holgura || fecha > hasta + ctx.holgura) {
    return dictamen(VEREDICTO_FECHA.fueraDeVentana, {
      motivo: `el extracto va del ${desde} al ${hasta}: sobre esta fecha no puede opinar`,
    })
  }
  if ((ctx.porImportePlanilla.get(k) ?? 0) > 1) {
    return dictamen(VEREDICTO_FECHA.ambiguoPlanilla, {
      motivo: `${ctx.porImportePlanilla.get(k)} filas de esta pestaña tienen el mismo importe: el importe no las distingue`,
    })
  }
  const cuantos = ctx.porImporteBanco.get(k) ?? 0
  if (cuantos === 0) {
    return dictamen(VEREDICTO_FECHA.sinTestigo, { motivo: 'ningún movimiento del banco tiene ese importe exacto' })
  }
  if (cuantos > 1) {
    return dictamen(VEREDICTO_FECHA.ambiguoBanco, {
      motivo: `${cuantos} movimientos del banco tienen ese importe: elegir uno sería inventar`,
    })
  }
  const d = ctx.indice.get(k)
  const dias = d.fecha - fecha
  const comun = { fechaBanco: d.fecha, dias, filaBanco: d.fila ?? null }
  if (dias === 0) return dictamen(VEREDICTO_FECHA.coincide, comun)
  if (Math.abs(dias) > ctx.holgura) {
    return dictamen(VEREDICTO_FECHA.lejos, {
      ...comun,
      motivo: `el único movimiento del banco de ese importe está a ${Math.abs(dias)} días (holgura ${ctx.holgura}): se reporta, no se escribe`,
    })
  }
  return dictamen(VEREDICTO_FECHA.corregir, { ...comun, motivo: 'uno de cada lado y dentro de la holgura: manda el banco' })
}

/**
 * NÚCLEO PURO: el veredicto de cada fila de una pestaña contra los movimientos del extracto.
 *
 * @param {Array<{id:string, fecha:number, importe:number}>} filas las de la pestaña, ya normalizadas
 * @param {Array<{fecha:number, importe:number, fila:number}>} banco movimientos del extracto; el
 *        importe se compara en MAGNITUD, así que sirve tanto para débitos como para créditos
 * @param {{ventana:{desde:number, hasta:number}, holgura?:number}} opciones
 * @returns {Array<{id:string, fecha:number, importe:number, veredicto:string, fechaBanco:number|null,
 *   dias:number|null, filaBanco:number|null, motivo:string}>} uno por fila, en el mismo orden
 */
export function cruzarFechas(filas = [], banco = [], { ventana, holgura = HOLGURA_FECHA } = {}) {
  if (!ventana || !Number.isFinite(ventana.desde) || !Number.isFinite(ventana.hasta)) {
    throw new Error('cruzarFechas: sin la ventana del extracto no se puede decir qué queda fuera de su alcance, '
      + 'y una fila anterior al extracto se declararía "sin testigo" cuando el banco simplemente no llega.')
  }
  const indice = new Map()
  for (const d of banco) {
    const k = cent(d.importe)
    if (k !== null && k !== 0 && !indice.has(k)) indice.set(k, d)
  }
  const ctx = {
    porImporteBanco: conteoPorImporte(banco),
    porImportePlanilla: conteoPorImporte(filas),
    indice,
    ventana,
    holgura,
  }
  return filas.map((f) => ({ ...f, ...veredictoDeFila(f, ctx) }))
}

/** Las filas que se pueden escribir: 1 a 1, dentro de la holgura, y con fecha nueva distinta. */
export function corregibles(veredictos = []) {
  return veredictos.filter((v) => v.veredicto === VEREDICTO_FECHA.corregir && Number.isFinite(v.fechaBanco))
}

/**
 * NÚCLEO PURO: el resumen POR VEREDICTO, con la plata de cada uno.
 *
 * El monto es lo que decide: una fecha corrida tres días sobre $16M importa y una sobre $8.000 no, y
 * contando filas las dos valen igual.
 */
export function resumen(veredictos = []) {
  const out = {}
  for (const v of veredictos) {
    const a = out[v.veredicto] ?? (out[v.veredicto] = { filas: 0, monto: 0 })
    a.filas++
    a.monto += Math.abs(Number(v.importe) || 0)
  }
  return out
}
