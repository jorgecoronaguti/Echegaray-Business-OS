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
import { crearIndice, buscar, registrarAceptacion, analizarConsulta } from '../../../lib/drive-busqueda/buscar.mjs'
import { rutaLegible } from '../../../lib/drive-busqueda/ranking.mjs'

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
    ubicacion: rutaLegible(e.path),
    modificado: e.modified_time ?? null,
    fecha: fechaLegible(e.modified_time, ahora),
    enlace: e.enlace ?? enlaceDe(e),
    score: e.score ?? null,
  }
}

/** Un resultado dominante: nombre, dónde está, cuándo se tocó y el enlace. */
function textoUno(a) {
  const partes = [`Encontré: **${a.nombre}**`]
  if (a.ubicacion) partes.push(`Carpeta: ${a.ubicacion}`)
  if (a.fecha) partes.push(`Última modificación: ${a.fecha}`)
  partes.push(`[Abrir](${a.enlace})`)
  return partes.join('\n')
}

const lineaOpcion = (a) => [a.nombre, a.ubicacion ? `en ${a.ubicacion}` : null, a.fecha].filter(Boolean).join(' — ')

/** La pregunta, con la lista numerada ADENTRO del texto: es lo único que la persona ve. */
function preguntar(archivos, terminos, tipo) {
  const opciones = archivos.map((a) => ({ valor: a.id, etiqueta: lineaOpcion(a) }))
  const texto = ['Encontré varios. ¿Cuál te paso?', ...opciones.map((o, i) => `${i + 1}. ${o.etiqueta}`)].join('\n')
  return resultadoAclaracion(
    CAPACIDAD.DRIVE_BUSCAR, texto, opciones,
    // `faltante` es lo que hace que la respuesta de la persona vuelva ACÁ con el id elegido.
    // Sin esto la lista era decorativa: se ofrecía, y "el segundo" no llegaba a ningún lado.
    { intencion: CAPACIDAD.DRIVE_BUSCAR, parametros: { terminos, tipo }, faltante: 'archivoId' },
  )
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
    const { terminos, tipo, archivoId } = p.data
    const ahora = ctx.ahora?.() ?? new Date()
    const port = ctx.port
    if (!port?.query) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.TEMPORAL, 'No puedo buscar en este momento. Probá de nuevo en un minuto.', 'sin port',
      ))
    }
    const indice = indiceDe(port)

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
      await registrarAceptacion(port, norm, archivoId)
      indice.anotarAceptacion(norm, archivoId)
      const a = aArchivo(e, ahora)
      return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoUno(a), { archivo: a, aprendido: true })
    }

    let r
    try {
      r = await buscar({ indice, port, texto: terminos, tipo, ahora: ahora.getTime(), limite: MAX_OPCIONES })
    } catch (e) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.TEMPORAL, 'No pude buscar en el Drive ahora. Probá de nuevo en un rato.',
        String(e?.message ?? e).slice(0, 200),
      ))
    }

    // ── Un ganador claro ──
    if (r.ganador) {
      const a = aArchivo(r.ganador, ahora)
      await registrarAceptacion(port, r.consulta.norm, a.id)
      indice.anotarAceptacion(r.consulta.norm, a.id)
      return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoUno(a), {
        archivo: a, etapa: r.etapa, evaluados: r.evaluados, ms: r.ms,
      })
    }

    // ── Varios: se pregunta UNA vez, con cinco como techo ──
    if (r.opciones.length) {
      return preguntar(r.opciones.map((e) => aArchivo(e, ahora)), terminos, tipo)
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
