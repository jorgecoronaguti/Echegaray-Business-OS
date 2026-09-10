// LA PLATA, LA FECHA Y EL ESTADO DE UN PAGO SALEN DE COBRANZAS EN VIVO — no de la copia.
//
// ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (10/09/2026) ═══
//
// El portal de Messina publicaba «PILON - Anticipo $9.030.000» y «Pisos 120m2 - Anticipo 50 %
// $4.300.876,36 del 20/07». La pestaña Cobranzas —que es donde el dueño escribe— decía otra cosa:
// «PILON - Pago parcial (07/05) $2.330.000» y «$4.234.267,49 cobrado el 04/08». La réplica de
// Cobranzas se había sincronizado a las 17:15 UTC y `esquema_pago` a las 15:18: el cliente estaba
// mirando la foto de dos horas antes, y desde la pantalla no había forma de saberlo.
//
// ═══ POR QUÉ NO SE ARREGLA ENCADENANDO EL TIMER ═══
//
// La opción obvia era que el timer de `cobranzas-sync` dispare después el del esquema. Eso achica la
// ventana pero no la cierra: mientras exista una COPIA del importe hay un intervalo —el que va del
// último sync al próximo, y el que abre cualquier corrida que falle— en el que el cliente lee un
// número que la empresa ya cambió. Dos lugares donde vive el mismo importe son dos definiciones.
//
// La repartija ya estaba escrita y no la inventa este archivo: `ajustarPagoEsquema` (pantalla 32)
// dice textual que «la fecha, el monto, el medio y el estado NO se tocan acá — son espejo de las
// columnas Q/J/N/O de Cobranzas», y el grant de la base ni siquiera los deja escribir. `esquema_pago`
// es dueña de lo que Cobranzas no sabe: `visible_portal`, `publicado_at`, `orden`, `obra_id`,
// `aviso_dias`, `nota_interna`. Todo lo demás se LEE de la fuente, en cada carga.
//
// La fila del esquema sigue haciendo falta: es la que dice si ese cobro se le puede mostrar al
// cliente. Lo que deja de mandar es su copia del número.
//
// ═══ LO QUE ESTO NO ALCANZA (declarado) ═══
//
// Una fila del esquema SIN `cobranza_fila` no tiene contraparte viva: la sembró `portal-sembrar.mjs`,
// que concilia por `(obra_id, orden)` y no guarda la fila del Sheet. Ésas quedan con su copia
// congelada, y son exactamente las que `filasQueElSyncNoAlcanza` ya venía informando.

import { estadoDePago, FILA_BASE } from '../../../orquestador/lib/portal/cobranzas-a-cliente.mjs'
import type { FilaEsquema } from './esquema.ts'

/** Una fila de `public.cobranzas` (la réplica viva de la pestaña), como la trae el portal. */
export interface FilaCobranzaViva {
  /** La columna A de la pestaña. La fila FÍSICA es ésta + `FILA_BASE`. */
  sheet_id: string | number | null
  categoria?: string | null
  concepto: string | null
  estado: string | null
  fecha_cobro: string | Date | null
  monto_neto: number | string | null
  /** El neto en la moneda ORIGINAL. Sin él, un cobro en dólares llega valuado en pesos. */
  monto_neto_origen?: number | string | null
  iva: number | string | null
  total_bruto: number | string | null
  total_bruto_origen?: number | string | null
  moneda?: string | null
  tipo_cambio?: number | string | null
}

/** La fila FÍSICA del Sheet de una fila de la réplica. `null` = la columna A no era un entero. */
export function filaDeLaReplica(v: Pick<FilaCobranzaViva, 'sheet_id'>): number | null {
  const n = Number(String(v?.sheet_id ?? '').trim())
  return Number.isInteger(n) && n >= 1 ? n + FILA_BASE : null
}

/** `Map<fila del Sheet, fila viva>`. Las que no resuelven a una fila entera quedan afuera. */
export function porFilaDelSheet(vivas: FilaCobranzaViva[]): Map<number, FilaCobranzaViva> {
  const m = new Map<number, FilaCobranzaViva>()
  for (const v of vivas) {
    const fila = filaDeLaReplica(v)
    if (fila !== null) m.set(fila, v)
  }
  return m
}

