// EL PIPELINE DE ESTUDIO — de una FUENTE a un CANDIDATO, etapa por etapa y con el resultado de cada una.
//
// ═══ LA CADENA, TAL CUAL LA PIDIÓ EL DUEÑO ═══
//
//   FUENTE → adquisición → hash/versionado → parsing → clasificación → extracción
//          → conocimiento estructurado → evidencia → candidato → validación → tests → activación
//
// Devuelve las DOCE etapas con su resultado, siempre — también las que no se corrieron, marcadas
// OMITIDO con el motivo. Un booleano final («se estudió: sí») no dice dónde se cortó, y sin eso no
// se puede arreglar nada ni auditar nada.
//
// ═══ DÓNDE TERMINA, Y POR QUÉ AHÍ ═══
//
// TERMINA EN CANDIDATO. Nunca en VALIDADO, nunca en «activado». Que un texto se haya leído bien no
// lo convierte en una regla que se pueda usar para cotizar: eso lo firma una persona con
// `biblioteca.validar()`, que además exige que el firmante no sea quien lo extrajo. Las etapas de
// VALIDACIÓN y ACTIVACIÓN existen en la salida justamente para decir que están PENDIENTES: borrarlas
// del recorrido haría que la cadena pareciera terminada cuando le falta lo único que la habilita.
//
// ═══ LA PROCEDENCIA LA DECIDE LA ADQUISICIÓN, NO LA CLASIFICACIÓN ═══
//
// Un PDF bajado de `inti.gob.ar` y clasificado REGLAMENTO NO nace NORMA: nace WEB. La clasificación
// decide QUÉ CAMPOS se le preguntan al documento; de dónde salió el dato es otra cosa, y no la
// cambia haberlo leído bien. Hay una lista blanca acá abajo y una comprobación que tira si alguien
// intenta salirse de ella.
import { ETAPA, PROCEDENCIA, conocimiento, documento, hueco, HUECO, ESTADO, cambioDeVersion, incorporar, yaEstudiado } from './biblioteca.mjs'
import { CLASE, VIA_CAMPO, clasificar, cuerpoDelBloque, extraerConReglas, segmentar } from './clasificar.mjs'
import { anotarUso, buscarFuente, descubrir } from './fuentes.mjs'
import { leerPdfLocal, pareceriaPdf, traer, traerPdf } from './buscar.mjs'
import path from 'node:path'
import { ORIGEN_EXTERNO, aplicarPoliticaContenidoExterno } from '../web/contenido-externo.mjs'

/** Las doce etapas, en orden. El orden ES el contrato: la salida las lista todas. */
export const PASO = Object.freeze({
  FUENTE: 'FUENTE', ADQUISICION: 'ADQUISICION', VERSIONADO: 'VERSIONADO', PARSING: 'PARSING',
  CLASIFICACION: 'CLASIFICACION', EXTRACCION: 'EXTRACCION', ESTRUCTURA: 'ESTRUCTURA',
  EVIDENCIA: 'EVIDENCIA', CANDIDATO: 'CANDIDATO', VALIDACION: 'VALIDACION', TESTS: 'TESTS',
  ACTIVACION: 'ACTIVACION',
})

export const ORDEN = Object.freeze(Object.values(PASO))

/** Cómo terminó una etapa. `DEGRADADO` es distinto de `NO_LOGRO`: hizo lo que podía y declara qué
 *  le faltó. `PENDIENTE_HUMANO` y `BLOQUEADO` no son fallas: son el diseño. */
export const RESULTADO = Object.freeze({
  LOGRO: 'LOGRO', DEGRADADO: 'DEGRADADO', NO_LOGRO: 'NO_LOGRO', OMITIDO: 'OMITIDO',
  PENDIENTE_HUMANO: 'PENDIENTE_HUMANO', BLOQUEADO: 'BLOQUEADO', YA_ESTUDIADO: 'YA_ESTUDIADO',
})

