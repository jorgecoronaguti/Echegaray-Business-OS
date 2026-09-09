// ¿QUÉ ADJUNTO DEL CANAL NO LLEGÓ A COMPRAS, Y EN QUÉ ESLABÓN SE CORTÓ? — NÚCLEO PURO, CERO RED.
//
// Pedido del dueño (09/09/2026, textual): «mandá todo a la sección Compras de app.ecsas.com.ar como
// corresponde, con su adjunto incluido, y no dejes ninguno afuera».
//
// ═══ POR QUÉ UN ESLABÓN Y NO UN BOOLEANO ═══
//
// «Falta» no dice nada: el archivo que nunca se guardó, el que se guardó y nadie leyó, y el que se
// leyó pero no tiene fila en la pestaña se arreglan con TRES herramientas distintas y dos de ellas
// cuestan plata (visión) o tocan el Sheet (carga). Un contador de faltantes obliga a abrir los 196
// archivos para saber qué hacer con cada uno; el eslabón ya trae el camino adentro.
//
// La cadena es: CANAL → RESPALDO (bucket + `compra_adjunto`) → LECTURA (el bot leyó el papel y le
// puso clave) → FILA (esa clave existe en la pestaña Compras). Se corta en el PRIMER eslabón que
// falla y se reporta ahí, porque los de más abajo no se pueden ni evaluar: de un archivo que no se
// bajó nunca no se puede decir «no se leyó».
//
// ═══ DESCARTADO NO ES FALTANTE ═══
//
// En el canal hay un CSV del banco y un zip. No son comprobantes y nunca van a serlo: contarlos como
// faltantes deja un reporte que nunca cierra en 196/196 y que por lo tanto se deja de mirar. Se
// declaran DESCARTADOS con el motivo textual, que es lo que el dueño puede discutir.
//
// ═══ NO DECIDE NADA SOBRE EL SHEET ═══
//
// Este módulo LEE. Un archivo clasificado `sin_fila` NO se carga solo: la mitad de esos son la misma
// factura reenviada tres veces y cargarla otra vez duplicaría el gasto. El auditor dice dónde está
// el corte; qué se hace con cada uno lo decide una persona.

import { admisible } from './respaldo-adjunto.mjs'
import { claveComprobante } from './lectura.mjs'
import { filaConciliada } from './clave-conciliada.mjs'

export const ESLABON = Object.freeze({
  EN_COMPRAS: 'en_compras',
  SIN_FILA: 'sin_fila',
  SIN_LECTURA: 'sin_lectura',
  SIN_RESPALDO: 'sin_respaldo',
  DESCARTADO: 'descartado',
})

/** El orden en que se muestran y se cuentan. El primero es el único que está bien. */
export const ORDEN = Object.freeze([
  ESLABON.EN_COMPRAS, ESLABON.SIN_FILA, ESLABON.SIN_LECTURA, ESLABON.SIN_RESPALDO, ESLABON.DESCARTADO,
])

export const CAMINO = Object.freeze({
  [ESLABON.EN_COMPRAS]: '—',
  [ESLABON.SIN_FILA]: 'cargar con el flujo del bot (cargar-comprobantes-compras.mjs) — lo decide una persona: puede ser un reenvío ya cargado',
  [ESLABON.SIN_LECTURA]: 'leer con visión (backfill-comprobantes-mattermost.mjs --con-vision)',
  [ESLABON.SIN_RESPALDO]: 'guardar en el bucket (backfill-comprobantes-mattermost.mjs)',
  [ESLABON.DESCARTADO]: 'ninguno: no es un comprobante',
})

/**
 * ¿ESTE ARCHIVO PUEDE SER UN COMPROBANTE? Puro.
 *
 * `admisible` ya sabe qué entra al bucket (tipo y tamaño) y es la MISMA regla que aplica el
 * respaldo: si el auditor usara un criterio propio, un archivo podría ser «faltante» acá y
 * «rechazado» allá, que es exactamente la clase de contradicción que hace que un reporte se ignore.
 *
 * @returns {string|null} el motivo del descarte, o null si es un comprobante posible
 */
export function motivoDeDescarte(archivo = {}) {
  const v = admisible(archivo)
  if (v.ok) return null
  return `no es un comprobante mirable — ${v.motivo}`
}

