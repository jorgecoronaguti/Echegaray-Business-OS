// "PASAME EL ARCHIVO VISION/TRACCIÓN" → el enlace del archivo, no su contenido.
//
// La capacidad es TRAER EL ARCHIVO. No lo lee, no lo resume, no lo interpreta: devuelve
// nombre, carpeta, fecha y enlace. Leer un Sheet de finanzas para contestar un "pasámelo"
// sería gastar API y, peor, meter en el chat datos que la persona no pidió.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ NO ALCANZABA CON RETOCAR ──────────────────────────────────
//
// Antes esto le preguntaba a Drive `name contains '<lo que escribió la persona>'`. Con
// "vision/traccion" Drive contestaba que no había nada, y el archivo —"Vision / Tracción"—
// estaba ahí: mismas letras, otra puntuación, otros acentos. El "no encontré" era cierto y
// completamente inútil. Ese modo de buscar no se arregla con una regex más: obliga a la
// persona a recordar el nombre exacto, que es justo lo que nadie hace.
//
// Ahora la búsqueda ocurre contra el ÍNDICE que el OS ya mantenía y nunca usaba
// (`public.drive_index`, 2.465 archivos que un timer refresca cada 6 h), con un pipeline de
// cinco etapas y un ranking explicable. Ver `lib/drive-busqueda/`.
//
// ── Y DESPUÉS: PARECERSE DE NOMBRE NO ALCANZA ───────────────────────────────────────
//
// "pasame el flujo de fondos" devolvía `Flujo de Fondos.xlsx`, en la carpeta AÑO 2025, sin
// tocar desde enero. El nombre coincidía perfecto y la respuesta era inútil: el documento que
// la empresa usa todos los días es el Sheet `Flujo de Caja - Cash Flow ECSAS`. El ranking pasó
// a mirar también qué CLASE de documento es cada candidato —vivo o archivado, registrado como
// fuente del negocio o no, copia o original, usado ayer o hace dos años—, y esta capacidad
// pasó a tener tres respuestas en vez de dos:
//
//   confianza alta   se abre y listo
//   confianza media  "Creo que te referís a…" + el enlace + las alternativas
//   confianza baja   se pregunta, con la lista numerada
//
// Las alternativas no son una duda disfrazada: son el derecho a desmentir al OS. Si el OS
// decide que "flujo de fondos" es el Cash Flow vivo, quien preguntó tiene que ver que el
// archivo que se llama así también existe. Una decisión invisible no se audita.
//
// ── CERO MODELO ─────────────────────────────────────────────────────────────────────
// Buscar es determinístico de punta a punta: normalizar, tokenizar, sinónimos, cinco etapas
// y puntaje. Ni una llamada a Anthropic, ni siquiera como último recurso. Hay un test que
// recorre el árbol de imports de este archivo y falla si alguna vez aparece una.
//
// ── PERMISOS ────────────────────────────────────────────────────────────────────────
// El índice lo arma la cuenta de servicio, así que lista lo que ella ve. El ENLACE lo abre
// la persona con su propia cuenta: si no tiene acceso, Google se lo dice. No hay un modelo de
// permisos propio acá — duplicar el compartir de Drive en una tabla del OS sería crear una
// segunda verdad que envejece sola.

import {
  CAPACIDAD, ERROR, errorAsistente, resultadoOk, resultadoError, resultadoAclaracion, zDriveBuscar,
} from '../contratos.mjs'
import { paredAR } from '../tiempo.mjs'
import { clasificarErrorGoogle, googleDisponible, errorSinCuenta } from '../google-cliente.mjs'
import { crearIndice, buscar, registrarAceptacion, registrarRechazo, analizarConsulta } from '../../../lib/drive-busqueda/buscar.mjs'
import { rutaLegible } from '../../../lib/drive-busqueda/ranking.mjs'
import {
  registrarBusqueda, leerEvento, ultimoEvento, marcarConfirmado, marcarRechazado, promoverAlias,
} from '../../../lib/drive-busqueda/registro.mjs'
import { explicarEvento } from '../../../lib/drive-busqueda/explicar.mjs'
import { FEEDBACK } from '../../../lib/drive-busqueda/feedback.mjs'

const MAX_OPCIONES = 5
const CARPETA = 'application/vnd.google-apps.folder'

/** El índice vive en el PROCESO, no en el pedido: cargarlo por mensaje sería leer 2.465
 *  filas cada vez que alguien escribe. Se comparte entre búsquedas y se refresca solo. */
let _indice = null
function indiceDe(port) {
  if (!_indice) _indice = crearIndice({ port })
  return _indice
}
/** Sólo para tests: el índice es del proceso y no debe filtrarse entre casos. */
export function _reiniciarIndice() { _indice = null }