/**
 * LO ÚNICO QUE PUEDE SALIR DE ESTUDIAR UN DOCUMENTO.
 *
 * `NORMA`, `HECHO_PROYECTO`, `EXPERIENCIA_ECSAS` y `BASE_MAESTRA` NO están, y su ausencia es el
 * control: son las cuatro que este repo prohíbe alcanzar por haber leído algo.
 */
export const PROCEDENCIAS_AL_ESTUDIAR = Object.freeze([PROCEDENCIA.WEB, PROCEDENCIA.REFERENCIA_TECNICA])

/** De dónde vino el documento decide con qué procedencia nace su conocimiento. PURA. */
export function procedenciaDe(origen) {
  const p = origen === 'archivo' ? PROCEDENCIA.REFERENCIA_TECNICA : PROCEDENCIA.WEB
  if (!PROCEDENCIAS_AL_ESTUDIAR.includes(p)) throw new Error(`estudiar un documento no puede producir procedencia ${p}`)
  return p
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const trozo = (s, n = 60) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n)

/** Las etapas que NO tocan la red: las que corre `estudiarTexto` con un texto ya en la mano. */
export const ORDEN_TEXTO = Object.freeze(ORDEN.slice(3))

/**
 * COMPLETA LAS ETAPAS QUE NO SE CORRIERON. Una cadena cortada tiene que verse cortada. PURA.
 *
 * `deLas` acota el universo: quien estudia un texto suelto no adquirió nada, y marcarle ADQUISICIÓN
 * como «omitida» sería reportar una etapa que nunca le tocó correr.
 */
export function completar(pasos, porQue, deLas = ORDEN) {
  const hechos = new Set(pasos.map((p) => p.paso))
  return [...pasos, ...deLas.filter((p) => !hechos.has(p)).map((paso) => ({ paso, resultado: RESULTADO.OMITIDO, porQue }))]
}

/**
 * ADQUIRIR EL DOCUMENTO — de una URL o de un archivo local. Reusa el lector defendido del OS.
 *
 * Devuelve SIEMPRE la misma forma, también al fallar. El texto viene envuelto en la política de
 * contenido externo (REFERENCIA_EXTERNA, sellado, con los intentos de inyección marcados) y acá se
 * desenvuelve SÓLO para citar: el bloque sellado sigue viajando en `bloque`.
 */
export async function adquirir({ url = null, archivo = null, fetchImpl = fetch, stats = null, dir = undefined, refrescar = false, consulta = null } = {}) {
  const conDir = dir === undefined ? {} : { dir }
  if (archivo) {
    const p = await leerPdfLocal(archivo)
    if (!p.ok) return { ok: false, origen: 'archivo', porQue: p.porQue }
    // El título es el NOMBRE del archivo, no su ruta: la ruta entra en la clave del conocimiento y
    // deja claves ilegibles atadas al directorio temporal de quien lo corrió. La ruta completa sigue
    // en la evidencia, que es donde sirve.
    const titulo = path.basename(archivo)
    const env = aplicarPoliticaContenidoExterno({ texto: p.texto, origen: ORIGEN_EXTERNO.DOCUMENTO, titulo, consulta })
    return { ok: true, origen: 'archivo', url: null, titulo, texto: p.texto, hash: `sha256:${p.hash}`, formato: 'pdf', paginas: p.paginas, truncado: p.truncado, caracteres: p.caracteres, inyeccion: env.inyeccion, bloque: env.contenido_externo, deCache: false }
  }
  const esPdf = pareceriaPdf(url)
  const t = esPdf
    ? await traerPdf(url, { fetchImpl, stats, refrescar, consulta, ...conDir })
    : await traer(url, { fetchImpl, stats, refrescar, consulta, ...conDir })
  if (!t.ok) return { ok: false, origen: 'url', url: String(url), porQue: t.porQue }
  return {
    ok: true, origen: 'url', url: t.url ?? String(url), titulo: t.fuente ?? null,
    texto: cuerpoDelBloque(t.contenido_externo, t.evidencia?.bloque_id ?? null),
    hash: t.hash ? `sha256:${t.hash}` : null, formato: t.formato ?? 'html',
    paginas: t.paginas ?? null, truncado: t.truncado ?? false, caracteres: t.caracteres ?? 0,
    publicadoEn: t.publicado_en ?? null, inyeccion: t.inyeccion ?? null,
    bloque: t.contenido_externo, deCache: Boolean(t.deCache),
  }
}