/**
 * DÓNDE SE CORTÓ LA CADENA PARA UN ARCHIVO. Puro.
 *
 * @param {{file_id:string, nombre?:string, media_type?:string, bytes?:number}} archivo  el del canal
 * @param {{respaldo?:{compra_clave?:string|null, fila_compras?:number|null, vinculado_por?:string}|null,
 *          lectura?:{clave?:string|null, proveedor?:string|null}|null,
 *          compras?:Array<{clave:string|null, proveedor?:string|null, fila?:number}>}} ctx
 * @returns {{eslabon:string, motivo:string|null, clave:string|null, fila:number|null}}
 */
export function clasificarAdjunto(archivo = {}, { respaldo = null, lectura = null, compras = [] } = {}) {
  const descarte = motivoDeDescarte(archivo)
  if (descarte) return { eslabon: ESLABON.DESCARTADO, motivo: descarte, clave: null, fila: null }

  if (!respaldo) {
    return { eslabon: ESLABON.SIN_RESPALDO, motivo: 'el archivo no está en el bucket', clave: null, fila: null }
  }

  // EL VÍNCULO YA ESCRITO MANDA. Si `compra_adjunto` tiene clave, el papel ya cuelga de su fila y la
  // pantalla lo muestra: volver a deducirlo sería recalcular un hecho para a veces contradecirlo.
  if (respaldo.compra_clave) {
    return {
      eslabon: ESLABON.EN_COMPRAS, motivo: null,
      clave: respaldo.compra_clave, fila: respaldo.fila_compras ?? null,
    }
  }

  // LA LECTURA VIVE EN DOS LADOS Y LAS DOS CUENTAN. El bot deja la suya en el ítem del fajo; el
  // repaso con visión (`leer-adjuntos-sin-lectura.mjs`) la deja en `compra_adjunto.lectura`. Mirar
  // sólo el fajo hacía que un papel recién leído volviera a salir «sin_lectura» y el reporte pidiera
  // pagar otra vez el modelo por algo que ya se sabe.
  const clave = lectura?.clave
    ?? (respaldo.lectura ? claveComprobante(respaldo.lectura)?.clave ?? null : null)
  if (!clave) {
    const motivo = respaldo.lectura
      ? 'se leyó el papel y no dice número ni CUIT'
      : 'nadie leyó el papel'
    return { eslabon: ESLABON.SIN_LECTURA, motivo, clave: null, fila: null }
  }

  // Se leyó. ¿Hay fila? `filaConciliada` es la misma regla que usa el reparador de huérfanos: exige
  // que el número y el tipo coincidan, y sólo afloja la identidad (c: vs p:) si el proveedor la
  // confirma. Acá NO se escribe el vínculo: se reporta que existe.
  const f = filaConciliada(clave, compras, { proveedor: lectura?.proveedor ?? respaldo.lectura?.proveedor ?? null })
  if (f) {
    return { eslabon: ESLABON.EN_COMPRAS, motivo: 'la fila existe y el vínculo está sin escribir', clave: f.clave, fila: f.fila ?? null }
  }
  return { eslabon: ESLABON.SIN_FILA, motivo: `leído como ${clave} y no hay fila en Compras`, clave, fila: null }
}

/**
 * LA CADENA ENTERA. Puro: se le pasan las cuatro fuentes ya leídas y devuelve tabla + conteo.
 *
 * @param {{archivos:Array, respaldos:Map<string,object>, lecturas:Map<string,object>, compras:Array}} f
 */
export function conciliarCanal({ archivos = [], respaldos = new Map(), lecturas = new Map(), compras = [] } = {}) {
  const filas = archivos.map((a) => {
    const id = String(a.file_id)
    const r = clasificarAdjunto(a, {
      respaldo: respaldos.get(id) ?? null, lectura: lecturas.get(id) ?? null, compras,
    })
    return { ...a, ...r }
  })
  const resumen = Object.fromEntries(ORDEN.map((e) => [e, filas.filter((f) => f.eslabon === e).length]))
  return { filas, resumen, total: filas.length }
}

/**
 * ¿CIERRA? Todo archivo del canal es un comprobante en Compras o un descarte declarado.
 *
 * Es la pregunta del dueño —«no dejes ninguno afuera»— convertida en una condición que da rojo. Un
 * reporte que no la contesta con true/false invita a leer los totales y creerle al que suena mejor.
 */
export function ningunoAfuera(resumen = {}) {
  return (resumen[ESLABON.SIN_FILA] ?? 0) === 0
    && (resumen[ESLABON.SIN_LECTURA] ?? 0) === 0
    && (resumen[ESLABON.SIN_RESPALDO] ?? 0) === 0
}
