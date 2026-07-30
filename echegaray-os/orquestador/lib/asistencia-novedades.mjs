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
 * @param {Array}  o.novedades        salidas de `validarNovedad` + ref/nombre
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
  const conMotivo = (novedades ?? []).filter((n) => n && typeof n.motivo === 'string' && n.motivo.trim())
  if (!conMotivo.length) return { guardadas: 0 }

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
  return { guardadas }
}

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)
const vacioANull = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null)
const recortar = (e) => String(e?.message ?? e).slice(0, 200)
