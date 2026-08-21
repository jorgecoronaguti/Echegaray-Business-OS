// LA DOCUMENTACIÓN TÉCNICA DE UNA OBRA, LEÍDA COMO LO QUE ES Y NO COMO LO QUE PARECE.
//
// ═══ QUÉ PROBLEMA CIERRA, MEDIDO EL 21/08/2026 ═══
//
// La skill `ingenieria-civil-construccion` sabe QUÉ preguntar sobre un plano y no sabe ENCONTRAR
// ninguno: es prosa. Mientras tanto `drive_index` tiene 3.593 filas y `obra_canonica.drive_carpeta_id`
// ya resuelve 11 de 17 obras a una ruta real del data room. La pregunta del jefe de obra —"¿qué
// documentación hay de esto y qué me falta?"— era un SELECT por prefijo de ruta que nadie escribió.
//
// Por eso acá NO hay un indexador nuevo ni un buscador nuevo. El índice es `drive_index` y el
// buscador es `drive-busqueda/`. Esto es la capa que faltaba: qué ES cada archivo, si el OS puede
// LEERLO, cuál está VIGENTE, y con qué se lo CITA.
//
// ═══ LA REGLA DURA: UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ» ═══
//
// En la carpeta de San Francisco hay cinco `.dwg` y tres `.bak`. Un asistente que los lista y después
// contesta sobre "la arquitectura de los galpones" es peligroso en obra: nadie abrió ese archivo.
// Por eso `legibilidadDe` se evalúa ANTES de leer y viaja pegada al documento: la limitación se
// declara con nombre propio, no se descubre cuando ya se contestó de más. Es la misma disciplina que
// `readPdfText` ya aplica con `scanned` — acá se generaliza a todo formato.
//
// ═══ POR QUÉ LA CLASIFICACIÓN ES CASCADA Y LO DUDOSO QUEDA `desconocido` ═══
//
// Los nombres reales del data room no son un esquema: conviven "Plano estructuras E1.pdf" (el nombre
// lo dice todo), "Cerramiento Cancha de paddle y mamposteria frente.xlsm" (el nombre no dice nada
// pero cuelga de `ADICIONALES/`) y "GALVARINI.pdf" (no dice nada y no cuelga de nada). Tres señales
// de fuerza distinta, y la tercera no existe. Forzar un tipo sobre el tercero es exactamente la
// alucinación que esta capa tiene que impedir: `desconocido` es una respuesta correcta.

import { plano, sinExtension, tokenizar } from './drive-busqueda/normalizar.mjs'

/** Los tipos documentales que el asistente distingue. No es una taxonomía teórica: cada uno
 *  aparece con estos nombres en el data room real y cada uno contesta una pregunta distinta
 *  de obra. `desconocido` no es una falla del clasificador — es su honestidad. */
export const TIPO_DOC = Object.freeze({
  planoArquitectura: 'plano_arquitectura',
  planoEstructura: 'plano_estructura',
  planoInstalacion: 'plano_instalacion',
  planoGeneral: 'plano_general',
  computo: 'computo',
  memoria: 'memoria_descriptiva',
  especificacion: 'especificacion_o_pliego',
  presupuesto: 'presupuesto_o_cotizacion',
  contrato: 'contrato',
  certificado: 'certificado_o_recibo',
  adicional: 'adicional',
  relevamiento: 'relevamiento',
  seguridad: 'plan_de_seguridad',
  desconocido: 'desconocido',
})

/** Con qué fuerza se clasificó. Viaja con el documento porque no es lo mismo "el nombre dice
 *  PLANO" que "cuelga de una carpeta que se llama PLANOS": la segunda se equivoca más. */
export const SENAL = Object.freeze({
  nombre: 'nombre del archivo',
  carpeta: 'carpeta que lo contiene',
  ninguna: 'ninguna — el nombre y la ruta no declaran qué es',
})

/** Cómo puede el OS leer el CONTENIDO de un archivo. `no_legible` no es un error: es el dato
 *  que evita que el asistente conteste sobre algo que nunca abrió. */
