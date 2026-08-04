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
    nombreVisible: row.display,
    alias: Array.isArray(row.alias) ? row.alias : [],
    email: row.email ?? null,
    zonaHoraria: row.zona_horaria ?? TZ_EMPRESA,
    activo: row.activo !== false,
  })
}

const COLUMNAS = `plataforma, plataforma_user_id, plataforma_username, display,
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
      where plataforma = $1 and activo order by display`, [plataforma],
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
       (plataforma, plataforma_user_id, plataforma_username, display, alias, email, zona_horaria, activo)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (plataforma, plataforma_user_id) do update set
       plataforma_username = excluded.plataforma_username,
       display      = excluded.display,
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

/** Una sola pasada de criterios sobre un texto ya normalizado. */
function buscar(lista, q) {
  for (const cumple of CRITERIOS) {
    const hits = lista.filter((i) => cumple(i, q))
    if (hits.length === 1) return { unica: hits[0] }
    if (hits.length > 1) return { ambiguas: hits }
  }
  return null
}

/**
 * Un nombre libre del chat → la persona real, o la ambigüedad declarada.
 *
 * NOMBRE DE UNA O DOS PALABRAS. El intérprete no puede saber cuál de las dos es: en
 * "recordale a Juan Pablo revisar los certificados" el nombre son dos palabras, y en
 * "recordale a Rodrigo buscar las llaves" la segunda ya es el pedido. Distinguirlo por
 * mayúsculas no sirve —en el chat nadie las usa— así que decide QUIÉN SABE: se prueba el
 * texto entero y, si no resuelve, se recorta la última palabra y se vuelve a probar. Lo
 * recortado se devuelve en `sobrante` para que quien llama lo reponga en el contenido; si
 * no, "buscar" se perdía y el recordatorio llegaba mutilado.
 *
 * @returns {Promise<{unica:object, sobrante?:string} | {ambiguas:Array<object>, sobrante?:string} | {ninguna:true}>}
 *   `ambiguas` es una respuesta CORRECTA, no un fallo: dos Rodrigos son dos Rodrigos y el
 *   asistente pregunta cuál. `ninguna` tampoco se rellena con el más parecido — si la
 *   persona no está en la tabla, para el OS no existe.
 */
export async function resolverPersona(port, texto, { plataforma = PLATAFORMA, candidatos = null } = {}) {
  const q = normalizar(texto)
  if (!q) return { ninguna: true }
  const lista = candidatos ?? await listarIdentidades(port, { plataforma })
  const tokens = String(texto).trim().split(/\s+/)
  for (let corte = tokens.length; corte >= 1; corte--) {
    const r = buscar(lista, normalizar(tokens.slice(0, corte).join(' ')))
    if (!r) continue
    const sobrante = tokens.slice(corte).join(' ')
    return sobrante ? { ...r, sobrante } : r
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

// ── Diagnóstico ──────────────────────────────────────────────────────────────
//
// «No puedo identificarte» y «no tenés ese permiso» salían por la misma frase, y piden cosas
// opuestas: la primera la arregla el OS (nadie del equipo puede hacer nada al respecto), la
// segunda la arregla la persona o Dirección. Mientras fueron el mismo mensaje, el defecto real
// —dos filas de identidad con ids de ejemplo— se leyó durante semanas como «no tengo permiso».

export const MOTIVO_IDENTIDAD = Object.freeze({
  SIN_ACTOR: 'identidad_sin_actor',
  NO_REGISTRADA: 'identidad_no_registrada',
  SIN_EMAIL: 'identidad_sin_email',
})

/** ¿Son códigos de "el OS no sabe quién sos"? Lo usa el router para elegir el código de error. */
export const esProblemaDeIdentidad = (codigo) => Object.values(MOTIVO_IDENTIDAD).includes(codigo)

/**
 * ¿Por qué esta identidad no alcanza para actuar en nombre de la persona? `null` si alcanza.
 *
 * Devuelve el mensaje QUE VE LA PERSONA, y dice de quién es el problema: una identidad que falta
 * o que está incompleta es un defecto del OS, no algo que se arregle escribiendo mejor el pedido.
 *
 * @returns {{codigo:string, mensaje:string}|null}
 */
export function diagnosticoIdentidad(identidad) {
  if (!identidad) {
    return {
      codigo: MOTIVO_IDENTIDAD.SIN_ACTOR,
      mensaje: 'No pude identificar quién me está escribiendo, así que no puedo hacer nada en tu nombre. '
        + 'Es un problema del OS: avisale a Dirección.',
    }
  }
  if (identidad.provisoria) {
    return {
      codigo: MOTIVO_IDENTIDAD.NO_REGISTRADA,
      mensaje: `No te tengo registrado en el OS (tu usuario de chat es ${identidad.plataformaUserId}), `
        + 'y sin eso no puedo actuar en tu cuenta. No es algo que puedas arreglar vos: avisale a '
        + 'Dirección para que reconcilien las identidades del chat.',
    }
  }
  if (!emailDe(identidad)) {
    return {
      codigo: MOTIVO_IDENTIDAD.SIN_EMAIL,
      mensaje: `Te tengo registrado como ${nombreCorto(identidad)} pero sin tu correo, y sin el correo `
        + 'no puedo actuar en tu Google. Es un problema del OS: avisale a Dirección.',
    }
  }
  return null
}