const dosDig = (n) => String(n).padStart(2, '0')

/** ISO → "hoy 10:13" o "31/07/2026", en hora de la empresa. null si no hay fecha: se muestra
 *  el archivo sin fecha antes que con una fecha inventada. */
function fechaLegible(iso, ahora = new Date()) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = paredAR(d)
  const h = paredAR(ahora)
  if (p.y === h.y && p.m === h.m && p.d === h.d) return `hoy ${dosDig(p.hh)}:${dosDig(p.mm)}`
  return `${dosDig(p.d)}/${dosDig(p.m)}/${p.y}`
}

const enlaceDe = (e) => (e.is_folder || e.mime_type === CARPETA
  ? `https://drive.google.com/drive/folders/${e.drive_file_id}`
  : `https://drive.google.com/file/d/${e.drive_file_id}/view`)

/** Una entrada del índice → la forma que viaja al chat y a la evidencia. */
function aArchivo(e, ahora) {
  return {
    id: e.drive_file_id,
    nombre: e.name,
    tipo: e.tipo ?? 'archivo',
    ubicacion: rutaLegible(e.path, { name: e.name }),
    modificado: e.modified_time ?? null,
    fecha: fechaLegible(e.modified_time, ahora),
    enlace: e.enlace ?? enlaceDe(e),
    score: e.score ?? null,
  }
}

/** Un resultado dominante: nombre, dónde está, cuándo se tocó y el enlace. */
function textoUno(a, { creo = false } = {}) {
  const partes = [`${creo ? 'Creo que te referís a' : 'Encontré'}: **${a.nombre}**`]
  if (a.ubicacion) partes.push(`Carpeta: ${a.ubicacion}`)
  if (a.fecha) partes.push(`Última modificación: ${a.fecha}`)
  partes.push(`[Abrir](${a.enlace})`)
  return partes.join('\n')
}

/**
 * El resultado elegido MÁS lo que quedó cerca.
 *
 * Las alternativas no son una duda disfrazada: son el derecho a desmentir al OS. Cuando
 * alguien pide "el flujo de fondos" y el OS le contesta con el Cash Flow vivo porque el que se
 * llama así está en una carpeta de 2025, tiene que poder ver que ese archivo también existe.
 * Sin esto, la decisión del ranking sería invisible — y una decisión invisible no se audita.
 */
function textoConAlternativas(a, otros) {
  if (!otros.length) return textoUno(a)
  return [
    textoUno(a, { creo: true }),
    '',
    'También encontré:',
    ...otros.map((o) => `• ${lineaOpcion(o)} — [abrir](${o.enlace})`),
  ].join('\n')
}

const lineaOpcion = (a) => [a.nombre, a.ubicacion ? `en ${a.ubicacion}` : null, a.fecha].filter(Boolean).join(' — ')

/** La pregunta, con la lista numerada ADENTRO del texto: es lo único que la persona ve. */
function preguntar(archivos, terminos, tipo, eventoId = null) {
  const opciones = archivos.map((a) => ({ valor: a.id, etiqueta: lineaOpcion(a) }))
  const texto = ['Encontré varios. ¿Cuál te paso?', ...opciones.map((o, i) => `${i + 1}. ${o.etiqueta}`)].join('\n')
  return resultadoAclaracion(
    CAPACIDAD.DRIVE_BUSCAR, texto, opciones,
    // `faltante` es lo que hace que la respuesta de la persona vuelva ACÁ con el id elegido.
    // Sin esto la lista era decorativa: se ofrecía, y "el segundo" no llegaba a ningún lado.
    {
      intencion: CAPACIDAD.DRIVE_BUSCAR,
      parametros: { terminos, tipo, eventoId },
      faltante: 'archivoId',
      feedback: true,
    },
  )
}

/**
 * Lo que esta respuesta deja abierto: la persona puede confirmarla, desmentirla, pedir el otro
 * o preguntar por qué. Sin esta fila, su "no era ese" se lee como un pedido nuevo y se pierde.
 */
function seguimientoDe({ ganador, alternativas, terminos, tipo, eventoId }) {
  return {
    parcial: {
      intencion: CAPACIDAD.DRIVE_BUSCAR,
      parametros: { terminos, tipo, eventoId },
      faltante: 'archivoId',
      feedback: true,
    },
    opciones: [ganador, ...alternativas].map((a) => ({ valor: a.id, etiqueta: lineaOpcion(a) })),
  }
}

// ── Aprender: sólo lo confirmado ─────────────────────────────────────────────
//
// PROPONER NO ES APRENDER. Antes, un resultado dominante se anotaba solo como si alguien lo
// hubiera elegido; eso es inventar una preferencia y después reforzarla con su propio eco.
// Ahora el aprendizaje tiene exactamente dos puertas: la persona eligió de la lista, o dijo
// que sí. Todo lo demás queda registrado como propuesta sin respuesta.