export const LECTURA = Object.freeze({
  texto: 'texto',              // PDF con capa de texto, Doc, Word
  planilla: 'planilla',        // Sheet nativo, xlsx, xlsm, xls
  escaneado: 'escaneado',      // PDF sin texto: haría falta visión/OCR
  noLegible: 'no_legible',     // DWG, BAK, binarios de CAD
  imagen: 'imagen',            // PNG/JPG: se ve, no se lee
})

/** Formatos de CAD y sus respaldos. Se nombran uno por uno a propósito: el alcance de este
 *  trabajo excluye CAD y BIM, y un archivo de CAD tiene que salir declarado como no legible,
 *  nunca omitido en silencio (omitido, el jefe de obra cree que no existe el plano). */
export const EXTENSIONES_CAD = Object.freeze(['dwg', 'dxf', 'bak', 'rvt', 'ifc', 'skp', 'dwf'])

/** La documentación que una obra de Echegaray debería tener para poder ejecutarse con control.
 *  No es una norma: es el mínimo que el propio data room muestra en las obras bien armadas
 *  (San Francisco y Quattropani lo cumplen casi entero). Se usa para decir QUÉ FALTA, y lo que
 *  falta es un pedido al cliente o al proyectista, no un defecto del OS. */
export const EXIGIDOS_POR_OBRA = Object.freeze([
  TIPO_DOC.planoArquitectura,
  TIPO_DOC.planoEstructura,
  TIPO_DOC.computo,
  TIPO_DOC.presupuesto,
  TIPO_DOC.contrato,
])

const extensionDe = (nombre) => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(nombre || '').trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * ¿PUEDE EL OS LEER ESTE ARCHIVO?
 *
 * Se decide por extensión y por mime, en ese orden, porque el data room tiene `.pDF` en mayúscula
 * y `.xls.pdf` (un Excel exportado): la extensión final manda sobre el mime declarado, que en
 * Drive a veces es `application/octet-stream` para todo lo que subió alguien desde el escritorio.
 *
 * `escaneado` NO se puede decidir acá: sólo se sabe abriendo el PDF. Por eso un PDF sale `texto`
 * como hipótesis y el corredor la corrige con lo que devuelva `readPdfText().scanned`.
 */
export function legibilidadDe({ name = '', mime_type = '' } = {}) {
  const ext = extensionDe(name)
  const mime = String(mime_type || '').toLowerCase()
  if (EXTENSIONES_CAD.includes(ext)) {
    return { puede: false, forma: LECTURA.noLegible, motivo: `formato ${ext.toUpperCase()} (CAD): el OS sabe que el archivo existe, no lee su contenido` }
  }
  if (ext === 'pdf' || mime.includes('pdf')) {
    return { puede: true, forma: LECTURA.texto, motivo: 'PDF: se extrae el texto localmente; si viene escaneado, se declara al leerlo' }
  }
  if (['xlsx', 'xlsm', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return { puede: true, forma: LECTURA.planilla, motivo: 'planilla: se leen filas y hojas' }
  }
  if (['doc', 'docx', 'odt', 'txt'].includes(ext) || mime.includes('document') || mime.includes('word')) {
    return { puede: true, forma: LECTURA.texto, motivo: 'documento de texto: se exporta a texto plano' }
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext) || mime.startsWith('image/')) {
    return { puede: false, forma: LECTURA.imagen, motivo: 'imagen: el OS no interpreta su contenido sin visión' }
  }
  return { puede: false, forma: LECTURA.noLegible, motivo: `extensión ${ext || 'sin extensión'}: no hay lector para este formato` }
}

/** Carpetas que organizan el ARCHIVO, no describen el DOCUMENTO. Sin esta lista, todo lo que
 *  cuelga de "PRESUPUESTOS - CLIENTES" —o sea, el data room técnico entero— sería un presupuesto,
 *  y "GALVARINI.pdf", que no declara nada, saldría clasificado con confianza media. Lo correcto
 *  para ese archivo es `desconocido`. Cuando el que llama pasa `carpetaObra`, la cascada además
 *  sólo mira de la carpeta de la obra para abajo, que es el criterio general del que esta lista
 *  es apenas el piso.  */
const CARPETAS_CONTENEDOR = new Set([
  'administracion', 'presupuestos clientes', 'presupuestos', 'clientes', 'obras',
  'archivo fiscal', 'libro sueldos', 'drive', 'documentacion', 'documentos',
])

