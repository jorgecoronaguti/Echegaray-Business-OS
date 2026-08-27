// EL MOTOR: de un contenido validado a una presentación de Google Slides que existe en Drive.
//
// ═══ EL ORDEN NO ES CAPRICHOSO ═══
//
// validar → componer → medir → corregir → **recién ahí** crear en Drive → verificar el efecto →
// mirar lo que Google dibujó de verdad.
//
// Todo lo que se puede saber sin credenciales se sabe antes: si el contenido no entra, la
// respuesta es «achicá esto» y no queda un archivo roto en el Drive del dueño. Un link a una
// presentación con texto cortado es peor que no tener link, porque el link se manda.
//
// ═══ QUÉ CUENTA COMO PRUEBA ═══
//
// No cuenta que el batchUpdate devuelva 200. Cuentan dos cosas independientes:
//   · la presentación releída desde Google tiene la cantidad de láminas que se pidieron;
//   · el PDF exportado CONTIENE los títulos de esas láminas — o sea, el texto se renderizó.
// La segunda es la que atrapa el caso feo: la petición entró, la caja existe, y el texto no está.

import { COLOR, FUENTE, TIPO } from './marca.mjs'
import { validarPresentacion } from './contrato.mjs'
import { componerDeck } from './plantillas.mjs'
import { corregirDeck, informeQa, revisarDeck } from './qa.mjs'
import { idDeLamina, requestsCrearLaminas, requestsDeLamina } from './requests.mjs'

const PALETA_TABLA = { grafito: COLOR.grafito, fondo: COLOR.fondo, cabecera: TIPO.tablaCabecera, celda: TIPO.tablaCelda }
const LOTE = 300

/** Defectos que NO se arreglan achicando: son de la plantilla o del contenido, y hay que decirlo. */
const NO_AUTOCORREGIBLES = new Set(['contraste', 'superposicion', 'fuera_de_lamina'])

/**
 * TODO LO QUE SE PUEDE SABER SIN GOOGLE. Devuelve `{ok, compuesto, qa, correcciones}` o
 * `{ok:false, errores|qa}`. Es la función que hace que el control de calidad sea barato: corre en
 * milisegundos, sin credenciales y sin dejar rastro.
 */
export function prepararDeck(entrada) {
  const v = validarPresentacion(entrada)
  if (!v.ok) return { ok: false, motivo: 'contenido inválido', errores: v.errores }

  let compuesto = componerDeck(v.deck)
  let revision = revisarDeck(compuesto)
  let correcciones = []
  if (!revision.ok) {
    const c = corregirDeck(compuesto)
    compuesto = c.compuesto
    correcciones = c.correcciones
    revision = revisarDeck(compuesto)
  }
  const qa = informeQa(revision, correcciones)
  if (!revision.ok) {
    const duros = revision.hallazgos.filter((h) => h.severidad === 'bloqueante' && NO_AUTOCORREGIBLES.has(h.tipo))
    return {
      ok: false,
      motivo: duros.length
        ? 'la composición tiene defectos que no se arreglan achicando texto (es un defecto de la plantilla o del contenido)'
        : 'hay contenido que no entra ni al mínimo tamaño legible: acortalo y volvé a pedirla',
      qa, compuesto, correcciones,
    }
  }
  return { ok: true, deck: v.deck, compuesto, qa, correcciones }
}

/** Peticiones de dibujo de todo el mazo, ya separadas. PURA. */
export function requestsDelDeck(compuesto) {
  const principales = []
  const imagenes = []
  compuesto.laminas.forEach((lamina, i) => {
    const r = requestsDeLamina(idDeLamina(i), lamina, { fuente: FUENTE, paleta: PALETA_TABLA })
    principales.push(...r.principales)
    imagenes.push(...r.imagenes)
  })
  return { principales, imagenes }
}

const enLotes = (arr, n = LOTE) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

/**
 * PUBLICA. Crea la presentación real y devuelve `{id, link, laminas, qa, verificacion}`.
 * `google` es el cliente de `lib/google.mjs` construido con OAuth — este módulo NO construye
 * credenciales ni sabe de tokens.
 */