async function aprender(port, indice, { consultaNorm, archivoId, usuario, eventoId }) {
  await registrarAceptacion(port, consultaNorm, archivoId, usuario)
  indice.anotarAceptacion(consultaNorm, archivoId, usuario)
  if (eventoId) await marcarConfirmado(port, eventoId, archivoId)
  // Con esta confirmación, ¿la consulta ya se ganó ser un alias? Es una consulta chica y
  // acotada a esta frase; hacerlo acá evita un proceso aparte que nadie recuerda correr.
  await promoverAlias(port, consultaNorm)
}

/** El evento al que se refiere el feedback: el que se declaró, o la última búsqueda suya. */
async function eventoDelFeedback(port, eventoId, usuario) {
  const e = eventoId ? await leerEvento(port, eventoId) : null
  return e ?? (await ultimoEvento(port, usuario))
}

/** "Correcto" / "no era ese" / "por qué ese". */
async function atenderFeedback(port, indice, { feedback, eventoId, usuario, terminos, tipo, ahora }) {
  const evento = await eventoDelFeedback(port, eventoId, usuario)
  if (!evento) {
    return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
      ERROR.NO_ENCONTRADO, 'No tengo a mano cuál fue la última búsqueda. Pedímelo de nuevo por el nombre.',
    ))
  }
  if (feedback === FEEDBACK.EXPLICA) {
    return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, explicarEvento(evento), { evento: evento.id, explicado: true })
  }
  if (feedback === FEEDBACK.CONFIRMA) {
    if (!evento.elegido) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.NO_ENCONTRADO, 'No te propuse ningún archivo todavía, así que no sé qué confirmar.',
      ))
    }
    await aprender(port, indice, {
      consultaNorm: evento.consulta_norm, archivoId: evento.elegido, usuario, eventoId: evento.id,
    })
    return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, 'Listo, lo anoto: la próxima que pidas eso, te paso ese.',
      { evento: evento.id, aprendido: true, archivo: evento.elegido })
  }
  return rechazarResultado(port, indice, evento, { usuario, terminos, tipo, ahora })
}

/**
 * "No era ese". Se descuenta lo propuesto y se ofrecen los que habían quedado atrás.
 *
 * El descuento importa tanto como la lista: una corrección que sólo cambia la respuesta de hoy
 * obliga a la persona a corregir lo mismo mañana.
 */
async function rechazarResultado(port, indice, evento, { usuario, terminos, tipo, ahora }) {
  await marcarRechazado(port, evento.id)
  if (evento.elegido) {
    await registrarRechazo(port, evento.consulta_norm, evento.elegido, usuario)
    indice.anotarRechazo(evento.consulta_norm, evento.elegido, usuario)
  }
  const filas = await indice.filasVigentes()
  const otros = (Array.isArray(evento.candidatos) ? evento.candidatos : [])
    .filter((c) => c.id !== evento.elegido)
    .map((c) => filas.find((f) => f.drive_file_id === c.id))
    .filter(Boolean)
    .slice(0, MAX_OPCIONES)
    .map((f) => aArchivo(f, ahora))
  if (!otros.length) {
    return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
      ERROR.NO_ENCONTRADO,
      'Anotado, ese no era. No tengo otro parecido: probá con otra palabra del nombre o de la carpeta.',
    ))
  }
  return preguntar(otros, terminos ?? evento.consulta, tipo, evento.id)
}

// ── El último recurso: Drive en vivo ─────────────────────────────────────────
//
// El índice se refresca cada 6 h. Un archivo creado hace diez minutos no está — y quien lo
// acaba de subir es exactamente quien lo va a pedir. Sólo cuando el índice no trajo NADA se
// le pregunta a Drive, con la cuenta de la persona. Es una llamada a Google, no a un modelo.
async function fallbackDrive(google, consulta, ahora) {
  if (typeof google?.searchFile !== 'function' || !consulta.tokens.length) return []
  const crudos = (await google.searchFile(consulta.tokens[0])) || []
  return crudos
    .filter((f) => f?.id)
    .slice(0, MAX_OPCIONES)
    .map((f) => aArchivo({
      drive_file_id: f.id, name: f.name, path: '', tipo: null,
      mime_type: f.mimeType, is_folder: f.mimeType === CARPETA, modified_time: null,
    }, ahora))
}

