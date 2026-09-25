// EFECTIVO: EDITAR Y BORRAR TODO (dueño, 25/09/2026) — la parte pura de la pantalla.
//
// La base hace cumplir y propagar (migración 20260925T1200): acá sólo se arma lo que viaja, se valida la
// forma para no mandar un formulario que ya se sabe que rebota, y se dice en una frase lo que registró la
// bitácora (`entidad_cambio`, entidad 'efectivo'). Puro: se prueba con `node --test`.

import type { Entrega } from '../types.ts'
import { ddmm, pesos } from './entregas.ts'
import { validarMonto, type Validacion } from './formularios.ts'

export type EstadoEntrega = Entrega['estado']

/** Lo que el panel «Editar entrega» tiene escrito. Todo texto: así llega del formulario. */
export interface BorradorEdicion {
  persona: string
  destino: 'obra' | 'estructura'
  obra: string
  monto: string
  fecha: string
  paraQue: string
}

export interface EdicionValida {
  persona: string
  obra: string | null
  estructura: boolean
  monto: number
  fecha: string
  paraQue: string | null
}

export function borradorDe(e: Entrega): BorradorEdicion {
  return {
    persona: e.persona_id,
    destino: e.estructura ? 'estructura' : 'obra',
    obra: e.obra_id ?? '',
    monto: String(e.entregado).replace('.', ','),
    fecha: e.fecha.slice(0, 10),
    paraQue: e.para_que ?? '',
  }
}

export function validarEdicion(b: BorradorEdicion): Validacion<EdicionValida> {
  if (!b.persona.trim()) return { ok: false, campo: 'persona', error: 'Elegí a quién se le entregó.' }
  if (b.destino === 'obra' && !b.obra.trim()) return { ok: false, campo: 'obra', error: 'Elegí la obra, o poné Estructura.' }
  const m = validarMonto(b.monto)
  if (!m.ok) return m
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha.trim())) return { ok: false, campo: 'fecha', error: 'Poné la fecha de la entrega.' }
  return {
    ok: true,
    dato: {
      persona: b.persona.trim(),
      obra: b.destino === 'obra' ? b.obra.trim() : null,
      estructura: b.destino === 'estructura',
      monto: m.dato,
      fecha: b.fecha.trim(),
      paraQue: b.paraQue.trim() || null,
    },
  }
}

/** Lo que va a pasar al guardar, dicho antes: sólo lo que no es obvio. */
export function efectosDeGuardar(e: Entrega, b: BorradorEdicion): string[] {
  const out: string[] = []
  const m = validarMonto(b.monto)
  if (m.ok && Math.abs(m.dato - e.entregado) >= 0.005) {
    out.push(`CAJA pasa a restar ${pesos(m.dato)} en vez de ${pesos(e.entregado)} en la próxima corrida del Flujo de Caja.`)
    const poder = m.dato - e.rendido - e.devuelto
    if (poder < 0) out.push(`Queda con ${pesos(poder)} en su poder: rindió o devolvió más de lo entregado.`)
  }
  if (b.persona && b.persona !== e.persona_id && (e.conformidad || e.conformidad_en)) {
    out.push('La firma de conformidad es de la persona anterior: se borra y se le pide a la nueva.')
  }
  return out
}

/** Lo que arrastra borrar la entrega entera, para la única confirmación. */
export function loQueArrastraBorrar(a: { filas: number; tickets: number; devoluciones: number }): string {
  const partes = [
    a.filas > 0 ? `${a.filas} ${a.filas === 1 ? 'fila' : 'filas'} de Compras pasa${a.filas === 1 ? '' : 'n'} a Cancelado` : null,
    a.tickets > 0 ? `se borra${a.tickets === 1 ? '' : 'n'} ${a.tickets} ${a.tickets === 1 ? 'ticket' : 'tickets'}` : null,
    a.devoluciones > 0 ? `se borra${a.devoluciones === 1 ? '' : 'n'} ${a.devoluciones} ${a.devoluciones === 1 ? 'devolución' : 'devoluciones'}` : null,
    'sale de CAJA y de los saldos',
  ].filter(Boolean)
  return `${partes.join(' · ')}. No se deshace.`
}

// ═══ LA BITÁCORA EN CASTELLANO ═══

/** Una fila de `entidad_cambio` con entidad 'efectivo'. `campo` es «pieza.columna». */
export interface Cambio {
  id: string
  campo: string
  antes: string | null
  despues: string | null
  autor: string | null
  en: string
}

export interface Nombres {
  persona: (id: string) => string | null
  obra: (id: string) => string | null
  entrega: (id: string) => string | null
}

