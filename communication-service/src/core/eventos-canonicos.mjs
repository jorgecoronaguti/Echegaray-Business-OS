// PR-3 · Contrato Canónico de Eventos de Comunicación.
//
// Este módulo es EL CONTRATO entre el Business OS y el mundo exterior de la
// comunicación (Mattermost hoy; cualquier plataforma mañana). No conoce
// Mattermost, no conoce Postgres, no conoce especialistas. Sólo define la forma
// canónica de un evento y cómo construirlo/validarlo.
//
// Propiedades exigidas por PR-3:
//   - VERSIONADO   → cada evento lleva `schema_version`; los consumidores pueden
//                    migrar sin romper. `SCHEMA_VERSION` es el número actual.
//   - IDEMPOTENTE  → cada evento tiene una `idempotency_key` estable y derivable;
//                    reprocesar el mismo hecho no duplica.
//   - AUDITABLE    → `id`, `occurred_at`, `correlation_id`, `causation_id`, `actor`
//                    permiten reconstruir la cadena causal completa.
//   - EXTENSIBLE   → nuevos `type` y campos de `data` sin tocar el envoltorio;
//                    `data` es abierto, el sobre es cerrado y estable.
//
// El evento canónico es el ÚNICO idioma que cruza la frontera. Un mensaje de
// Mattermost NO entra al OS como mensaje de Mattermost: entra como evento
// canónico. El OS NO habla Mattermost: emite eventos canónicos y el adapter
// decide cómo publicarlos. Ese desacople es el objetivo entero del PR-3.

import { randomUUID, createHash } from 'node:crypto'

/** Versión actual del sobre canónico. Subir SÓLO ante un cambio incompatible del
 *  sobre (no de `data`). Los consumidores comparan contra las que soportan. */
export const SCHEMA_VERSION = 1

/** Direcciones del flujo respecto del Business OS. */
export const DIRECCION = Object.freeze({
  /** El OS produce el evento; el adapter lo publica hacia la plataforma. */
  SALIENTE: 'outbound',
  /** La plataforma originó el hecho; el adapter lo convirtió a canónico y entra al OS. */
  ENTRANTE: 'inbound',
})

// Catálogo de tipos canónicos. Es EXTENSIBLE: agregar un tipo nuevo es agregar
// una entrada acá y (si aplica) enseñarle al adapter a mapearlo. El sobre no
// cambia. Namespaced `dominio.hecho` para que nunca colisionen entre módulos.
export const TIPOS = Object.freeze({
  // — Salientes (OS → plataforma): el OS quiere comunicar algo —
  MENSAJE_PUBLICAR: 'mensaje.publicar', // publicar texto en un canal / DM
  MENSAJE_RESPONDER: 'mensaje.responder', // responder en un hilo existente
  REACCION_AGREGAR: 'reaccion.agregar', // reaccionar a un mensaje
  ARCHIVO_PUBLICAR: 'archivo.publicar', // adjuntar un archivo a un mensaje
  // — Entrantes (plataforma → OS): alguien hizo algo en el chat —
  MENSAJE_RECIBIDO: 'mensaje.recibido', // llegó un mensaje de una persona
  COMANDO_INVOCADO: 'comando.invocado', // se invocó un slash command
  REACCION_RECIBIDA: 'reaccion.recibida', // alguien reaccionó a un mensaje
  ARCHIVO_RECIBIDO: 'archivo.recibido', // llegó un archivo
  MIEMBRO_UNIDO: 'miembro.unido', // alguien se unió a un canal
})

const TIPOS_SALIENTES = new Set([
  TIPOS.MENSAJE_PUBLICAR, TIPOS.MENSAJE_RESPONDER, TIPOS.REACCION_AGREGAR, TIPOS.ARCHIVO_PUBLICAR,
])
const TIPOS_ENTRANTES = new Set([
  TIPOS.MENSAJE_RECIBIDO, TIPOS.COMANDO_INVOCADO, TIPOS.REACCION_RECIBIDA,
  TIPOS.ARCHIVO_RECIBIDO, TIPOS.MIEMBRO_UNIDO,
])

const TODOS_LOS_TIPOS = new Set([...TIPOS_SALIENTES, ...TIPOS_ENTRANTES])

/** Dirección implícita de un tipo. La frontera es explícita en el contrato, no
 *  una convención de nombres que alguien pueda romper sin querer. */
export function direccionDe(tipo) {
  if (TIPOS_SALIENTES.has(tipo)) return DIRECCION.SALIENTE
  if (TIPOS_ENTRANTES.has(tipo)) return DIRECCION.ENTRANTE
  return null
}