export async function publicarDeck(google, entrada, { nombre = null } = {}) {
  if (!google?.crearPresentacionVacia) return { error: 'no hay cuenta de Google autorizada para crear archivos' }
  const prep = prepararDeck(entrada)
  if (!prep.ok) return { error: prep.motivo, errores: prep.errores, qa: prep.qa }

  const titulo = nombre || prep.deck.titulo
  const pres = await google.crearPresentacionVacia(titulo, { parentId: prep.deck.carpeta_id || undefined })
  const total = prep.compuesto.laminas.length

  await google.slidesBatchUpdate(pres.id, requestsCrearLaminas(total))
  if (pres.laminaInicial) {
    await google.slidesBatchUpdate(pres.id, [{ deleteObject: { objectId: pres.laminaInicial } }]).catch(() => {})
  }

  const { principales, imagenes } = requestsDelDeck(prep.compuesto)
  for (const lote of enLotes(principales)) await google.slidesBatchUpdate(pres.id, lote)

  // Las imágenes van aparte y su fallo NO tumba el mazo: una URL que Google no puede bajar
  // devuelve 400 y arrastraría el lote entero. Sin logo la presentación sirve; sin láminas, no.
  let logo = 'ok'
  if (imagenes.length) {
    try { for (const lote of enLotes(imagenes, 50)) await google.slidesBatchUpdate(pres.id, lote) }
    catch (e) { logo = `sin logo: ${String(e?.message ?? e).slice(0, 120)}` }
  }

  const verificacion = await verificarEfecto(google, pres.id, prep.compuesto)
  return {
    creada: true,
    id: pres.id,
    link: pres.link,
    nombre: titulo,
    laminas: total,
    resumen: prep.compuesto.resumen,
    qa: prep.qa,
    correcciones: prep.correcciones,
    logo,
    verificacion,
  }
}

/**
 * ¿QUEDÓ LO QUE SE PIDIÓ? Dos comprobaciones que no dependen de lo que este módulo cree haber
 * mandado: la presentación releída y el PDF exportado. Nunca lanza — un control que rompe el
 * trabajo que estaba controlando es peor que no tenerlo.
 */
export async function verificarEfecto(google, fileId, compuesto) {
  const out = { laminas_esperadas: compuesto.laminas.length }
  try {
    const p = await google.leerPresentacion(fileId)
    out.laminas_en_google = p?.slides?.length ?? null
    out.tamano = p?.pageSize ? `${p.pageSize.width?.magnitude}×${p.pageSize.height?.magnitude} ${p.pageSize.width?.unit}` : null
  } catch (e) { out.error_lectura = String(e?.message ?? e).slice(0, 140) }

  const titulos = compuesto.laminas
    .flatMap((l) => l.cajas.filter((c) => c.tipo === 'texto' && (c.estilo === TIPO.titulo || c.estilo === TIPO.seccionTitulo)).map((c) => c.contenido))
    .filter(Boolean)
  try {
    const bytes = await google.exportarPdfBytes(fileId)
    out.pdf_bytes = bytes.length
    const { PDFParse } = await import('pdf-parse')
    const texto = (await new PDFParse({ data: bytes }).getText())?.text || ''
    const normal = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    const pdf = normal(texto)
    const faltantes = titulos.filter((t) => !pdf.includes(normal(t).slice(0, 40)))
    out.titulos_controlados = titulos.length
    out.titulos_ausentes_en_el_pdf = faltantes
    out.texto_renderizado = faltantes.length === 0
  } catch (e) { out.error_pdf = String(e?.message ?? e).slice(0, 140) }
  return out
}

/**
 * MIRAR LA PRESENTACIÓN. Devuelve la URL del PNG de cada lámina, renderizado por Google — no por
 * este código. Es la única evidencia visual que no comparte origen con lo que produjo la lámina.
 */
export async function miniaturas(google, fileId, { max = 30 } = {}) {
  const p = await google.leerPresentacion(fileId)
  const ids = (p?.slides ?? []).map((s) => s.objectId).slice(0, max)
  const out = []
  for (const [i, id] of ids.entries()) {
    try { out.push({ lamina: i + 1, id, ...(await google.miniaturaDeLamina(fileId, id)) }) }
    catch (e) { out.push({ lamina: i + 1, id, error: String(e?.message ?? e).slice(0, 120) }) }
  }
  return out
}