/** Cada regla es (patrón sobre el texto normalizado → tipo). El ORDEN importa: lo más
 *  específico primero, porque "PLANO SANITARIO" es instalación y no plano general, y
 *  "Planilla de computo - ... ESTRUCTURAS METALICAS" es un cómputo y no un plano de estructura. */
const REGLAS = Object.freeze([
  [/computo|comp?uto de materiales|planilla de computo|metrado/, TIPO_DOC.computo],
  [/memoria descriptiva|memoria tecnica|memoria de calculo/, TIPO_DOC.memoria],
  [/pliego|especificacion|condiciones tecnicas|ssma/, TIPO_DOC.especificacion],
  [/plan de seguridad|higiene y seguridad|programa de seguridad/, TIPO_DOC.seguridad],
  [/relevamiento|topografic/, TIPO_DOC.relevamiento],
  [/contrato|locacion de obra/, TIPO_DOC.contrato],
  [/certificad|recibo|acta de medicion/, TIPO_DOC.certificado],
  [/adicional/, TIPO_DOC.adicional],
  [/sanitari|cloaca|electric|pluvial|gas|incendio|instalacion/, TIPO_DOC.planoInstalacion],
  [/estructura/, TIPO_DOC.planoEstructura],
  [/arquitectura/, TIPO_DOC.planoArquitectura],
  [/presupuesto|cotizacion/, TIPO_DOC.presupuesto],
  [/plano|legajo de planos|planta|corte|croquis/, TIPO_DOC.planoGeneral],
])

/** Un plano de instalación/estructura/arquitectura sólo lo es si además hay señal de que es
 *  un PLANO o un legajo. Sin eso, "Instalacion Electrica" es el nombre de una obra, no de un
 *  plano — y en San Francisco es exactamente eso: una carpeta de obra. */
const ES_GRAFICO = /plano|legajo|planta|corte|croquis|detalle|\bpl\b|\ba1\b|\be1\b|\be2\b/

const aplicar = (texto) => {
  for (const [re, tipo] of REGLAS) {
    if (!re.test(texto)) continue
    const esPlano = tipo === TIPO_DOC.planoInstalacion || tipo === TIPO_DOC.planoEstructura || tipo === TIPO_DOC.planoArquitectura
    if (esPlano && !ES_GRAFICO.test(texto)) continue
    return tipo
  }
  return null
}

/**
 * QUÉ ES ESTE DOCUMENTO — cascada de dos señales, y la tercera es no contestar.
 *
 *   (a) NOMBRE   — "Plano estructuras E1.pdf" lo dice él mismo. Es lo más fuerte que hay.
 *   (b) CARPETA  — "ADICIONALES/Cloacas - JS.pdf": el nombre no alcanza, la ruta sí.
 *   (c) NINGUNA  — "GALVARINI.pdf" cuelga de la raíz del cliente y no declara nada. `desconocido`.
 *
 * La (b) se evalúa sobre los segmentos de ruta EXCEPTO el nombre del archivo, y de adentro hacia
 * afuera: la carpeta más cercana es la que manda. Cruzar todo el path junto haría que cualquier
 * archivo colgado de "PRESUPUESTOS - CLIENTES" fuera un presupuesto, que es el 100% del data room.
 */
export function clasificarDocumento({ name = '', path = '' } = {}, { carpetaObra = '' } = {}) {
  const porNombre = aplicar(plano(sinExtension(name)))
  if (porNombre) return { tipo: porNombre, senal: SENAL.nombre, confianza: 'alta' }

  const ruta = String(path || '')
  const base = String(carpetaObra || '')
  const dentro = base && ruta.startsWith(base) ? ruta.slice(base.length) : ruta
  const segmentos = dentro.split('/').filter(Boolean)
  const carpetas = segmentos.slice(0, -1).reverse().filter((c) => !CARPETAS_CONTENEDOR.has(plano(c)))
  for (const carpeta of carpetas) {
    const t = aplicar(plano(carpeta))
    if (t) return { tipo: t, senal: SENAL.carpeta, confianza: 'media', carpeta }
  }
  return { tipo: TIPO_DOC.desconocido, senal: SENAL.ninguna, confianza: 'ninguna' }
}

