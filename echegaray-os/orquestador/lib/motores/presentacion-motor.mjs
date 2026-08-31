// EL BORDE DEL MOTOR DE PRESENTACIONES. No reescribe `lib/slides/` — lo cierra.
//
// ═══ QUÉ AGREGA ESTE ARCHIVO ═══
//
// `lib/slides/` ya sabe validar, componer, medir, dibujar y verificar. Lo que le faltaba para ser
// un MOTOR y no una tool es el borde: entrada estructurada, salida verificada, fallos con nombre,
// idempotencia y una operación de actualización. Eso es todo lo que hay acá.
//
// ═══ LA FRONTERA CONTENIDO / FORMA, DICHA UNA VEZ MÁS ═══
//
// Entra CONTENIDO (qué lámina, qué dice, de dónde salió). La grilla, la tipografía, el color y la
// posición las decide el motor y NO se pueden pedir. Con Claude apagado esto funciona entero: la
// composición y la medición son aritmética, no lenguaje.

import { CODIGO, fallo, intentar } from './errores.mjs'
import { miniaturas, prepararDeck, publicarDeck, requestsDelDeck, verificarEfecto } from '../slides/motor.mjs'
import { requestsCrearLaminas } from '../slides/requests.mjs'

const CLAVE_OS = 'os_clave'
const enlace = (id) => `https://docs.google.com/presentation/d/${id}/edit`

/** PREPARA sin crear nada y sin credenciales: dice si el contenido entra. 0 API, 0 modelo. */
export function prepararPresentacion(contenido) {
  const p = prepararDeck(contenido)
  if (!p.ok) return fallo(CODIGO.INVALID_CONTENT, p.motivo, { errores: p.errores, control_de_calidad: p.qa })
  return { ok: true, laminas: p.compuesto.laminas.length, resumen: p.compuesto.resumen, control_de_calidad: p.qa, correcciones: p.correcciones }
}

/**
 * CREA la presentación. Idempotente con `clave`: el reintento devuelve la misma, no una segunda.
 * @returns {Promise<{ok:true, id, link, laminas, reutilizado:boolean, verificacion:object}|object>}
 */
export async function crearPresentacion(google, { contenido, nombre, clave } = {}) {
  const previa = prepararPresentacion(contenido)
  if (!previa.ok) return previa
  if (!google?.crearPresentacionVacia) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cuenta de Google autorizada para crear archivos')

  if (clave && google.buscarPorPropiedad) {
    const b = await intentar(() => google.buscarPorPropiedad(CLAVE_OS, String(clave)), 'al buscar una presentación previa')
    if (!b.ok) return b
    const ya = (b.valor ?? [])[0]
    if (ya) return { ok: true, id: ya.id, link: enlace(ya.id), nombre: ya.name, reutilizado: true, laminas: previa.laminas, verificacion: { reutilizada: true } }
  }

  const r = await intentar(() => publicarDeck(google, contenido, { nombre: nombre ?? null }), 'al crear la presentación')
  if (!r.ok) return r
  const deck = r.valor
  if (deck?.error) return fallo(CODIGO.INVALID_CONTENT, deck.error, { errores: deck.errores, control_de_calidad: deck.qa })
  if (clave && google.marcarArchivo) {
    await intentar(() => google.marcarArchivo(deck.id, { [CLAVE_OS]: String(clave) }), 'al marcar la presentación')
  }
  if (deck.verificacion?.texto_renderizado === false) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, 'la presentación se creó pero el PDF exportado no tiene los títulos: el texto no se renderizó',
      { id: deck.id, link: deck.link, verificacion: deck.verificacion })
  }
  return { ok: true, id: deck.id, link: deck.link, nombre: deck.nombre, laminas: deck.laminas, reutilizado: false, control_de_calidad: deck.qa, verificacion: deck.verificacion }
}

/**
 * ACTUALIZA una presentación existente: borra sus láminas y la vuelve a dibujar con el contenido
 * nuevo. Se reemplaza entera a propósito — una presentación es un conjunto compuesto, y parchear
 * una lámina suelta deja el resto contando otra historia.
 */
