// EL LIBRO DE LO QUE EL OS HIZO CON LOS ARCHIVOS.
//
// Tiene que poder contestar, sobre un archivo concreto: qué cambió, quién, cuándo, y con qué
// versión quedó. Nada de eso se podía contestar antes: `orq.pending_operations` guarda lo que un
// humano aprobó (y sólo la minoría de escrituras que pasa por la cola), y el resultado que guarda
// es el que la tool DIJO, no el releído.
//
// El insert guarda `verificado` y `verificado_campos` justamente para que una fila pueda decir
// «esto se hizo pero NO se probó». Una auditoría donde todo figura verificado por defecto no es
// una auditoría: es un adorno.
//
// SIN TABLA NO SE MIENTE. Si `orq.drive_audit` no existe todavía (la migración está escrita pero
// no aplicada), `registrar` levanta un error con nombre propio y quien llama lo devuelve en
// `audit.registrado === false` con el motivo. Lo que no se hace nunca es tragarse la falla.

import { CODIGO, DriveError } from './errores.mjs'

export const TABLA = 'orq.drive_audit'

const INSERT = `insert into ${TABLA}
  (correlation_id, operacion, capability_slug, engine, resultado, error,
   actor, actor_tipo, provider, file_id, parent_id, mime_type, revision_id, hash,
   clave_idempotencia, antes, despues, verificado, verificado_campos, ocurrido_en)
 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,coalesce($20::timestamptz, now()))
 returning id`

const json = (v) => (v == null ? null : JSON.stringify(v))

/**
 * Auditor contra Postgres.
 *
 * @param {object} o
 * @param {{query:Function}} o.db            el port de base (`orquestador/lib/db.mjs`)
 * @param {string} o.actor                   quién ejecuta: slug del principal, email, o el script
 * @param {'persona'|'agente'|'sistema'} [o.actorTipo]
 * @param {string} [o.capability]            la fila de orq.capabilities que gobierna la operación
 * @param {string|null} [o.correlationId]    ata las N operaciones de un mismo pedido
 * @param {string} [o.engine]
 */
export function crearAuditorPg({ db, actor, actorTipo = 'sistema', capability = 'drive.files.manage', correlationId = null, engine = 'drive.files' }) {
  if (!db?.query) throw new DriveError(CODIGO.AUDIT_UNAVAILABLE, 'el auditor necesita el port de base')
  if (!actor) throw new DriveError(CODIGO.AUDIT_UNAVAILABLE, 'el auditor necesita saber QUIÉN ejecuta: una auditoría sin actor no sirve')

  async function registrar(evento) {
    const ref = evento?.referencia ?? {}
    const verificado = Array.isArray(evento?.verificado_campos) ? evento.verificado_campos : (evento?.verificado_campos ?? [])
    try {
      const { rows } = await db.query(INSERT, [
        evento?.correlation_id ?? correlationId,
        evento?.operacion ?? 'desconocida',
        evento?.capability ?? capability,
        evento?.engine ?? engine,
        evento?.resultado ?? 'ok',
        evento?.error ?? null,
        evento?.actor ?? actor,
        evento?.actor_tipo ?? actorTipo,
        ref.provider ?? 'google-drive',
        ref.file_id ?? evento?.file_id ?? null,
        ref.folder_id ?? null,
        ref.mime_type ?? null,
        ref.revision_id ?? null,
        ref.hash ?? null,
        evento?.clave_idempotencia ?? null,
        json(evento?.antes),
        json(evento?.despues),
        evento?.verificado !== false,
        verificado,
        evento?.ocurrido_en ?? null,
      ])
      return rows[0]?.id ?? null
    } catch (e) {
      // 42P01 = relation does not exist. Es el caso «migración escrita pero no aplicada», y
      // merece un mensaje que lo diga en vez de un error de Postgres crudo.
      if (e?.code === '42P01') {
        throw new DriveError(CODIGO.AUDIT_UNAVAILABLE,
          `La tabla ${TABLA} no existe: la migración está en el repo pero NO aplicada. La operación se hizo y NO quedó auditada.`,
          { detalle: e.message })
      }
      throw new DriveError(CODIGO.AUDIT_UNAVAILABLE, 'No se pudo escribir la auditoría de Drive.', { detalle: e?.message ?? String(e) })
    }
  }

  /** LA HISTORIA DE UN ARCHIVO. La pregunta que la capacidad tiene que poder contestar. */
  async function historia(fileId, { limite = 50 } = {}) {
    const { rows } = await db.query(
      `select id, ocurrido_en, operacion, actor, actor_tipo, capability_slug, resultado,
              revision_id, antes, despues, verificado, verificado_campos, correlation_id
         from ${TABLA} where file_id = $1 order by ocurrido_en desc limit $2`,
      [fileId, limite],
    )
    return rows
  }

  /** Todo lo que pasó bajo un mismo pedido, en orden. */
  async function porCorrelacion(id) {
    const { rows } = await db.query(
      `select id, ocurrido_en, operacion, file_id, actor, resultado, verificado
         from ${TABLA} where correlation_id = $1 order by ocurrido_en asc`, [id],
    )
    return rows
  }

  return { registrar, historia, porCorrelacion, actor, capability, correlationId }
}

/** Auditor de memoria: para los tests y para un script que corre sin base. Guarda de verdad —
 *  no es un no-op disfrazado, porque un test que audita en el vacío no prueba nada. */
export function crearAuditorEnMemoria({ actor = 'test', capability = 'drive.files.manage' } = {}) {
  const filas = []
  return {
    filas,
    actor,
    capability,
    async registrar(evento) {
      const id = `mem-${filas.length + 1}`
      filas.push({ id, ...evento, file_id: evento?.referencia?.file_id ?? evento?.file_id ?? null })
      return id
    },
    async historia(fileId) { return filas.filter((f) => f.file_id === fileId) },
    async porCorrelacion(cid) { return filas.filter((f) => f.correlation_id === cid) },
  }
}
