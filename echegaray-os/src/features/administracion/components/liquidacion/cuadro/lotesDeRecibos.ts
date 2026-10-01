// RECIBOS EN LOTE — la lógica pura de «marcar varias personas y sacar sus recibos de una». Sin JSX, sin base.
//
// Dueño, 01/10/2026: *«un listado de recibos que se mandan a imprimir, en formato horizontal, 4 en una hoja A4 y
// de manera masiva»*. Lo que NO cambia: el recibo de cada persona es el que arma el panel (`armarRecibo` con la
// elección por defecto de `eleccionInicial`) y se registra igual (`sellarRecibo` → `aceptarRecibo`). Por eso la
// regla vive acá UNA vez y `ArmarRecibo` la usa también: dos copias de «qué lleva el recibo por defecto» son dos
// papeles distintos para la misma persona el día que alguien toque una.

import { armarRecibo, eleccionInicial, type EleccionDelRecibo, type ReciboArmado } from '../../../services/reciboDeLaQuincena.ts'
import { sellarRecibo, type ReciboSellado } from '../../../services/reciboEmitido.ts'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo.ts'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales.ts'

/** Cuántos recibos entran en una hoja A4 horizontal (2 × 2). */
export const RECIBOS_POR_HOJA = 4

/** Qué lleva el recibo cuando nadie lo tocó. La usan el panel de una persona y el lote. */
export const eleccionPorDefecto = (fila: FilaDelEspejo): EleccionDelRecibo =>
  eleccionInicial(fila.linea, tipoDeLiquidacion(fila) === 'mensual')

export interface ReciboDeLaFila {
  fila: FilaDelEspejo
  categoria: string | null
  recibo: ReciboArmado
  sellado: ReciboSellado
}

/**
 * «Nada que cobrar»: el papel no trae ni horas ni medios (lo mismo que bloquea el botón del panel), o trae sólo
 * «sin dato» y ceros. En el panel eso se ve y se decide; en un lote de veinte saldría una hoja de renglones vacíos
 * a firmar, así que se saltea y se nombra.
 */
export const reciboSinNada = (r: ReciboArmado): boolean =>
  (r.horas.length === 0 && r.medios.length === 0)
  || (!r.horas.some((h) => (h.horas ?? 0) > 0) && !r.medios.some((m) => !m.sub && (m.importe ?? 0) !== 0))

/** El recibo de una persona con la elección por defecto, ya sellado como lo registraría el panel. */
export function reciboPorDefecto(
  fila: FilaDelEspejo,
  quincena: { desde: string; hasta: string },
  fmt: (n: number) => string,
  rotuloCategoria: (c: string) => string,
): ReciboDeLaFila {
  const mensual = tipoDeLiquidacion(fila) === 'mensual'
  const recibo = armarRecibo(fila.linea, eleccionPorDefecto(fila), fmt, mensual)
  const categoria = fila.categoria ? rotuloCategoria(fila.categoria) : null
  const sellado = sellarRecibo(
    { personaId: fila.personaId, nombre: fila.nombre, categoria, desde: quincena.desde, hasta: quincena.hasta },
    recibo,
  )
  return { fila, categoria, recibo, sellado }
}

export interface LoteDeRecibos {
  /** Los que tienen algo que cobrar, en el orden de la grilla. */
  listos: ReciboDeLaFila[]
  /** Los nombres de quienes no tienen nada: se saltean y se nombran. */
  sinNada: string[]
}

/** Arma el lote en el orden de la grilla (no en el orden en que se tildó). */
export function armarLote(
  filas: readonly FilaDelEspejo[],
  marcados: ReadonlySet<string>,
  quincena: { desde: string; hasta: string },
  fmt: (n: number) => string,
  rotuloCategoria: (c: string) => string,
): LoteDeRecibos {
  const lote: LoteDeRecibos = { listos: [], sinNada: [] }
  for (const fila of filas) {
    if (!marcados.has(fila.personaId)) continue
    const r = reciboPorDefecto(fila, quincena, fmt, rotuloCategoria)
    if (reciboSinNada(r.recibo)) lote.sinNada.push(fila.nombre)
    else lote.listos.push(r)
  }
  return lote
}

