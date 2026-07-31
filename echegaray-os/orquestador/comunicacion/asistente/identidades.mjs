// IDENTIDADES — el puente entre las tres formas de nombrar a la misma persona.
//
// POR QUÉ EXISTE. El evento de Mattermost trae un `user_id` opaco y, en el texto, un nombre
// libre: "avisale a Rodrigo". El texto libre NO es una identidad — puede haber dos Rodrigos,
// o ninguno. Acá un nombre resuelve a una persona REAL de `comunicacion.identidades` o no
// resuelve, y entonces se pregunta. Nunca se inventa un destinatario: un recordatorio
// entregado a la persona equivocada es peor que un recordatorio no creado.
//
// LA TABLA ES CHICA (el equipo entero de la empresa) y se lee entera para resolver un
// nombre. Es a propósito: el matcheo por alias, nombre visible y primer nombre en SQL sería
// una consulta ilegible y un índice por cada criterio, para ahorrar milisegundos sobre
// decenas de filas.

import { zIdentidad, TZ_EMPRESA } from './contratos.mjs'

const PLATAFORMA = 'mattermost'

/** Normaliza para COMPARAR nombres: sin acentos, sin @, sin puntuación, minúsculas.
 *  "Juan Pablo Gómez" y "juan pablo gomez" son la misma persona; "@rodrigo" y "Rodrigo" también. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[@"'`]/g, ' ')
    .replace(/[.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const palabras = (txt) => normalizar(txt).split(' ').filter(Boolean)

/** Fila de la base → identidad del contrato. Una sola forma en todo el asistente. */
function aIdentidad(row) {
  return zIdentidad.parse({
    plataforma: row.plataforma ?? PLATAFORMA,
    plataformaUserId: row.plataforma_user_id,
    plataformaUsername: row.plataforma_username ?? null,
    nombreVisible: row.nombre_visible,
    alias: Array.isArray(row.alias) ? row.alias : [],
    email: row.email ?? null,
    zonaHoraria: row.zona_horaria ?? TZ_EMPRESA,
    activo: row.activo !== false,
  })
}

const COLUMNAS = `plataforma, plataforma_user_id, plataforma_username, nombre_visible,
                  alias, email, zona_horaria, activo`

/**
 * La identidad de quien escribió, o null si no está registrada.
 * @param {{query:Function}} port
 * @param {string} plataformaUserId
 */
export async function identidadDe(port, plataformaUserId, { plataforma = PLATAFORMA } = {}) {
  if (!port?.query || !plataformaUserId) return null
  const { rows } = await port.query(
    `select ${COLUMNAS} from comunicacion.identidades
      where plataforma = $1 and plataforma_user_id = $2 and activo limit 1`,
    [plataforma, String(plataformaUserId)],
  )
  return rows.length ? aIdentidad(rows[0]) : null
}

/** Todas las identidades activas de una plataforma (la lista completa del equipo). */
export async function listarIdentidades(port, { plataforma = PLATAFORMA } = {}) {
  if (!port?.query) return []
  const { rows } = await port.query(
    `select ${COLUMNAS} from comunicacion.identidades
      where plataforma = $1 and activo order by nombre_visible`, [plataforma],
  )
  return rows.map(aIdentidad)
}

/**
 * Alta o actualización de una identidad (lo que usa el script de siembra).
 * Idempotente por (plataforma, plataforma_user_id): correrlo dos veces no duplica a nadie.
 * @returns {Promise<{identidad:object, insertada:boolean}>}
 */
export async function registrarIdentidad(port, datos) {
  const i = zIdentidad.parse(datos)
  // `xmax = 0` distingue el INSERT del UPDATE en un upsert: es lo que permite que el script
  // informe "3 nuevas, 12 actualizadas" sin hacer una consulta previa por cada persona.
  const { rows } = await port.query(
    `insert into comunicacion.identidades
       (plataforma, plataforma_user_id, plataforma_username, nombre_visible, alias, email, zona_horaria, activo)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (plataforma, plataforma_user_id) do update set
       plataforma_username = excluded.plataforma_username,
       nombre_visible      = excluded.nombre_visible,
       alias               = excluded.alias,
       email               = excluded.email,
       zona_horaria        = excluded.zona_horaria,
       activo              = excluded.activo,
       actualizado_at      = now()
     returning ${COLUMNAS}, (xmax = 0) as insertada`,
    [i.plataforma, i.plataformaUserId, i.plataformaUsername ?? null, i.nombreVisible,
      i.alias, i.email ?? null, i.zonaHoraria, i.activo],
  )
  return { identidad: aIdentidad(rows[0]), insertada: rows[0].insertada === true }
}

/** ¿El texto es el comienzo del nombre, por PALABRAS enteras? "juan pablo" ⊂ "juan pablo gomez". */
function empiezaPorPalabras(nombre, consulta) {
  const n = palabras(nombre); const q = palabras(consulta)
  if (!q.length || q.length > n.length) return false
  return q.every((p, idx) => n[idx] === p)
}

// Criterios de match, del más específico al más laxo. El orden importa: si el username
// `rodrigo` existe, "Rodrigo" es esa persona aunque haya otro "Rodrigo Pérez" en el nombre
// visible. Bajar un escalón sólo si el anterior no encontró a NADIE.
const CRITERIOS = [
  (i, q) => normalizar(i.plataformaUsername) === q,
  (i, q) => i.alias.some((a) => normalizar(a) === q),
  (i, q) => normalizar(i.nombreVisible) === q,
  (i, q) => empiezaPorPalabras(i.nombreVisible, q),          // primer nombre / nombre compuesto
  (i, q) => palabras(i.nombreVisible).includes(q),           // el apellido suelto
]

/**
 * Un nombre libre del chat → la persona real, o la ambigüedad declarada.
 *
 * @returns {Promise<{unica:object} | {ambiguas:Array<object>} | {ninguna:true}>}
 *   `ambiguas` es una respuesta CORRECTA, no un fallo: dos Rodrigos son dos Rodrigos y el
 *   asistente pregunta cuál. `ninguna` tampoco se rellena con el más parecido — si la
 *   persona no está en la tabla, para el OS no existe.
 */
export async function resolverPersona(port, texto, { plataforma = PLATAFORMA, candidatos = null } = {}) {
  const q = normalizar(texto)
  if (!q) return { ninguna: true }
  const lista = candidatos ?? await listarIdentidades(port, { plataforma })
  for (const cumple of CRITERIOS) {
    const hits = lista.filter((i) => cumple(i, q))
    if (hits.length === 1) return { unica: hits[0] }
    if (hits.length > 1) return { ambiguas: hits }
  }
  return { ninguna: true }
}

/** El email con el que esa persona actúa en Google, o null. Sin email no hay Calendar ni Tasks. */
export function emailDe(identidad) {
  const e = identidad?.email
  return e && String(e).trim() ? String(e).trim() : null
}

/** Cómo se lo nombra en una respuesta al chat. */
export function nombreCorto(identidad) {
  if (!identidad) return 'esa persona'
  return identidad.nombreVisible || identidad.plataformaUsername || identidad.plataformaUserId
}
