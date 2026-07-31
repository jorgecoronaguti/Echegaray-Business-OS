// EL PORQUÉ DE CADA JORNADA INCOMPLETA, EN UNA TABLA QUE SE PUEDE CONSULTAR.
//
// La celda de JORNALES guarda cuántas horas. No guarda —ni puede— por qué fueron esas y no
// la jornada entera: escribir "ENFERMEDAD" en una celda de horas rompe las sumas de la
// quincena. Ese porqué ya viajaba en la AUDITORÍA, que es el registro inmutable de lo que
// pasó. Pero un log de eventos no responde barato "¿cuántos días paró la obra este mes y por
// culpa de quién?": hay que abrir JSON evento por evento.
//
// POR ESO HAY DOS CASAS Y NO SE CONTRADICEN, que es distinto de duplicar:
//   · la auditoría es el HECHO — append-only, nunca se corrige, es la prueba;
//   · esta tabla es la PROYECCIÓN — el estado actual, indexado por (fecha, obra, trabajador),
//     que se pisa cuando alguien corrige una carga. Si se corrige una carga, el evento viejo
//     sigue existiendo (pasó) y la proyección refleja lo último (es).
//
// Sin esta pieza, `asistencia_novedades` quedaba creada y vacía para siempre, y con ella
// `paraliza_obra` —la marca que separa "faltó la persona" de "la obra no produjo"— no
// llegaba a existir en ningún lado consultable.
//
// NO ES CRÍTICA PARA LA ESCRITURA. Si esto falla, la celda ya se escribió y la auditoría ya
// registró el hecho: se avisa y se sigue. Perder el índice de novedades es molesto; hacer
// fallar una carga que ya está en la planilla es peor y además confunde al que la cargó.

/**
 * Persiste las novedades de una carga como proyección consultable.
 *
 * @param {{query:Function}} port  pool del OS
 * @param {object} o
 * @param {string} o.fecha            ISO YYYY-MM-DD
 * @param {string} o.claveObra
 * @param {Array}  o.novedades        salidas de `validarNovedad` + ref/nombre. Van TODAS las
 *   personas de la carga, también las que quedaron sin motivo: son las que permiten borrar una
 *   novedad anterior que se corrigió. Mandar sólo las que tienen motivo deja la marca vieja.
 * @param {number|null} [o.jornada]   jornada vigente ese día (para releer el juicio después)
 * @param {object} o.actor            { plataforma_user_id, plataforma_username }
 * @param {string} [o.origen]         'mattermost' | 'web'
 * @param {string} [o.correlationId]
 * @returns {Promise<{guardadas:number, error?:string}>}
 */
export async function guardarNovedades(port, {
  fecha, claveObra, novedades, jornada = null, actor = {}, origen = 'mattermost', correlationId = null,
} = {}) {
  if (!port?.query || !fecha || !claveObra) return { guardadas: 0 }
  // Sólo se guarda lo que TIENE motivo. Una jornada completa sin novedad no es una fila
  // vacía: es la ausencia de fila. Guardarla infla la tabla y ensucia toda consulta de
  // excepciones con el 95% de los casos que no lo son.
  const items = novedades ?? []
  const conMotivo = items.filter(tieneMotivo)
  // …pero "ausencia de fila" tiene que poder ALCANZARSE corrigiendo. Si el jefe carga a
  // alguien como accidente y después lo corrige a jornada completa, la celda de JORNALES se
  // arregla y la fila de acá quedaba con `art: true` PARA SIEMPRE. Una marca falsa que no se
  // puede borrar en la tabla que dispara ART, faltas injustificadas y obra paralizada es peor
  // que no tener la tabla. La carga corrige hacia abajo, no sólo hacia arriba.
  const aBorrar = items.filter((n) => n && !tieneMotivo(n) && refDe(n))
  if (!conMotivo.length && !aBorrar.length) return { guardadas: 0 }

  // ALCANCE: sólo las refs que vinieron en ESTA carga. Una carga de 3 personas de una cuadrilla
  // de 12 no puede borrar las novedades de las otras 9 — no dijo nada sobre ellas.
  const errorBorrado = await borrarSinMotivo(port, { fecha, claveObra, refs: aBorrar.map(refDe) })

  let guardadas = 0
  for (const n of conMotivo) {
    try {
      await port.query(
        `insert into comunicacion.asistencia_novedades
           (fecha_operativa, clave_obra, trabajador_ref, trabajador_nombre, presente, horas,
            jornada, motivo, aclaracion, obra_realizada, falta_injustificada, art,
            paraliza_obra, origen, plataforma_user_id, plataforma_username, correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (fecha_operativa, clave_obra, trabajador_ref) do update set
           trabajador_nombre = excluded.trabajador_nombre,
           presente = excluded.presente, horas = excluded.horas, jornada = excluded.jornada,
           motivo = excluded.motivo, aclaracion = excluded.aclaracion,
           obra_realizada = excluded.obra_realizada,
           falta_injustificada = excluded.falta_injustificada, art = excluded.art,
           paraliza_obra = excluded.paraliza_obra, origen = excluded.origen,
           plataforma_user_id = excluded.plataforma_user_id,
           plataforma_username = excluded.plataforma_username,
           correlation_id = excluded.correlation_id,
           actualizado_at = now()`,
        [
          fecha, claveObra, n.ref ?? null, n.nombre ?? null,
          n.presente === true, num(n.horas), num(jornada),
          n.motivo, vacioANull(n.aclaracion), vacioANull(n.obra_realizada),
          n.falta_injustificada === true, n.art === true, n.paraliza_obra === true,
          origen, actor.plataforma_user_id ?? null, actor.plataforma_username ?? null,
          correlationId,
        ],
      )
      guardadas += 1
    } catch (e) {
      // Una novedad que no entra no puede arrastrar a las demás ni a la carga entera.
      return { guardadas, error: recortar(e) }
    }
  }
  return errorBorrado ? { guardadas, error: errorBorrado } : { guardadas }
}

/**
 * Borra las novedades de los trabajadores que en esta carga YA NO tienen motivo.
 *
 * Va antes del upsert y no aborta la carga si falla: los dos conjuntos son disjuntos (una ref
 * tiene motivo o no lo tiene), así que un borrado que no entra no puede dejar a medias lo que
 * sí hay que guardar. Se informa igual, como el resto de los fallos de esta proyección.
 *
 * @returns {Promise<string|null>} el error recortado, o null si salió bien / no había nada
 */
async function borrarSinMotivo(port, { fecha, claveObra, refs }) {
  if (!refs.length) return null
  try {
    await port.query(
      `delete from comunicacion.asistencia_novedades
        where fecha_operativa = $1 and clave_obra = $2 and trabajador_ref = any($3::text[])`,
      [fecha, claveObra, refs],
    )
    return null
  } catch (e) {
    return recortar(e)
  }
}

const tieneMotivo = (n) => Boolean(n && typeof n.motivo === 'string' && n.motivo.trim())
const refDe = (n) => (typeof n?.ref === 'string' && n.ref.trim() ? n.ref.trim() : null)
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)
const vacioANull = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null)
const recortar = (e) => String(e?.message ?? e).slice(0, 200)