/** Deriva una idempotency_key estable a partir de la IDENTIDAD NATURAL de un
 *  hecho externo (p.ej. el `post_id`/`trigger_id` de Mattermost). Es identidad,
 *  no contenido: dos posts distintos con el mismo texto tienen post_id distinto
 *  ⇒ claves distintas. Se usa SÓLO para eventos ENTRANTES, donde la plataforma
 *  provee un identificador natural del hecho. Determinística (sha256).
 *
 *  Para eventos SALIENTES NO se usa esto: la identidad es la INTENCIÓN de emisión
 *  (ver `construirEvento` / M1), no un hash del payload. */
export function claveIdempotencia(partes) {
  const norm = Object.keys(partes)
    .sort()
    .map((k) => `${k}=${partes[k] ?? ''}`)
    .join('|')
  return createHash('sha256').update(norm).digest('hex').slice(0, 32)
}

/** Construye un evento canónico validado. Único punto de creación: nadie arma un
 *  evento a mano, así el sobre queda garantizado en todo el sistema.
 *
 *  IDEMPOTENCIA POR INTENCIÓN (M1). La identidad de un evento NUNCA es su
 *  contenido. La clave se resuelve en este orden:
 *    1. `spec.idempotency_key` explícita (clave de negocio del emisor) — gana.
 *    2. `spec.intent_id` (una intención de negocio: "certificado-4-aprobado")
 *       ⇒ `intent:<intent_id>`.
 *    3. el `id` del evento (único por emisión) ⇒ dos mensajes idénticos con
 *       `id` distinto SÍ se envían los dos; un reintento reusa el MISMO objeto
 *       evento (mismo `id`) ⇒ se deduplica.
 *  Nunca se deriva de texto/canal/payload: eso suprimía avisos legítimos (B1).
 *
 *  @param {object} spec
 *  @param {string} spec.type       - uno de TIPOS
 *  @param {object} spec.data       - carga específica del tipo (abierta, extensible)
 *  @param {string} [spec.idempotency_key] - clave de negocio explícita (prioridad 1)
 *  @param {string} [spec.intent_id]       - id de intención de negocio (prioridad 2)
 *  @param {string} [spec.correlation_id]  - hilo causal; se hereda o se genera
 *  @param {string} [spec.causation_id]    - id del evento que causó éste
 *  @param {object} [spec.actor]    - quién lo originó { tipo, id, display }
 *  @param {string} [spec.occurred_at]     - ISO; default ahora
 */
export function construirEvento(spec) {
  const { type, data } = spec ?? {}
  if (!TODOS_LOS_TIPOS.has(type)) {
    throw new Error(`tipo de evento canónico desconocido: ${JSON.stringify(type)}`)
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`el evento ${type} requiere un objeto data`)
  }
  const id = spec.id ?? randomUUID()
  const idempotency_key =
    spec.idempotency_key ?? (spec.intent_id ? `intent:${spec.intent_id}` : id)
  return Object.freeze({
    schema_version: SCHEMA_VERSION,
    id,
    type,
    direccion: direccionDe(type),
    idempotency_key,
    correlation_id: spec.correlation_id ?? id, // raíz del hilo si no hereda uno
    causation_id: spec.causation_id ?? null,
    actor: spec.actor ?? null,
    occurred_at: spec.occurred_at ?? new Date().toISOString(),
    data: Object.freeze({ ...data }),
  })
}

/** Valida un evento ya construido (p.ej. leído de la base o de otro servicio).
 *  Devuelve { ok:true } | { ok:false, error }. No lanza: los bordes deciden. */
export function validarEvento(ev) {
  if (ev == null || typeof ev !== 'object') return { ok: false, error: 'evento vacío' }
  if (typeof ev.schema_version !== 'number') return { ok: false, error: 'falta schema_version' }
  if (ev.schema_version > SCHEMA_VERSION) {
    return { ok: false, error: `schema_version ${ev.schema_version} > soportada ${SCHEMA_VERSION}` }
  }
  if (!TODOS_LOS_TIPOS.has(ev.type)) return { ok: false, error: `type desconocido: ${ev.type}` }
  if (!ev.id) return { ok: false, error: 'falta id' }
  if (!ev.idempotency_key) return { ok: false, error: 'falta idempotency_key' }
  if (ev.direccion !== direccionDe(ev.type)) {
    return { ok: false, error: `direccion incoherente con type ${ev.type}` }
  }
  if (ev.data == null || typeof ev.data !== 'object') return { ok: false, error: 'falta data' }
  return { ok: true }
}

export const _internos = { TIPOS_SALIENTES, TIPOS_ENTRANTES }