/** Parte en hojas de `porHoja` (la última puede quedar incompleta). */
export function enHojas<T>(items: readonly T[], porHoja: number = RECIBOS_POR_HOJA): T[][] {
  const hojas: T[][] = []
  for (let i = 0; i < items.length; i += porHoja) hojas.push(items.slice(i, i + porHoja))
  return hojas
}

export type EstadoDeSeccion = 'ninguna' | 'algunas' | 'todas'

export function estadoDeSeccion(ids: readonly string[], marcados: ReadonlySet<string>): EstadoDeSeccion {
  const n = ids.filter((id) => marcados.has(id)).length
  return n === 0 ? 'ninguna' : n === ids.length ? 'todas' : 'algunas'
}

/** Marca o desmarca todas las filas de una sección sin tocar las de las otras. Devuelve un Set nuevo. */
export function marcarSeccion(marcados: ReadonlySet<string>, ids: readonly string[], marcar: boolean): Set<string> {
  const nuevo = new Set(marcados)
  for (const id of ids) {
    if (marcar) nuevo.add(id)
    else nuevo.delete(id)
  }
  return nuevo
}

/** Los marcados que siguen a la vista: si un filtro esconde una fila, deja de contar (no se imprime lo que no se ve). */
export const soloLosVisibles = (marcados: ReadonlySet<string>, visibles: readonly string[]): Set<string> =>
  new Set(visibles.filter((id) => marcados.has(id)))

/** «7 de 19 seleccionados»: cuántos sobre los que están a la vista, para saber qué parte del cuadro se lleva. */
export const textoDeSeleccion = (n: number, de: number): string => `${n} de ${de} seleccionado${n === 1 ? '' : 's'}`

/** «7 recibos · 2 hojas» — el título de la vista previa. */
export function textoDelLote(recibos: number): string {
  const hojas = Math.ceil(recibos / RECIBOS_POR_HOJA)
  return `${recibos} recibo${recibos === 1 ? '' : 's'} · ${hojas} hoja${hojas === 1 ? '' : 's'}`
}

/**
 * QUIÉN NO TIENE NADA QUE COBRAR, ANTES DE TILDAR (rehacer del 01/10/2026). La versión anterior dejaba tildar a
 * todos y contaba después quién había quedado afuera; ahora esa casilla nace apagada con su motivo. La regla es
 * la misma del lote (`reciboSinNada` sobre el recibo por defecto), no una segunda.
 */
export function sinNadaQueCobrar(
  filas: readonly FilaDelEspejo[],
  quincena: { desde: string; hasta: string },
  fmt: (n: number) => string,
  rotuloCategoria: (c: string) => string,
): Set<string> {
  return new Set(filas.filter((f) => reciboSinNada(reciboPorDefecto(f, quincena, fmt, rotuloCategoria).recibo)).map((f) => f.personaId))
}

/** El motivo que lleva la casilla apagada. */
export const MOTIVO_SIN_NADA = 'Sin nada que cobrar en esta quincena: no hay recibo que imprimir'

/** Lo que la fila necesita para dibujar su casilla y su marca de «impreso». */
export interface MarcaDeRecibo {
  marcada: boolean
  alternar: () => void
  /** Con texto, la casilla va apagada y éste es el porqué. */
  apagada?: string
  /** El último recibo guardado de esta quincena («impreso 01/10 14:32»). */
  impreso?: { texto: string; titulo: string }
}

export interface AvisoDelLote { tono: 'ok' | 'mal'; lineas: string[] }

/** Qué pasó al guardar, en una o dos líneas: cuántos se guardaron, cuántos ya estaban y a quién no se pudo. */
export function avisoDelLote(nuevos: number, yaEstaban: number, fallos: readonly string[]): AvisoDelLote {
  const lineas: string[] = []
  const s = (n: number) => (n === 1 ? '' : 's')
  if (nuevos > 0) lineas.push(`${nuevos} recibo${s(nuevos)} guardado${s(nuevos)} en ${nuevos === 1 ? 'el legajo' : 'los legajos'}.`)
  if (yaEstaban > 0) lineas.push(`${yaEstaban} ya estaba${yaEstaban === 1 ? '' : 'n'} guardado${s(yaEstaban)} igual: no se duplic${yaEstaban === 1 ? 'ó' : 'aron'}.`)
  for (const f of fallos) lineas.push(`No se guardó y no sale en la hoja. ${f}`)
  return { tono: fallos.length > 0 || nuevos + yaEstaban === 0 ? 'mal' : 'ok', lineas }
}