/**
 * LA EXTRACCIÓN FINA, LA QUE SÍ PUEDE PEDIR MODELO.
 *
 * Sin `pedir` NO inventa nada: devuelve `{ ok: false, sinRazonamiento }` con los campos que quedaron
 * sin resolver y por qué. Eso es el escenario E —hay web, no hay razonamiento— y la respuesta
 * honesta es una ficha incompleta declarada, no una ficha completa fabricada.
 *
 * Lo que el modelo devuelve NO se cree: cada campo tiene que traer su cita, y la cita se verifica
 * después contra el texto del documento (`verificarCitas`). Un modelo que inventa una frase que no
 * está en el PDF es el riesgo real de esta etapa, y es el que ese control ataja.
 */
export async function extraerConModelo({ segmentos = [], clase, pedir = null, campos = [], medidor = null } = {}) {
  if (!pedir) return { ok: false, hallados: [], conModelo: false, porQue: 'no hay proveedor de razonamiento: los campos que sólo salen razonando quedan sin resolver', sinRazonamiento: campos }
  if (!campos.length) return { ok: true, hallados: [], conModelo: false, porQue: 'esta clase no tiene campos que necesiten razonamiento', sinRazonamiento: [] }
  const cuerpo = segmentos.map((s) => `[p.${s.pagina ?? '?'}] ${s.texto}`).join('\n').slice(0, 60_000)
  const sistema = [
    'Extraés campos de un documento técnico. NO razonás sobre el contenido: lo localizás.',
    'Devolvés SÓLO un array JSON: [{"campo","valor","textoLiteral","pagina"}].',
    '`textoLiteral` tiene que ser una frase COPIADA TAL CUAL del documento. Si no podés copiarla, ese campo no va.',
    'Un campo que el documento no dice se OMITE. Nunca lo completes con lo que suele decirse.',
  ].join('\n')
  const mensaje = `Clase del documento: ${clase}\nCampos:\n${campos.map((c) => `- ${c.campo}: ${c.que}`).join('\n')}\n\nDOCUMENTO:\n${cuerpo}`
  let respuesta
  try { respuesta = await pedir({ sistema, mensajes: [{ role: 'user', content: mensaje }], funcion: 'conocimiento-extraer', maxTokens: 2048 }) } catch (e) {
    return { ok: false, hallados: [], conModelo: false, porQue: `el proveedor de razonamiento falló: ${String(e?.message ?? e).slice(0, 140)}`, sinRazonamiento: campos }
  }
  medidor?.llamo({ proveedor: 'ia', modelo: respuesta?.modelo ?? null, tokensIn: respuesta?.tokens?.in ?? null, tokensOut: respuesta?.tokens?.out ?? null, usd: respuesta?.usd ?? null, funcion: 'conocimiento-extraer' })
  const crudo = String(respuesta?.texto ?? '').match(/\[[\s\S]*\]/)
  let filas
  try { filas = JSON.parse(crudo?.[0] ?? 'null') } catch { filas = null }
  if (!Array.isArray(filas)) return { ok: false, hallados: [], conModelo: true, porQue: 'el proveedor no devolvió un array JSON interpretable', sinRazonamiento: campos }
  const validos = new Set(campos.map((c) => c.campo))
  const hallados = filas
    .filter((f) => f && validos.has(f.campo) && f.valor && f.textoLiteral)
    .map((f) => ({ campo: String(f.campo), via: VIA_CAMPO.MODELO, valor: String(f.valor).slice(0, 300), textoLiteral: String(f.textoLiteral).slice(0, 600), pagina: Number.isFinite(Number(f.pagina)) ? Number(f.pagina) : null }))
  const resueltos = new Set(hallados.map((h) => h.campo))
  return { ok: true, hallados, conModelo: true, porQue: `${hallados.length} de ${campos.length} campo(s) razonados`, sinRazonamiento: campos.filter((c) => !resueltos.has(c.campo)) }
}

