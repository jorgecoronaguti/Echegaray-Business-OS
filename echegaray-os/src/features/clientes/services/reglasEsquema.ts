// LAS REGLAS DE LA PANTALLA 32 — total del esquema, «falta asignar», cambios sin publicar y la
// grilla del calendario.
//
// El esquema de pago es la CARA INTERNA de la columna Q de la pestaña Cobranzas: mover una fecha
// acá termina moviendo esa celda por la cola. Por eso todo lo que decide qué se publica y qué está
// pendiente vive en funciones puras con test, y no adentro de un componente donde nadie lo puede
// volver a correr.

import { diasEntre } from './cobranzaFormato.ts'
import type { PagoEsquema } from '../types/cobranzas.ts'

/** La fila «Total del esquema» (`32:283`): lo que suman los pagos y lo que suman sus reparos. */
export function totalEsquema(pagos: PagoEsquema[]): { monto: number; reparo: number } {
  return {
    monto: pagos.reduce((s, p) => s + p.monto, 0),
    reparo: pagos.reduce((s, p) => s + (p.reparo ?? 0), 0),
  }
}

export type Cuadre =
  /** No hay contrato cargado: no se puede afirmar que falte ni que sobre. */
  | { estado: 'sin_contrato' }
  | { estado: 'cuadra' }
  | { estado: 'falta'; monto: number }
  /** El esquema asigna MÁS que el contrato. El mockup no lo dibuja porque su ejemplo no lo tiene;
   *  se detecta igual, porque publicar al cliente un plan que suma más que lo contratado es un
   *  problema mayor que el que falte. */
  | { estado: 'excede'; monto: number }

/** «Falta asignar $ 4,32 M del contrato a un pago» (`32:290`). Tolerancia de un peso para no
 *  gritar por el redondeo de un porcentaje de reparo. */
export function cuadreDelContrato(contratoTotal: number | null, pagos: PagoEsquema[]): Cuadre {
  if (contratoTotal == null) return { estado: 'sin_contrato' }
  const dif = contratoTotal - totalEsquema(pagos).monto
  if (Math.abs(dif) < 1) return { estado: 'cuadra' }
  return dif > 0 ? { estado: 'falta', monto: dif } : { estado: 'excede', monto: -dif }
}

/** La pastilla «N cambios sin publicar» de la cabecera (`32:26`). */
export const cambiosSinPublicar = (pagos: PagoEsquema[]): number =>
  pagos.filter((p) => p.cambio_pendiente).length

/**
 * EL MONTO DE ESTE PAGO ¿SE PUEDE EDITAR ACÁ? No cuando lo impone un comprobante ya emitido.
 *
 * Es DERIVADO, no una columna: `esquema_pago` no tiene `monto_bloqueado` y no debería tenerlo, o
 * habría dos verdades sobre lo mismo. El bloqueo es exactamente «esta fila existe en Cobranzas»:
 * con `cobranza_fila` el importe lo manda el certificado y cambiarlo desde el esquema publicaría al
 * cliente un número distinto del que dice su factura. Sin fila, el pago es una previsión del
 * esquema y su monto es de esta pantalla.
 */
export const montoBloqueado = (p: PagoEsquema): boolean => p.cobranza_fila !== null

/**
 * EL RENGLÓN CHICO DEBAJO DEL CONCEPTO: «cobrado 06/07 · transferencia», «previsto · sin emitir».
 *
 * Se ARMA acá y no viene de la base, porque no es un dato: es la lectura en castellano de tres
 * campos que ya están en la fila (`estado`, `fecha`, `medio`). Guardarlo como texto lo dejaría
 * congelado el día que alguien mueva la fecha.
 *
 * `null` cuando no hay nada que agregar: la pantalla cae al nombre de la obra, y si tampoco lo hay
 * deja el renglón vacío en vez de escribir una frase de relleno.
 */
export function detalleDePago(p: PagoEsquema): string | null {
  const partes: string[] = []
  if (p.estado === 'cobrado') partes.push(p.fecha ? `cobrado ${diaMesCorto(p.fecha)}` : 'cobrado')
  else if (p.estado === 'previsto') partes.push('previsto · todavía sin emitir')
  else if (p.estado === 'retenido') partes.push('retenido · fondo de reparo')
  if (p.medio) partes.push(p.medio)
  return partes.length ? partes.join(' · ') : null
}

