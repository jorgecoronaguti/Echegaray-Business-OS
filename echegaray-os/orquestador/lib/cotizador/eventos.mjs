// LO QUE PASÓ NO SE BORRA (§21).
//
// ═══ POR QUÉ UN LOG DE EVENTOS Y NO UN CAMPO «MODIFICADO_POR» ═══
//
// Un presupuesto de obra se negocia. La cantidad de mampostería cambia tres veces, el beneficio
// baja de 22 a 19 y vuelve a 21, la sanitaria pasa de propia a subcontratada y de vuelta. Al final
// alguien pregunta «¿por qué esta obra quedó en 168 y la anterior parecida en 190?» y la respuesta
// no está en el estado final: está en la secuencia.
//
// Un `modificado_por` guarda el último. Un log guarda la DISCUSIÓN, que es lo que hace falta para
// aprender de cada obra —que es el objetivo del OS, no un adorno de auditoría—.
//
// ═══ DESHACER NO ES BORRAR ═══
//
// `undo` no elimina el evento: crea un evento NUEVO que revierte el anterior y lo referencia. La
// historia queda con las dos entradas. Borrar el evento haría que «lo intentamos y lo dimos de
// baja» se viera igual que «nunca se intentó», y esas dos cosas dicen cosas distintas sobre cómo se
// cotizó la obra.
//
// ═══ EL correlation_id ═══
//
// Un solo pedido del dueño —«sacá pintura»— produce N mutaciones: la exclusión de alcance, el
// recálculo de cada partida afectada, el nuevo total. Todas comparten `correlation_id`, así que el
// undo revierte el pedido entero y no medio pedido. Sin eso, deshacer «sacá pintura» dejaría el
// alcance restaurado y el total viejo.

import crypto from 'node:crypto'
import { ACCION } from './contrato.mjs'

/**
 * UN EVENTO. PURA, congelada. Seis datos obligatorios y ninguno decorativo.
 *
 * `antes` y `despues` guardan el valor, no una descripción: «cambió la cantidad» no permite
 * reconstruir nada, «520 → 5200» sí.
 */
export function evento({
  accion, entidad, campo = null, antes = null, despues = null,
  actor, motivo = null, correlationId = null, cuando = null, revierteA = null,
} = {}) {
  if (!ACCION[accion]) throw new Error(`«${accion}» no es una acción del command layer: un evento fuera de la lista cerrada no se puede deshacer`)
  if (!entidad) throw new Error('un evento sin entidad no se puede aplicar ni revertir')
  if (!actor) throw new Error('un evento sin actor no sirve para auditar: alguien lo hizo')
  return Object.freeze({
    id: crypto.randomUUID(),
    accion, entidad, campo, antes, despues, actor, motivo,
    correlationId: correlationId ?? crypto.randomUUID(),
    cuando: cuando ?? new Date().toISOString(),
    revierteA,
  })
}

/**
 * EL REGISTRO. Append-only por construcción: `agregar` devuelve un registro NUEVO.
 *
 * No es una clase con métodos que mutan porque un registro mutable es un registro que se puede
 * truncar sin que se note. Que cada operación devuelva una copia hace que «perder historia» tenga
 * que ser una decisión explícita de quien llama, no un efecto lateral.
 */
export function registro(eventos = []) {
  return Object.freeze({
    eventos: Object.freeze([...eventos]),
    agregar: (...nuevos) => registro([...eventos, ...nuevos.flat()]),
    /** Todos los eventos de un pedido. Es la unidad que el undo revierte. */
    porCorrelacion: (id) => eventos.filter((e) => e.correlationId === id),
    /** El último valor conocido de un campo, según la historia. Sirve para el `antes` del próximo
     *  evento sin tener que consultar el estado — y para probar que la historia lo puede reconstruir. */
    ultimoDe: (entidad, campo) => [...eventos].reverse().find((e) => e.entidad === entidad && e.campo === campo)?.despues ?? null,
    largo: eventos.length,
  })
}

/**
 * DESHACER UN PEDIDO ENTERO. PURA.
 *
 * Devuelve los eventos de REVERSIÓN —uno por cada mutación del pedido, en orden inverso— para que
 * el registro los agregue. No devuelve el registro modificado: quien decide qué se guarda es el
 * llamador, y así el undo se puede simular antes de aplicarlo.
 *
 * Un pedido ya revertido no se revierte dos veces: sin esa guarda, dos `undo` seguidos volverían a
 * aplicar el cambio original con cara de deshacerlo.
 */
export function deshacer(reg, correlationId, { actor, motivo = null } = {}) {
  if (!actor) throw new Error('deshacer sin actor deja un cambio sin dueño')
  const delPedido = reg.porCorrelacion(correlationId)
  if (!delPedido.length) return { ok: false, porQue: `no hay ningún evento con la correlación ${correlationId}`, eventos: [] }
  const yaRevertidos = new Set(reg.eventos.filter((e) => e.revierteA).map((e) => e.revierteA))
  const pendientes = delPedido.filter((e) => !yaRevertidos.has(e.id))
  if (!pendientes.length) return { ok: false, porQue: 'ese pedido ya se deshizo: volver a deshacerlo lo REAPLICARÍA', eventos: [] }

  const reversion = crypto.randomUUID()
  const eventos = [...pendientes].reverse().map((e) => evento({
    accion: 'undo', entidad: e.entidad, campo: e.campo,
    antes: e.despues, despues: e.antes,
    actor, motivo: motivo ?? `deshace «${e.accion}» sobre ${e.entidad}`,
    correlationId: reversion, revierteA: e.id,
  }))
  return { ok: true, eventos, correlationId: reversion, revierte: pendientes.length }
}

/**
 * LA HISTORIA DE UNA ENTIDAD, en castellano y en orden. PURA.
 * Es lo que contesta «¿por qué esta obra quedó en 168?» sin que nadie lea JSON.
 */
export function historiaDe(reg, entidad) {
  return reg.eventos
    .filter((e) => e.entidad === entidad)
    .map((e, i) => `${i + 1}. ${e.cuando.slice(0, 16).replace('T', ' ')} · ${e.actor} · ${e.accion}${e.campo ? ` (${e.campo})` : ''}: ${e.antes ?? '—'} → ${e.despues ?? '—'}${e.motivo ? ` — ${e.motivo}` : ''}`)
}