/**
 * LA CITA TIENE QUE ESTAR EN EL DOCUMENTO. PURA.
 *
 * Éste es el control que separa una extracción de una invención. Los campos que salieron por regla
 * lo cumplen por construcción —la cita ES el segmento donde matcheó—; los que salieron del modelo
 * no, y ahí es donde una frase plausible que el PDF nunca dijo entraría a la biblioteca con
 * apariencia de procedencia citable.
 */
export function verificarCitas({ hallados = [], texto = '' } = {}) {
  const doc = norm(texto)
  const buenos = []
  const inventadas = []
  for (const h of hallados) {
    if (h.textoLiteral && doc.includes(norm(h.textoLiteral))) buenos.push(h)
    else inventadas.push({ ...h, porQue: 'la frase citada no aparece en el documento: sin cita verificable no hay procedencia citable' })
  }
  return { buenos, inventadas }
}

/**
 * DE CAMPOS EXTRAÍDOS A CONOCIMIENTOS CANDIDATOS. PURA.
 *
 * La clave lleva el documento adentro (`clase.documento.campo`) por una razón mecánica: el `id` de
 * un conocimiento es `huella({clave, procedencia, version})`, así que dos documentos distintos con
 * la misma clave y la misma procedencia producirían EL MISMO id y el segundo se perdería en
 * silencio dentro de `incorporar()`. Con el documento en la clave, `saber('reglamento.cirsoc-201')`
 * sigue encontrándolos por prefijo y ninguno pisa al otro.
 */
export function armarCandidatos({ hallados = [], clase, doc, procedencia, jurisdiccion = null, cuando = null, version = 1, sospechoso = false } = {}) {
  const slug = trozo(doc?.titulo || doc?.url || doc?.id || 'documento')
  const base = `${String(clase).toLowerCase()}.${slug}`
  const candidatos = []
  const rechazados = []
  for (const h of hallados) {
    try {
      candidatos.push(conocimiento({
        clave: `${base}.${h.campo}`,
        afirmacion: `${h.campo.replace(/_/g, ' ')}: ${h.valor}`,
        procedencia, valor: h.valor, area: String(clase).toLowerCase(),
        jurisdiccion, version, fecha: cuando, estado: ESTADO.CANDIDATO,
        // Un documento que intenta dar órdenes no se descarta —se marca— pero no puede entrar con
        // la misma confianza que uno limpio: lo que trae adentro está bajo sospecha entero.
        confianza: sospechoso ? 'BAJA' : (h.via === VIA_CAMPO.REGLA ? 'MEDIA' : 'BAJA'),
        evidencia: { url: doc?.url ?? null, archivo: doc?.archivo ?? null, titulo: doc?.titulo ?? null, hash: doc?.hash ?? null, pagina: h.pagina, via: h.via, textoLiteral: h.textoLiteral, inyeccionSospechosa: sospechoso },
      }))
    } catch (e) { rechazados.push({ campo: h.campo, porQue: String(e?.message ?? e).slice(0, 200) }) }
  }
  return { candidatos, rechazados }
}

/**
 * DEL TEXTO AL CANDIDATO: las nueve etapas que no tocan la red.
 *
 * Se puede correr sola, con un texto en la mano y sin fuente ni descarga: es lo que hace que el
 * pipeline se pueda probar entero sin internet y sin proveedor de razonamiento.
 */