/** `2026-07-06` → `06/07`. Local acá: es el único formato que este renglón necesita. */
const diaMesCorto = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export interface CambioDelEsquema {
  /** ISO del instante del cambio. */
  at: string
  texto: string
  detalle: string
  publicado: boolean
}

/**
 * «CAMBIOS DEL ESQUEMA» (`32:505`) — la historia de fechas, del más nuevo al más viejo.
 *
 * Sale de las reprogramaciones que cada pago ya guarda: no hay una tabla de auditoría aparte, y
 * fabricarla desde el estado actual daría una historia que nadie escribió.
 */
export function cambiosDelEsquema(pagos: PagoEsquema[]): CambioDelEsquema[] {
  const cambios: CambioDelEsquema[] = []
  for (const p of pagos) {
    for (const r of p.reprogramaciones ?? []) {
      const dia = r.a.slice(8, 10) + '/' + r.a.slice(5, 7)
      cambios.push({
        at: r.at,
        texto: r.de ? `${p.concepto} movido al ${dia}` : `${p.concepto} agregado al ${dia}`,
        detalle: [r.publicado ? 'publicado' : 'sin publicar', r.por, r.motivo]
          .filter(Boolean).join(' · '),
        publicado: r.publicado,
      })
    }
  }
  return cambios.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/**
 * EL ESTADO QUE SE DIBUJA, que no siempre es el que trae la base.
 *
 * `cobrado`, `retenido` y `previsto` los decide el dato. `a_vencer` y `vencido` son la MISMA fila
 * con la fecha de un lado o del otro de hoy: si el admin mueve la fecha al futuro y la pantalla
 * sigue leyendo el estado guardado, la fila se queda en rojo sobre un pago que ya no está vencido
 * hasta que corra el sync. Se deriva de la fecha, que es la palanca que el admin acaba de mover.
 */
export function estadoVigente(pago: PagoEsquema, hoy: string): PagoEsquema['estado'] {
  if (pago.estado === 'cobrado' || pago.estado === 'retenido' || pago.estado === 'previsto') {
    return pago.estado
  }
  const dias = diasEntre(pago.fecha, hoy)
  return dias != null && dias > 0 ? 'vencido' : 'a_vencer'
}

export interface DiaDeGrilla {
  iso: string
  /** `false` para los días de relleno del mes anterior o del siguiente. */
  delMes: boolean
}

/**
 * LA GRILLA DEL CALENDARIO (`32:305`): semanas de lunes a domingo, con relleno a los costados.
 *
 * `mes` va 1–12. Todo se arma en UTC sobre días pelados: con husos de por medio, el primero del
 * mes se corre al último del anterior y la grilla entera baja una fila.
 */
export function grillaDelMes(anio: number, mes: number): DiaDeGrilla[][] {
  const primero = Date.UTC(anio, mes - 1, 1)
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  // `getUTCDay()` da 0 el domingo; la semana del zip arranca el lunes.
  const desplazamiento = (new Date(primero).getUTCDay() + 6) % 7
  const filas = Math.ceil((desplazamiento + diasDelMes) / 7)
  const grilla: DiaDeGrilla[][] = []
  for (let f = 0; f < filas; f++) {
    const semana: DiaDeGrilla[] = []
    for (let d = 0; d < 7; d++) {
      const n = f * 7 + d - desplazamiento
      const dia = new Date(primero + n * 86_400_000)
      semana.push({ iso: dia.toISOString().slice(0, 10), delMes: n >= 0 && n < diasDelMes })
    }
    grilla.push(semana)
  }
  return grilla
}

/** Los pagos de un día, en el orden en que se muestran en su celda. */
export const pagosDelDia = (pagos: PagoEsquema[], iso: string): PagoEsquema[] =>
  pagos.filter((p) => p.fecha?.slice(0, 10) === iso).sort((a, b) => a.orden - b.orden)