const aNumero = (v: number | string | null | undefined): number | null =>
  v == null || v === '' ? null : Number(v)

/** `date` de Postgres llega como `'YYYY-MM-DD'`; por si llega como Date, se recorta igual. */
const aISO = (v: string | Date | null): string | null => {
  if (v == null) return null
  const s = v instanceof Date ? v.toISOString() : String(v)
  return s.slice(0, 10) || null
}

/**
 * ¿ESTA FILA LA ANULÓ EL SHEET? La columna O escrita `CANCELAR` es una fila dada de baja.
 *
 * `proyectar()` la saltea, así que la fila del esquema que quedó de antes no se actualiza nunca: se
 * queda publicada, con su importe viejo, para siempre. Se retira acá.
 */
export const anuladaEnCobranzas = (v: Pick<FilaCobranzaViva, 'estado'>): boolean =>
  String(v?.estado ?? '').trim().toUpperCase() === 'CANCELAR'

/**
 * UNA FILA DEL ESQUEMA, CON LOS NÚMEROS DE COBRANZAS PUESTOS ENCIMA.
 *
 * EL IMPORTE ES EL NATIVO, NO EL VALUADO. `sync-cobranzas` valúa los dólares a pesos en `total_bruto`
 * y guarda el original en `total_bruto_origen`. La fila 62 de Quattropani son U$S 15.400: tomar el
 * valuado y pintarlo con la moneda de la fila publicaría «U$S 23.288.249». El importe y la moneda
 * salen de la MISMA fila, que es la única forma de que no puedan separarse.
 *
 * EL IVA DE UNA FILA VALUADA SE DECLARA DESCONOCIDO. La réplica guarda el IVA en pesos y no tiene
 * columna de IVA nativo: dividirlo por el tipo de cambio sería fabricar un número que nadie escribió.
 * `null` es «no hay dato» y la pantalla escribe ausencia; cero afirmaría que el cobro no lleva IVA.
 */
export function conNumerosVivos(f: FilaEsquema, v: FilaCobranzaViva, hoy: Date): FilaEsquema {
  const tc = aNumero(v.tipo_cambio ?? null)
  const valuada = tc != null && tc !== 1
  return {
    ...f,
    concepto: (v.concepto ?? '').trim() || f.concepto,
    fecha: aISO(v.fecha_cobro),
    monto: aNumero(v.total_bruto_origen ?? v.total_bruto),
    neto: aNumero(v.monto_neto_origen ?? v.monto_neto),
    iva: valuada ? null : aNumero(v.iva),
    moneda: String(v.moneda ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'ARS',
    // El estado lo decide la MISMA función que usa el sync (`estadoDePago`, copia literal de la
    // columna U del Sheet). Derivarlo de nuevo acá sería la tercera definición de «vencido».
    estado: estadoDePago({ estado: v.estado, fecha_cobro: v.fecha_cobro }, hoy),
  }
}

/**
 * EL ESQUEMA DEL CLIENTE, CON LA PLATA VIVA DE COBRANZAS.
 *
 * @param filas las filas de `esquema_pago` del cliente.
 * @param vivas las filas de `public.cobranzas` (origen `cobranzas_sheet`) que les corresponden.
 * @param hoy para decidir vencido / a vencer. Se inyecta: un test no puede depender del reloj.
 */
export function refrescarConCobranzas(
  filas: FilaEsquema[], vivas: FilaCobranzaViva[], hoy: Date = new Date(),
): FilaEsquema[] {
  const indice = porFilaDelSheet(vivas)
  const out: FilaEsquema[] = []
  for (const f of filas) {
    const v = f.cobranza_fila == null ? undefined : indice.get(Number(f.cobranza_fila))
    if (!v) { out.push(f); continue }
    if (anuladaEnCobranzas(v)) continue
    out.push(conNumerosVivos(f, v, hoy))
  }
  return out
}