export async function estudiarTexto({
  texto, doc, clase = null, pedir = null, medidor = null, jurisdiccion = null, cuando = null,
  version = 1, tipoFuente = null, sospechoso = false, bib = null, extraidoPor = 'xsas',
} = {}) {
  const pasos = []
  // Quien llame directo puede no haber pasado por la adquisición: la procedencia se deduce del
  // origen del documento y JAMÁS queda indefinida — un conocimiento sin procedencia no se construye.
  if (!doc.procedencia) doc.procedencia = procedenciaDe(doc.archivo ? 'archivo' : 'url')
  const segmentos = segmentar(texto)
  pasos.push({ paso: PASO.PARSING, resultado: segmentos.length ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: `${segmentos.length} segmento(s) citable(s)${segmentos.some((s) => s.pagina) ? ' con página' : ' sin numeración de página'}`, segmentos: segmentos.length })
  if (!segmentos.length) return { ok: false, pasos: completar(pasos, 'el documento no dejó ningún segmento citable', ORDEN_TEXTO), candidatos: [], huecos: [] }

  const cl = clase ? { clase, porQue: 'la clase la impuso quien llamó', puntaje: null, marcas: {}, pistas: [] } : clasificar({ texto, url: doc?.url ?? null, tipoFuente })
  const clasificable = ![CLASE.AMBIGUO, CLASE.INDETERMINADO].includes(cl.clase)
  pasos.push({ paso: PASO.CLASIFICACION, resultado: clasificable ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: cl.porQue, clase: cl.clase, opciones: cl.opciones ?? [], puntaje: cl.puntaje })
  if (!clasificable) {
    const h = hueco({ clave: `documento.${trozo(doc?.titulo || doc?.url || 'documento')}.clase`, tipo: cl.clase === CLASE.AMBIGUO ? HUECO.AMBIGUO : HUECO.FALTA_DATO, porQue: cl.porQue, opciones: cl.opciones ?? null, quienLoTiene: 'dirección técnica — decir de qué clase es este documento' })
    return { ok: false, pasos: completar(pasos, 'sin clase no se sabe qué campos preguntarle al documento', ORDEN_TEXTO), candidatos: [], huecos: [h], clasificacion: cl }
  }

  const porRegla = extraerConReglas({ segmentos, clase: cl.clase })
  const porModelo = await extraerConModelo({ segmentos, clase: cl.clase, pedir, campos: porRegla.sinRazonamiento, medidor })
  const hallados = [...porRegla.hallados, ...porModelo.hallados]
  pasos.push({
    paso: PASO.EXTRACCION,
    resultado: porModelo.sinRazonamiento.length ? RESULTADO.DEGRADADO : RESULTADO.LOGRO,
    porQue: `${porRegla.porQue} · ${porModelo.porQue}`,
    conModelo: porModelo.conModelo,
    sinRazonamiento: porModelo.sinRazonamiento.map((c) => c.campo),
    sinRegla: porRegla.sinRegla.map((c) => c.campo),
  })
  return { ...(await cerrarCadena({ pasos, hallados, texto, cl, doc, jurisdiccion, cuando, version, sospechoso, bib, extraidoPor })), clasificacion: cl, conModelo: porModelo.conModelo, sinRazonamiento: porModelo.sinRazonamiento }
}