export async function actualizarPresentacion(google, fileId, contenido) {
  const prep = prepararDeck(contenido)
  if (!prep.ok) return fallo(CODIGO.INVALID_CONTENT, prep.motivo, { errores: prep.errores, control_de_calidad: prep.qa })
  if (!google?.slidesBatchUpdate) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cuenta de Google autorizada')

  const actual = await intentar(() => google.leerPresentacion(String(fileId)), 'al leer la presentación')
  if (!actual.ok) return actual
  const viejas = (actual.valor?.slides ?? []).map((s) => s.objectId)

  const total = prep.compuesto.laminas.length
  // BORRAR Y CREAR VAN EN EL MISMO BATCH, y no es una optimización. Las láminas nuevas usan los
  // MISMOS objectId que las viejas (`ecspag001`…): en dos batches, el primero choca con ids que
  // todavía existen. Y en el orden inverso —borrar y después crear— la presentación queda un
  // instante con CERO láminas, que es un archivo roto si el segundo batch falla.
  const rehacer = [...viejas.map((id) => ({ deleteObject: { objectId: id } })), ...requestsCrearLaminas(total)]
  const alta = await intentar(() => google.slidesBatchUpdate(fileId, rehacer), 'al rehacer las láminas')
  if (!alta.ok) return alta
  const { principales, imagenes } = requestsDelDeck(prep.compuesto)
  const dibujo = await intentar(() => google.slidesBatchUpdate(fileId, principales), 'al dibujar las láminas')
  if (!dibujo.ok) return dibujo
  if (imagenes.length) await intentar(() => google.slidesBatchUpdate(fileId, imagenes), 'al insertar las imágenes')

  const verificacion = await verificarEfecto(google, String(fileId), prep.compuesto)
  if (verificacion.laminas_en_google !== total) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, `se pidieron ${total} láminas y Google devuelve ${verificacion.laminas_en_google}`, { verificacion })
  }
  return { ok: true, id: String(fileId), link: enlace(fileId), laminas: total, verificacion }
}

/**
 * MIRAR EL RENDER DE VERDAD. Devuelve el PNG que dibujó Google, en BYTES, no la URL.
 *
 * La regla de este repositorio para las láminas está escrita textual: «si no viste las imágenes, no
 * está lista». Una URL de miniatura no es haberla visto — es la promesa de que existe una. Bajar
 * los bytes es lo mínimo que distingue las dos cosas, y deja algo que se puede abrir y mirar.
 */
export async function mirarPresentacion(google, fileId, { max = 30, bajar = true } = {}) {
  if (!google?.miniaturaDeLamina) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cuenta de Google autorizada')
  const r = await intentar(() => miniaturas(google, String(fileId), { max }), 'al pedir las miniaturas')
  if (!r.ok) return r
  const laminas = r.valor
  if (!laminas.length) return fallo(CODIGO.FILE_NOT_FOUND, `la presentación ${fileId} no tiene láminas`)
  if (!bajar) return { ok: true, laminas }

  const out = []
  for (const l of laminas) {
    if (!l.url) { out.push({ ...l, bytes: 0, error: l.error ?? 'sin url de miniatura' }); continue }
    try {
      const res = await fetch(l.url)
      const buf = Buffer.from(await res.arrayBuffer())
      // Un PNG empieza con \x89PNG. Un HTML de error también devuelve 200 y también tiene bytes.
      const esPng = buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG'
      out.push({ ...l, bytes: buf.length, png: esPng, contenido: esPng ? buf : null, ...(esPng ? {} : { error: 'lo que bajó no es un PNG' }) })
    } catch (e) { out.push({ ...l, bytes: 0, error: String(e?.message ?? e).slice(0, 120) }) }
  }
  const malas = out.filter((l) => !l.png)
  if (malas.length) return fallo(CODIGO.WRITE_NOT_PERSISTED, `${malas.length} de ${out.length} láminas no devolvieron un PNG`, { laminas: out.map(sinBytes) })
  return { ok: true, laminas: out }
}

const sinBytes = (l) => ({ ...l, contenido: undefined })

/** EXPORTA la presentación a PDF, en memoria. No deja copias en Drive. */
export async function exportarPresentacion(google, fileId, { formato = 'pdf' } = {}) {
  if (String(formato).toLowerCase() !== 'pdf') {
    return fallo(CODIGO.UNSUPPORTED_OPERATION, `no sé exportar una presentación a «${formato}»`, { soportados: ['pdf'] })
  }
  if (!google?.exportarPdfBytes) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cuenta de Google autorizada')
  const r = await intentar(() => google.exportarPdfBytes(String(fileId)), 'al exportar la presentación')
  if (!r.ok) return r
  if (!r.valor?.length) return fallo(CODIGO.WRITE_NOT_PERSISTED, 'la exportación devolvió 0 bytes')
  return { ok: true, formato: 'pdf', bytes: r.valor.length, contenido: r.valor }
}
