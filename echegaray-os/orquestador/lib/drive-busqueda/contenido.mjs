// BUSCAR POR LO QUE EL PAPEL DICE, NO POR CÓMO SE LLAMA. LA ETAPA QUE FALTABA.
//
// ═══ EL AGUJERO QUE CIERRA ═══
//
// Las cinco etapas de `buscar.mjs` son excelentes y todas miran lo mismo: el NOMBRE y la RUTA.
// «pasame el VEP de octubre» funciona. «¿en qué archivo está el CUIT 20-11793242-8?» no tiene
// respuesta posible — el dato está adentro del PDF y hasta hoy nadie lo había abierto.
//
// El Drive tiene 3.042 PDF cuyos nombres son «2024-08 TK.pdf» y «11-2024.pdf». Buscar ahí por
// nombre es buscar por un código que sólo entiende quien lo guardó.
//
// ═══ POR QUÉ ES LA ÚLTIMA ETAPA Y NO LA PRIMERA ═══
//
// Porque cuando el nombre alcanza, el nombre es mejor. «Contrato Quattropani» encuentra el contrato
// de Quattropani por su nombre con precisión perfecta; buscarlo por contenido devolvería además
// cada acta, cada certificado y cada correo que menciona Quattropani. La búsqueda por contenido no
// reemplaza a la de nombre: contesta las preguntas que la de nombre no puede.
//
// ═══ CERO MODELO, TODAVÍA ═══
//
// Esto usa el índice de texto de Postgres en español (`to_tsvector('spanish', …)`), que es
// determinístico, instantáneo y gratis. La búsqueda semántica —el mismo fragmento, con embeddings—
// se suma encima cuando exista una pregunta que ésta no conteste. Poner un modelo antes de haber
// medido que el índice de palabras no alcanza sería exactamente lo que este proyecto viene
// desmintiendo con datos.

/** Un CUIT/CUIL escrito de cualquier forma dentro de una pregunta. */
const RE_CUIT = /\b(\d{2})[-\s.]?(\d{8})[-\s.]?(\d)\b/
/** Un comprobante fiscal: punto de venta y número. */
const RE_COMPROBANTE = /\b(\d{4,5})\s*-\s*(\d{7,8})\b/

/** Cuántos fragmentos se traen antes de agrupar por documento. Un documento con quince fragmentos
 *  que coinciden no debe tapar a los otros catorce documentos que también coinciden. */
const TOPE_FRAGMENTOS = 60

export const SQL_CONTENIDO = `
  select f.drive_file_id, f.pagina, f.orden, f.texto, f.bbox,
         ts_rank(to_tsvector('spanish', f.texto), q) as puntaje,
         ts_headline('spanish', f.texto, q,
                     'MaxWords=28, MinWords=10, ShortWord=2, MaxFragments=1, StartSel=«, StopSel=»') as extracto,
         l.nombre, l.path, l.tipo, l.sensibilidad, l.campos
    from public.documento_fragmento f
    join public.documento_leido l using (drive_file_id)
    cross join plainto_tsquery('spanish', $1) q
   where to_tsvector('spanish', f.texto) @@ q
   order by puntaje desc
   limit $2`

/**
 * Busca en el CONTENIDO de los documentos ya leídos.
 *
 * @param {(sql:string, params:Array)=>Promise<{rows:Array}>} ejecutar
 * @param {string} texto lo que escribió la persona
 * @param {{limite?:number, sensibilidadMaxima?:string}} opts
 * @returns {Promise<{documentos:Array, fragmentos:number, ms:number}>}
 */