/** Las últimas seis etapas: estructura, evidencia, candidato, validación, tests y activación. */
async function cerrarCadena({ pasos, hallados, texto, cl, doc, jurisdiccion, cuando, version, sospechoso, bib, extraidoPor }) {
  pasos.push({ paso: PASO.ESTRUCTURA, resultado: hallados.length ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: `${hallados.length} campo(s) con valor`, campos: hallados.map((h) => h.campo) })
  const { buenos, inventadas } = verificarCitas({ hallados, texto })
  pasos.push({ paso: PASO.EVIDENCIA, resultado: inventadas.length ? RESULTADO.DEGRADADO : RESULTADO.LOGRO, porQue: `${buenos.length} cita(s) verificada(s) contra el documento${inventadas.length ? ` · ${inventadas.length} descartada(s) por no estar en el texto` : ''}`, descartadas: inventadas.map((i) => i.campo) })
  const { candidatos, rechazados } = armarCandidatos({ hallados: buenos, clase: cl.clase, doc, procedencia: doc.procedencia, jurisdiccion, cuando, version, sospechoso })
  const huecos = [...inventadas, ...rechazados].map((x) => hueco({ clave: `${String(cl.clase).toLowerCase()}.${trozo(doc?.titulo || doc?.url || 'documento')}.${x.campo}`, tipo: HUECO.FALTA_DATO, porQue: x.porQue }))
  pasos.push({ paso: PASO.CANDIDATO, resultado: candidatos.length ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: `${candidatos.length} candidato(s) · ${rechazados.length} rechazado(s) por el constructor · todos nacen ${ESTADO.CANDIDATO} con procedencia ${doc.procedencia}`, rechazados })
  pasos.push({ paso: PASO.VALIDACION, resultado: RESULTADO.PENDIENTE_HUMANO, porQue: `lo extrajo «${extraidoPor}»: la validación la firma otra persona con biblioteca.validar(bib, id, { firmante, extraidoPor })`, extraidoPor, cuantos: candidatos.length })
  const prueba = probarIncorporacion({ bib, doc, candidatos, huecos })
  pasos.push({ paso: PASO.TESTS, resultado: prueba.ok ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: prueba.porQue })
  pasos.push({ paso: PASO.ACTIVACION, resultado: RESULTADO.BLOQUEADO, porQue: 'un candidato no se activa: ningún conocimiento sale de acá en estado VALIDADO, y sin validación firmada no se cotiza con él' })
  return { ok: prueba.ok && candidatos.length > 0, pasos, candidatos, huecos, documento: doc, bibProbada: prueba.bib }
}

/** EL TEST DE LA CADENA: lo que no se puede incorporar tampoco se pudo estudiar. */
function probarIncorporacion({ bib, doc, candidatos, huecos }) {
  const base = bib ?? { version: 0, documentos: [], conocimientos: [], huecos: [] }
  try {
    const nueva = incorporar(base, { documentos: [{ ...doc, etapa: candidatos.length ? ETAPA.ESTUDIADO : ETAPA.CLASIFICADO }], conocimientos: candidatos, huecos })
    const entraron = nueva.conocimientos.length - (base.conocimientos ?? []).length
    if (entraron < candidatos.length) return { ok: false, bib: null, porQue: `${candidatos.length} candidato(s) y sólo ${entraron} entraron: hay ids que colisionan y alguno se perdería en silencio` }
    return { ok: true, bib: nueva, porQue: `los ${candidatos.length} candidato(s) pasan el constructor y la puerta de la biblioteca sin perder ninguno` }
  } catch (e) { return { ok: false, bib: null, porQue: `la biblioteca los rechaza: ${String(e?.message ?? e).slice(0, 200)}` } }
}

/**
 * ESTUDIAR UNA URL O UN ARCHIVO, LA CADENA ENTERA.
 *
 * No escribe nada: devuelve la biblioteca resultante en `bibProbada` y el padrón en `fuentes`, y
 * quien llama decide si persiste. Un pipeline que guarda solo no se puede correr en seco, y en este
 * repo un generador que corrió sin ensayo ya borró una pestaña entera.
 */