export const capacidad = {
  id: CAPACIDAD.DRIVE_BUSCAR,
  nombre: 'Buscar un archivo en Drive',
  descripcion: 'buscarte un archivo en el Drive y pasarte el enlace para abrirlo',
  version: '2.0.0',
  orden: 10,
  permisos: ['drive.read'],
  efectoExterno: false,
  ejemplos: ['pasame el contrato de Quattropani', 'buscame el flujo de caja', 'vision/traccion'],
  entrada: zDriveBuscar,
  habilitada: (ctx) => googleDisponible(ctx, ctx?.googleDeps),

  async ejecutar(params, ctx = {}) {
    const p = zDriveBuscar.safeParse(params)
    if (!p.success) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.DATO_FALTANTE, '¿Qué archivo busco? Decime el nombre o parte del nombre.', p.error.message,
      ))
    }
    const { terminos, tipo, archivoId, feedback, eventoId } = p.data
    const ahora = ctx.ahora?.() ?? new Date()
    const port = ctx.port
    // Quién pregunta. El aprendizaje es por persona: lo que Jorge eligió diez veces dice más
    // sobre lo que Jorge quiere que lo que eligió cualquier otro.
    const usuario = ctx.identidad?.plataformaUserId ?? ''
    if (!port?.query) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.TEMPORAL, 'No puedo buscar en este momento. Probá de nuevo en un minuto.', 'sin port',
      ))
    }
    const indice = indiceDe(port)
    const canal = ctx.identidad?.plataforma ?? 'desconocido'

    // ── La persona dijo algo SOBRE el resultado anterior ──
    if (feedback) {
      return atenderFeedback(port, indice, { feedback, eventoId, usuario, terminos, tipo, ahora })
    }

    // ── La persona ELIGIÓ una de las opciones que le ofrecí ──
    // Es el único momento en que sé con certeza cuál era: se devuelve y se aprende.
    if (archivoId) {
      const filas = await indice.filasVigentes()
      const e = filas.find((f) => f.drive_file_id === archivoId)
      if (!e) {
        return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
          ERROR.NO_ENCONTRADO, 'Ese archivo ya no está en el índice. Pedímelo de nuevo por el nombre.',
        ))
      }
      const { norm } = analizarConsulta(terminos, { tipo })
      await aprender(port, indice, { consultaNorm: norm, archivoId, usuario, eventoId })
      const a = aArchivo(e, ahora)
      return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoUno(a), { archivo: a, aprendido: true })
    }

    let r
    try {
      r = await buscar({
        indice, port, texto: terminos, tipo, ahora: ahora.getTime(), limite: MAX_OPCIONES, usuario,
      })
    } catch (e) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.TEMPORAL, 'No pude buscar en el Drive ahora. Probá de nuevo en un rato.',
        String(e?.message ?? e).slice(0, 200),
      ))
    }

    // TODA BÚSQUEDA DEJA RASTRO, HAYA ACERTADO O NO.
    //
    // Es lo que después permite contestar "¿por qué ese?", medir si el buscador mejora y saber
    // qué se pidió y no existía. Registrar no es aprender: esta fila dice qué propuse, no qué
    // era correcto. Si el registro falla, la búsqueda sigue igual.
    const evento = await registrarBusqueda(port, { usuario, canal, resultado: r })

    // ── Hay un elegido: se abre, y se muestra contra qué compitió ──
    if (r.ganador) {
      const a = aArchivo(r.ganador, ahora)
      const otros = (r.alternativas ?? []).map((e) => aArchivo(e, ahora))
      return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoConAlternativas(a, otros), {
        archivo: a,
        alternativas: otros,
        confianza: r.confianza,
        etapa: r.etapa,
        rescatado: Boolean(r.ganador.rescatado),
        alias: r.alias?.drive_file_id === a.id ? r.alias : null,
        senales: r.ganador.senales ?? null,
        evento,
        evaluados: r.evaluados,
        ms: r.ms,
      }, seguimientoDe({ ganador: a, alternativas: otros, terminos, tipo, eventoId: evento }))
    }

    // ── Varios: se pregunta UNA vez, con cinco como techo ──
    if (r.opciones.length) {
      return preguntar(r.opciones.map((e) => aArchivo(e, ahora)), terminos, tipo, evento)
    }

    // ── El índice no tuvo nada: recién ahí, Drive en vivo ──
    if (!ctx.google) return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorSinCuenta())
    try {
      const vivos = await fallbackDrive(ctx.google, r.consulta, ahora)
      if (vivos.length === 1) {
        return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoUno(vivos[0]), { archivo: vivos[0], via: 'drive_vivo' })
      }
      if (vivos.length > 1) return preguntar(vivos, terminos, tipo)
    } catch (e) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, clasificarErrorGoogle(e, { que: `"${terminos}" en el Drive` }))
    }

    return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
      ERROR.NO_ENCONTRADO,
      `No encontré nada parecido a "${terminos}" en el Drive. Probá con otra palabra del nombre o de la carpeta.`,
      `etapas agotadas sobre ${r.evaluados} archivos indexados`,
    ))
  },
}
