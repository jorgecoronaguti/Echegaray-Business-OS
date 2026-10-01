// EL ESTADO DE CUENTA DEL CLIENTE — lo que cada renglón dice de sí mismo, sin pantalla.
//
// ═══ EL PEDIDO (dueño, 01/10/2026) ═══
//
// «Esto realmente es inservible e inusable… no puedo saber nada de las cobranzas de ningún cliente
// en CRM admin, no se entiende, revisar y rehacer toda esa sección.»
//
// La pestaña dibujaba una tablita por obra —trece encabezados para veintiséis renglones— y ningún
// renglón decía en qué estado estaba ni cuándo se había facturado: el estado había que deducirlo de
// la banda en la que caía, y la fecha de factura vivía en un `title`. Acá se decide, una sola vez y
// con su test, la palabra de cada renglón. La pantalla sólo la dibuja.

import { comprobanteDe, type FilaCobranza } from './cobranzasCliente.ts'

export type ClaveDeEstado = 'cobrado' | 'vencido' | 'a_vencer' | 'anulado'

export interface EstadoConPlazo {
  clave: ClaveDeEstado
  /** En minúscula, como la celda ESTADO de la pantalla 28: «vencido · 12 d», «a vencer · 29 d». */
  texto: string
}

/**
 * EL ESTADO DE UN RENGLÓN, CON SU PLAZO CUANDO TODAVÍA NO ENTRÓ.
 *
 * Qué está cobrado, anulado o vencido lo dice la base (`esta_cobrada`, `esta_cancelada`,
 * `esta_vencida`); los días salen de `dias_cobro`, que la vista mide contra el hoy de San Juan. Acá
 * NO se calcula ninguna fecha: un servidor en UTC le erraría un día a partir de las 21 h.
 *
 * Sin `dias_cobro` —la vista todavía no lo trae, o la fila no tiene fecha de cobro— el estado se
 * dice sin plazo. No se inventa un cero.
 */
export function estadoConPlazo(f: FilaCobranza): EstadoConPlazo {
  if (f.esta_cancelada) return { clave: 'anulado', texto: 'anulada' }
  if (f.esta_cobrada) return { clave: 'cobrado', texto: 'cobrado' }
  const dias = typeof f.dias_cobro === 'number' ? f.dias_cobro : null
  if (f.esta_vencida) {
    return { clave: 'vencido', texto: dias != null && dias < 0 ? `vencido · ${-dias} d` : 'vencido' }
  }
  if (dias === 0) return { clave: 'a_vencer', texto: 'vence hoy' }
  return { clave: 'a_vencer', texto: dias != null && dias > 0 ? `a vencer · ${dias} d` : 'a vencer' }
}

export type ClaseDePapel = 'comprobante' | 'respaldo' | 'a_facturar' | 'sin_factura'

export interface PapelDelRenglon {
  clase: ClaseDePapel
  texto: string
}

/**
 * EL PAPEL QUE RESPALDA EL RENGLÓN, CON SU PALABRA CUANDO NO HAY NÚMERO.
 *
 * «a facturar» = es del circuito B y la factura todavía no se emitió: no es un dato que falta, es
 * un plan de facturación. «sin factura» = circuito N: nunca la va a tener.
 */
export function papelDelRenglon(f: FilaCobranza): PapelDelRenglon {
  const comprobante = comprobanteDe(f)
  if (comprobante) return { clase: 'comprobante', texto: comprobante }
  if (f.respaldo_drive_id) return { clase: 'respaldo', texto: f.respaldo_titulo?.trim() || 'respaldo' }
  return (f.categoria ?? '').trim().toUpperCase() === 'B'
    ? { clase: 'a_facturar', texto: 'a facturar' }
    : { clase: 'sin_factura', texto: 'sin factura' }
}