export async function estudiar({
  url = null, archivo = null, bib = null, fuentes = [], pedir = null, fetchImpl = fetch,
  stats = null, medidor = null, dir = undefined, cuando = null, extraidoPor = 'xsas',
  refrescar = false, clase = null, jurisdiccion = null,
} = {}) {
  if (!url && !archivo) throw new Error('estudiar necesita una url o un archivo: no hay nada que estudiar')
  const pasos = []
  let padron = fuentes
  const ya = url ? buscarFuente(padron, url) : null
  if (url && !ya) padron = descubrir(padron, { url, jurisdiccion: jurisdiccion ?? 'internacional' }).fuentes
  const f = url ? buscarFuente(padron, url) : null
  pasos.push({ paso: PASO.FUENTE, resultado: f || archivo ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: f ? `«${f.id}» está en el padrón como ${f.estado} (autoridad ${f.autoridad}, tipo ${f.tipo ?? 'sin declarar'})` : 'archivo local: no hay fuente en el padrón que lo respalde, y eso queda dicho', fuenteId: f?.id ?? null, autoridad: f?.autoridad ?? null })

  const a = await adquirir({ url, archivo, fetchImpl, stats, dir, refrescar, consulta: clase })
  pasos.push({ paso: PASO.ADQUISICION, resultado: a.ok ? RESULTADO.LOGRO : RESULTADO.NO_LOGRO, porQue: a.ok ? `${a.caracteres} caracteres · ${a.formato}${a.paginas ? ` · ${a.paginas} página(s)` : ''}${a.truncado ? ' · TRUNCADO' : ''}${a.deCache ? ' · de caché' : ''}` : a.porQue, formato: a.formato ?? null, caracteres: a.caracteres ?? 0, inyeccion: a.inyeccion?.sospechoso ?? false })
  if (f) padron = anotarUso(padron, f.id, { sirvio: a.ok, que: a.ok ? `estudio de ${url}` : null, cuando })
  if (!a.ok) return { ok: false, pasos: completar(pasos, `no se pudo adquirir el documento: ${a.porQue}`), candidatos: [], huecos: [], fuentes: padron }

  return await tramoVersionado({ a, f, padron, pasos, bib, pedir, medidor, cuando, extraidoPor, clase, jurisdiccion, refrescar, archivo })
}

/** Hash, versionado y delegación al tramo que no toca la red. Separado para que cada tramo se lea. */
async function tramoVersionado({ a, f, padron, pasos, bib, pedir, medidor, cuando, extraidoPor, clase, jurisdiccion, refrescar, archivo }) {
  const base = bib ?? { version: 0, documentos: [], conocimientos: [], huecos: [] }
  const cambio = cambioDeVersion(base, { fuenteId: f?.id ?? null, hash: a.hash })
  const previas = (base.documentos ?? []).filter((d) => d.fuenteId === (f?.id ?? null)).length
  const estudiado = a.hash ? yaEstudiado(base, a.hash) : false
  pasos.push({ paso: PASO.VERSIONADO, resultado: estudiado && !refrescar ? RESULTADO.YA_ESTUDIADO : RESULTADO.LOGRO, porQue: `${a.hash ?? 'sin hash'} · ${cambio.porQue}`, hash: a.hash, cambioDeVersion: cambio.cambio, versionConocimiento: previas + 1 })
  if (estudiado && !refrescar) {
    return { ok: true, pasos: completar(pasos, 'este contenido ya se estudió: repetirlo no agrega nada y cuesta lo mismo'), candidatos: [], huecos: [], fuentes: padron, yaEstudiado: true }
  }
  const doc = documento({
    fuenteId: f?.id ?? null, url: a.url, titulo: a.titulo ?? a.url ?? archivo, hash: a.hash,
    formato: a.formato, paginas: a.paginas, obtenidoEn: cuando, etapa: ETAPA.PARSEADO,
    porQue: 'estudiado por el pipeline de conocimiento; su conocimiento nace CANDIDATO',
  })
  doc.procedencia = procedenciaDe(a.origen)
  doc.archivo = archivo ?? null
  const r = await estudiarTexto({
    texto: a.texto, doc, clase, pedir, medidor, cuando, extraidoPor, bib: base,
    jurisdiccion: jurisdiccion ?? f?.jurisdiccion ?? null, version: previas + 1,
    tipoFuente: f?.tipo ?? null, sospechoso: Boolean(a.inyeccion?.sospechoso),
  })
  return { ...r, pasos: [...pasos, ...r.pasos], fuentes: padron }
}