export async function buscarEnContenido(ejecutar, texto, { limite = 6, sensibilidadMaxima = null } = {}) {
  const t0 = Date.now()
  const q = String(texto ?? '').trim()
  if (!q) return { documentos: [], fragmentos: 0, ms: 0 }

  // ── 1. UN IDENTIFICADOR NO SE BUSCA POR TEXTO LIBRE ──
  //
  // «20-11793242-8» devolvía CERO por el índice de palabras: el tokenizador español parte el CUIT
  // por los guiones y no encuentra nada, mientras el documento lo tiene escrito «20117932428».
  // Un identificador tiene una respuesta EXACTA o no tiene ninguna, y el motor documental ya lo
  // dejó extraído en `campos`. Buscarlo ahí es determinístico, instantáneo y no se equivoca.
  const porId = await buscarPorIdentificador(ejecutar, q)
  if (porId.length) {
    const docs = sensibilidadMaxima ? porId.filter((d) => permitido(d.sensibilidad, sensibilidadMaxima)) : porId
    return { documentos: docs.slice(0, limite), fragmentos: docs.length, ms: Date.now() - t0, via: 'identificador' }
  }

  // ── 2. TODAS LAS PALABRAS, Y SI NO, AL MENOS UNA ──
  //
  // `plainto_tsquery` exige TODAS: «aportes seguridad social octubre 2023» daba cero porque el
  // acuse dice «Período: 2023-10» y nunca la palabra «octubre». Exigir todo es correcto como primer
  // intento —es la respuesta precisa— pero devolver nada cuando cuatro de cinco palabras están es
  // peor que ofrecer lo que hay. Se prueba estricto y se afloja sólo si no hubo nada.
  let r = await ejecutar(SQL_CONTENIDO, [q, TOPE_FRAGMENTOS])
  let via = 'todas-las-palabras'
  if (!r.rows.length) {
    r = await ejecutar(SQL_CONTENIDO_LAXO, [q, TOPE_FRAGMENTOS])
    via = 'alguna-palabra'
  }
  const filas = sensibilidadMaxima ? r.rows.filter((f) => permitido(f.sensibilidad, sensibilidadMaxima)) : r.rows

  // UN RESULTADO ES UN DOCUMENTO, NO UN FRAGMENTO. Devolver quince pedazos del mismo libro de
  // sueldos como quince respuestas distintas no ayuda a nadie: se agrupan, se suman los puntajes y
  // se conservan los tres mejores pasajes como CITA — con su página, que es lo que permite ir a
  // verlo en vez de creerle al OS.
  const porDoc = new Map()
  for (const f of filas) {
    const d = porDoc.get(f.drive_file_id) ?? {
      driveFileId: f.drive_file_id, nombre: f.nombre, path: f.path, tipo: f.tipo,
      sensibilidad: f.sensibilidad, campos: f.campos ?? {}, puntaje: 0, pasajes: [],
    }
    d.puntaje += Number(f.puntaje) || 0
    if (d.pasajes.length < 3) d.pasajes.push({ pagina: f.pagina, extracto: f.extracto, bbox: f.bbox })
    porDoc.set(f.drive_file_id, d)
  }

  const documentos = [...porDoc.values()]
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
    .map((d) => ({ ...d, puntaje: Number(d.puntaje.toFixed(4)) }))

  return { documentos, fragmentos: filas.length, ms: Date.now() - t0, via }
}

/** La misma consulta pero con OR entre las palabras. Es el segundo intento, nunca el primero: con
 *  OR, «flujo de caja» trae todo lo que diga «de». Por eso el orden importa y el ranking decide. */
export const SQL_CONTENIDO_LAXO = SQL_CONTENIDO.replace(/plainto_tsquery/g, 'websearch_to_tsquery')
  .replace("cross join websearch_to_tsquery('spanish', $1) q",
           "cross join to_tsquery('spanish', array_to_string(regexp_split_to_array(regexp_replace(lower($1), '[^a-záéíóúñ0-9 ]', ' ', 'g'), '\\s+'), ' | ')) q")

/** Los documentos cuyo CUIT o número de comprobante ES el que se preguntó. Exacto, no parecido. */
export async function buscarPorIdentificador(ejecutar, texto) {
  const cuit = String(texto).match(RE_CUIT)
  const comp = String(texto).match(RE_COMPROBANTE)
  // El comprobante se prueba primero: «0001-00001181» también calza como CUIT de once dígitos si
  // se le sacan los guiones, y confundirlos devolvería el documento equivocado.
  if (comp) {
    const r = await ejecutar(SQL_POR_CAMPO, ['comprobante', `${comp[1]}-${comp[2]}`])
    if (r.rows.length) return r.rows.map(aDocumento)
  }
  if (cuit) {
    const r = await ejecutar(SQL_POR_CAMPO, ['cuit', `${cuit[1]}${cuit[2]}${cuit[3]}`])
    return r.rows.map(aDocumento)
  }
  return []
}

export const SQL_POR_CAMPO = `
  select l.drive_file_id, l.nombre, l.path, l.tipo, l.sensibilidad, l.campos, l.evidencia,
         (select f.texto from public.documento_fragmento f
           where f.drive_file_id = l.drive_file_id order by f.pagina, f.orden limit 1) as extracto
    from public.documento_leido l
   where l.campos->>$1 = $2
   order by l.leido_en desc
   limit 20`

function aDocumento(f) {
  // La página sale de la EVIDENCIA del campo: el motor documental guardó dónde leyó ese CUIT, así
  // que la respuesta puede decir la página exacta en vez de «está en algún lado de este PDF».
  const ev = f.evidencia ?? {}
  const pagina = ev.cuit?.pagina ?? ev.comprobante?.pagina ?? 1
  return {
    driveFileId: f.drive_file_id, nombre: f.nombre, path: f.path, tipo: f.tipo,
    sensibilidad: f.sensibilidad, campos: f.campos ?? {}, puntaje: 1,
    pasajes: [{ pagina, extracto: String(f.extracto ?? '').slice(0, 200), bbox: null }],
  }
}

const ORDEN = ['publico', 'interno', 'confidencial', 'credenciales']
/** Un documento sólo se devuelve si su sensibilidad no supera el techo del que pregunta. Es la
 *  misma escala que usa `lib/ml/politica.mjs`: una sola definición de «cuán delicado es esto». */
export function permitido(sensibilidad, techo) {
  return ORDEN.indexOf(String(sensibilidad ?? 'confidencial')) <= ORDEN.indexOf(String(techo))
}