/** Rev A/B/C… y v2/V.2. Devuelve el orden como número para poder comparar, y `null` cuando el
 *  nombre no declara revisión — que NO es "revisión 0": es no saber. */
export function revisionDe(name = '') {
  const limpio = plano(sinExtension(name))
  const letra = /\brev\.?\s*([a-z])\b/.exec(limpio)
  if (letra) return { etiqueta: `Rev ${letra[1].toUpperCase()}`, orden: letra[1].charCodeAt(0) - 96 }
  const numero = /\bv\.?\s*(\d{1,2})\b/.exec(limpio)
  if (numero) return { etiqueta: `v${numero[1]}`, orden: Number(numero[1]) }
  return null
}

/** Carpetas cuyo NOMBRE declara que lo de adentro ya no rige. Es el criterio del propio dueño,
 *  escrito por él en el data room: "ARCHIVOS VIEJOS", "Archivos viejos", "Viejo". */
const CARPETA_SUPERADA = /(^|\/)\s*(archivos?\s+viejos?|viejos?|obsoleto|descartad|no\s+usar)\s*(\/|$)/i

/** ¿La RUTA declara que este documento ya no rige? Separado de la revisión porque son dos
 *  hechos distintos: un Rev B dentro de "PROYECTO FINAL" rige, y un Rev C dentro de
 *  "ARCHIVOS VIEJOS" no. Cuando chocan, gana la carpeta: la movió una persona a propósito. */
export const rutaDeclaraSuperado = (path = '') => CARPETA_SUPERADA.test(String(path))

/**
 * QUÉ REVISIÓN RIGE. Agrupa por "familia" (el nombre sin la marca de revisión) y dentro de cada
 * familia elige la vigente.
 *
 * El desempate NO es por fecha de modificación: en Drive `modifiedTime` cambia cuando alguien
 * abre y guarda un archivo viejo, y ya hay evidencia de eso en el data room (una "Rev C 29:5:2025"
 * con modified_time del 20/08/2025). Manda la revisión declarada en el nombre; la fecha sólo
 * desempata cuando ninguno de los dos declara revisión.
 *
 * Cuando dos archivos de la misma familia declaran la MISMA revisión, no se elige: se declara
 * `ambigua`. Elegir a ojo cuál de dos "Rev C" rige es poner al jefe de obra a construir contra el
 * plano equivocado, y nadie se enteraría nunca.
 */