const ROTULO: Record<string, string> = {
  'entrega.persona_id': 'la persona', 'entrega.obra_id': 'la obra', 'entrega.estructura': 'Estructura',
  'entrega.monto': 'el importe', 'entrega.para_que': 'el concepto', 'entrega.fecha': 'la fecha',
  'entrega.conformidad_en': 'la firma de conformidad', 'entrega.conformidad_papel_url': 'el papel de conformidad',
  'entrega.cerrada_en': 'el cierre', 'entrega.anulada_en': 'la anulación', 'entrega.anulada_motivo': 'el motivo de anulación',
  'entrega.es_prueba': 'la marca de prueba',
  'rendicion.monto': 'el importe rendido', 'rendicion.entrega_id': 'la entrega de una rendición', 'rendicion.compra_clave': 'la fila de Compras rendida',
  'devolucion.monto': 'el importe de una devolución', 'devolucion.fecha': 'la fecha de una devolución',
  'devolucion.recibida_por': 'quién recibió una devolución', 'devolucion.nota': 'la nota de una devolución',
  'devolucion.firma_entrega': 'la firma de quien devolvió', 'devolucion.firma_recibe': 'la firma de quien recibió',
  'devolucion.papel_url': 'el papel de una devolución', 'devolucion.confirmada_en': 'la confirmación de una devolución',
  'devolucion.entrega_id': 'la entrega de una devolución',
  'comprobante.entrega_id': 'la entrega de un ticket', 'comprobante.descartado_en': 'el descarte de un ticket',
  'comprobante.observacion': 'la observación de un ticket', 'aviso.texto': 'el texto de un aviso', 'aviso.entrega_id': 'la entrega de un aviso',
}

const BORRADA: Record<string, string> = {
  'entrega.borrada': 'borró la entrega', 'rendicion.borrada': 'borró una rendición', 'devolucion.borrada': 'borró una devolución',
  'comprobante.borrada': 'borró un ticket', 'aviso.borrada': 'borró un aviso',
}

/** Campos que la bitácora registra pero que no le dicen nada a quien lee (van con otro que sí). */
const SIN_FRASE = new Set(['entrega.conformidad_trazo', 'comprobante.descartado_motivo', 'entrega.anulada_motivo'])

function valor(campo: string, v: string | null, n: Nombres): string {
  if (v == null || v === '') return 'vacío'
  const col = campo.split('.')[1] ?? ''
  if (col === 'monto') return pesos(Number(v))
  if (col === 'fecha') return ddmm(v)
  if (col === 'persona_id' || col === 'recibida_por') return n.persona(v) ?? 'otra persona'
  if (col === 'obra_id') return n.obra(v) ?? v
  if (col === 'entrega_id') return n.entrega(v) ?? 'otra entrega'
  if (col === 'estructura' || col === 'es_prueba') return v === 'true' ? 'sí' : 'no'
  if (col.endsWith('_en')) return ddmm(v)
  return v.length > 60 ? `«${v.slice(0, 57)}…»` : `«${v}»`
}

/** «cambió el importe de $ 20.000 a $ 25.000». null = el cambio no se muestra (va con otro). */
export function fraseDelCambio(c: Pick<Cambio, 'campo' | 'antes' | 'despues'>, n: Nombres): string | null {
  if (SIN_FRASE.has(c.campo)) return null
  if (BORRADA[c.campo]) {
    let detalle = ''
    try {
      const f = c.antes ? JSON.parse(c.antes) as { monto?: string | number; codigo?: string } : {}
      detalle = [f.codigo, f.monto != null ? pesos(Number(f.monto)) : null].filter(Boolean).join(' · ')
    } catch { /* la bitácora guarda JSON; si no se lee, la frase va sin detalle */ }
    return detalle ? `${BORRADA[c.campo]} (${detalle})` : BORRADA[c.campo]
  }
  if (c.campo === 'entrega.anulada_en') return c.despues ? 'anuló la entrega' : 'sacó la anulación'
  if (c.campo === 'entrega.cerrada_en') return c.despues ? 'cerró la entrega' : 'reabrió la entrega'
  const rotulo = ROTULO[c.campo] ?? c.campo
  if (c.campo.endsWith('_en') || c.campo.endsWith('firma_entrega') || c.campo.endsWith('firma_recibe') || c.campo.endsWith('papel_url')) {
    if (c.despues == null) return `borró ${rotulo}`
    if (c.antes == null) return `registró ${rotulo}`
  }
  return `cambió ${rotulo} de ${valor(c.campo, c.antes, n)} a ${valor(c.campo, c.despues, n)}`
}

/** Los avisos de la ficha: en qué estado está cada uno, por su evidencia (`enviado_en` = post releído). */
export function estadoDelAviso(a: { enviado_en: string | null; intentos: number; ultimo_error: string | null }): { texto: string; tono: 'pos' | 'warn' | 'neg' } {
  if (a.enviado_en) return { texto: 'salió', tono: 'pos' }
  if (a.intentos >= 5) return { texto: 'no salió (5 intentos)', tono: 'neg' }
  if (a.ultimo_error) return { texto: 'en cola, reintentando', tono: 'warn' }
  return { texto: 'en cola', tono: 'warn' }
}

export const ROTULO_AVISO: Record<string, string> = {
  reclamo: 'Reclamo de rendición', pedido_de_dato: 'Pedido de un dato', anulacion: 'Anulación', firmada: 'Firma recibida',
  pedido_firma: 'Pedido de firma',
}