export function agruparRevisiones(documentos = []) {
  const familias = new Map()
  for (const d of documentos) {
    const rev = revisionDe(d.name)
    // El "(1)" se saca ANTES de aplanar: `plano()` convierte los paréntesis en espacios y el
    // dígito sobreviviría como una palabra más, partiendo la familia en dos. Y se saca sólo entre
    // paréntesis —el sufijo que pone Drive al duplicar— porque "PLANO 1" y "PLANO 2" son dos
    // planos distintos, no dos versiones del mismo.
    const base = plano(sinExtension(d.name).replace(/\(\d+\)/g, ''))
      .replace(/\brev\.?\s*[a-z]\b/g, '')
      .replace(/\bv\.?\s*\d{1,2}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const clave = base || plano(d.name)
    if (!familias.has(clave)) familias.set(clave, { familia: clave, versiones: [] })
    familias.get(clave).versiones.push({ ...d, revision: rev, superadaPorRuta: rutaDeclaraSuperado(d.path) })
  }

  const salida = []
  for (const f of familias.values()) {
    const candidatas = f.versiones.filter((v) => !v.superadaPorRuta)
    const universo = candidatas.length ? candidatas : f.versiones
    const conRev = universo.filter((v) => v.revision)
    let vigente = null
    let ambigua = null
    if (conRev.length) {
      const tope = Math.max(...conRev.map((v) => v.revision.orden))
      const empatadas = conRev.filter((v) => v.revision.orden === tope)
      if (empatadas.length > 1) ambigua = `${empatadas.length} archivos declaran ${empatadas[0].revision.etiqueta} — no se elige uno a ojo`
      vigente = empatadas[0]
    } else {
      const ordenadas = [...universo].sort((a, b) => String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
      vigente = ordenadas[0] ?? null
    }
    // MISMO DOCUMENTO EN OTRO FORMATO ≠ VERSIÓN SUPERADA. Medido en Quattropani el 21/08/2026:
    // "Cotizacion Final.pdf" y "Cotizacion Final.xlsm" son el mismo documento, uno exportado del
    // otro — y el informe los daba como versión vigente y versión superada. Marcar como superada
    // la PLANILLA es lo peor posible: la planilla es la fuente y el PDF es la foto. Se separan.
    const extVigente = extensionDe(vigente?.name ?? '')
    const otras = f.versiones.filter((v) => v !== vigente)
    const formatos = otras.filter((v) => !v.superadaPorRuta && !v.revision && !vigente?.revision && extensionDe(v.name) !== extVigente)
    salida.push({
      familia: f.familia,
      vigente,
      superadas: otras.filter((v) => !formatos.includes(v)),
      formatos,
      ambigua,
      criterio: conRev.length ? 'revisión declarada en el nombre' : 'fecha de modificación (ningún archivo declara revisión)',
    })
  }
  return salida
}

/**
 * LA CITA. Sin esto no sale ninguna respuesta: documento + página/hoja cuando exista + origen.
 *
 * Falla CERRADO. Un documento sin `drive_file_id` no se puede citar porque no se puede volver a
 * abrir, y una afirmación técnica que no se puede volver a abrir no es verificable por un tercero.
 * Devuelve `{ ok:false }` en vez de una cita a medias: el que llama decide si igual contesta, pero
 * no puede decir que citó.
 */
export function citarDocumento(doc = {}, { pagina = null, hoja = null } = {}) {
  if (!doc.name) return { ok: false, motivo: 'el documento no tiene nombre — no hay qué citar' }
  if (!doc.drive_file_id) return { ok: false, motivo: `"${doc.name}" no tiene origen en Drive — no se puede volver a abrir, no se cita` }
  const donde = pagina != null ? `p. ${pagina}` : hoja != null ? `hoja "${hoja}"` : null
  const partes = [doc.name]
  if (donde) partes.push(donde)
  if (doc.path) partes.push(doc.path)
  partes.push(`Drive ${doc.drive_file_id}`)
  return {
    ok: true,
    texto: partes.join(' · '),
    documento: doc.name,
    ruta: doc.path ?? null,
    pagina: pagina ?? null,
    hoja: hoja ?? null,
    origen: `https://drive.google.com/file/d/${doc.drive_file_id}/view`,
    modificado: doc.modified_time ?? null,
  }
}

/**
 * QUÉ DOCUMENTACIÓN HAY Y QUÉ FALTA.
 *
 * `faltantes` es lo que no aparece con NINGUNA señal. Un tipo que aparece sólo con señal de
 * carpeta se informa aparte (`solo_por_carpeta`): "hay algo que parece un cómputo porque cuelga
 * de una carpeta que se llama así" no es lo mismo que tener el cómputo, y la diferencia es un
 * pedido al proyectista.
 */
export function coberturaDocumental(documentos = [], { exigidos = EXIGIDOS_POR_OBRA, carpetaObra = '' } = {}) {
  const porTipo = new Map()
  for (const d of documentos) {
    const c = d.clasificacion ?? clasificarDocumento(d, { carpetaObra })
    if (!porTipo.has(c.tipo)) porTipo.set(c.tipo, [])
    porTipo.get(c.tipo).push({ ...d, clasificacion: c })
  }
  const presentes = []
  const soloPorCarpeta = []
  const faltantes = []
  for (const tipo of exigidos) {
    const encontrados = porTipo.get(tipo) ?? []
    if (!encontrados.length) { faltantes.push(tipo); continue }
    const fuertes = encontrados.filter((d) => d.clasificacion.senal === SENAL.nombre)
    if (fuertes.length) presentes.push({ tipo, cantidad: encontrados.length, ejemplo: fuertes[0].name })
    else soloPorCarpeta.push({ tipo, cantidad: encontrados.length, ejemplo: encontrados[0].name })
  }
  return {
    presentes,
    solo_por_carpeta: soloPorCarpeta,
    faltantes,
    sin_clasificar: (porTipo.get(TIPO_DOC.desconocido) ?? []).map((d) => d.name),
    no_legibles: documentos.filter((d) => !legibilidadDe(d).puede).map((d) => ({ name: d.name, motivo: legibilidadDe(d).motivo })),
  }
}

export { tokenizar }
