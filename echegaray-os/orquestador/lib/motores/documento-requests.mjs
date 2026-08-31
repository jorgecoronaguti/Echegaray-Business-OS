// DE LA ESTRUCTURA A LAS PETICIONES DE LA DOCS API. TODO PURO — ni una llamada, ni una credencial.
//
// ═══ POR QUÉ EL TEXTO VA DE UNA SOLA VEZ ═══
//
// La Docs API trabaja con ÍNDICES de caracteres, y cada inserción corre todos los que vienen
// después. Armar el documento con una petición por párrafo obliga a recalcular offsets contra un
// documento que se mueve, y ese cálculo es exactamente donde un informe termina con el título de
// una sección adentro del párrafo de la anterior.
//
// Acá el cuerpo se arma como UN string, y los índices salen de ese string, que no se mueve. La
// única petición que corre índices es `insertText`, y va primera y sola.
//
// ═══ LAS TABLAS VAN AL REVÉS, Y NO ES UN CAPRICHO ═══
//
// `insertTable` sí corre los índices. Insertando de la ÚLTIMA a la PRIMERA, cada inserción sólo
// mueve lo que está después de ella —que ya está insertado— y los offsets de las que faltan siguen
// valiendo. Lo mismo para llenar las celdas: de la última a la primera.

/** Renglón reservado para una tabla: un párrafo vacío donde después entra la tabla. */
const RESERVA = ''

/** Los pares clave/valor se escriben «Clave: valor» con la clave en negrita. La forma la decide
 *  el motor: el que pide manda los datos, no la tipografía. */
const lineaDato = (par) => `${par.clave}: ${par.valor}`

/**
 * EL CUERPO COMO UN SOLO STRING, con los offsets de todo lo que después hay que estilar. PURA.
 * @returns {{texto:string, encabezados:Array, listas:Array, negritas:Array, tablas:Array}}
 */
export function construirCuerpo(doc) {
  const plan = { texto: '', encabezados: [], listas: [], negritas: [], tablas: [] }
  const linea = (t) => { const desde = plan.texto.length; plan.texto += `${t}\n`; return { desde, hasta: plan.texto.length } }

  const r = linea(doc.titulo)
  plan.encabezados.push({ ...r, estilo: 'TITLE' })
  if (doc.subtitulo) plan.encabezados.push({ ...linea(doc.subtitulo), estilo: 'SUBTITLE' })

  for (const s of doc.secciones) {
    plan.encabezados.push({ ...linea(s.titulo), estilo: `HEADING_${s.nivel}` })
    for (const b of s.bloques) bloqueAlTexto(plan, b, linea)
  }
  // Un párrafo final vacío: `insertTable` no puede ir sobre el último salto del cuerpo, y sin este
  // renglón una tabla al final del documento no tiene dónde entrar.
  linea(RESERVA)
  return plan
}

/**
 * SÓLO BLOQUES, sin título ni secciones. PURA. Es lo que se inserta cuando se actualiza UNA
 * sección: el título ya está en el documento y no se vuelve a escribir.
 */
export function construirBloques(bloques) {
  const plan = { texto: '', encabezados: [], listas: [], negritas: [], tablas: [] }
  const linea = (t) => { const desde = plan.texto.length; plan.texto += `${t}\n`; return { desde, hasta: plan.texto.length } }
  for (const b of bloques ?? []) bloqueAlTexto(plan, b, linea)
  if (plan.tablas.length) linea(RESERVA) // una tabla al final necesita un párrafo después
  return plan
}

/** El texto plano que esos bloques deberían dejar. PURA. Es contra esto que se verifica la
 *  relectura: si el documento no lo contiene, la escritura no ocurrió por más que la API dijera 200. */
export function textoPlanoDeBloques(bloques) {
  const out = []
  for (const b of bloques ?? []) {
    if (b.tipo === 'parrafo') out.push(b.texto)
    else if (b.tipo === 'lista') out.push(...b.items)
    else if (b.tipo === 'datos') out.push(...b.pares.map(lineaDato))
    else if (b.tipo === 'tabla') out.push(...b.columnas, ...b.filas.flat())
  }
  return out.filter(Boolean)
}

/** Vuelca UN bloque al texto y anota lo que haya que estilar. PURA (muta el plan que recibe). */
function bloqueAlTexto(plan, b, linea) {
  if (b.tipo === 'parrafo') { linea(b.texto); return }
  if (b.tipo === 'lista') {
    const desde = plan.texto.length
    for (const it of b.items) linea(it)
    plan.listas.push({ desde, hasta: plan.texto.length, numerada: Boolean(b.numerada) })
    return
  }
  if (b.tipo === 'datos') {
    for (const par of b.pares) {
      const r = linea(lineaDato(par))
      plan.negritas.push({ desde: r.desde, hasta: r.desde + String(par.clave).length + 1 })
    }
    return
  }
  if (b.tipo === 'tabla') {
    const r = linea(RESERVA)
    plan.tablas.push({ reserva: r.desde, columnas: b.columnas, filas: b.filas })
  }
}

/** Índice del documento para un offset del texto insertado en `base`. PURA. */
const idx = (offset, base = 1) => base + offset

/**
 * PETICIONES DEL PRIMER PASO: el texto entero y sus estilos. PURA.
 * `insertText` va primera; el resto no cambia la longitud del texto, así que sus rangos —calculados
 * sobre el string— siguen valiendo dentro del mismo batch.
 */
export function requestsDeCuerpo(plan, { base = 1 } = {}) {
  const out = [{ insertText: { location: { index: base }, text: plan.texto } }]
  for (const h of plan.encabezados) {
    out.push({
      updateParagraphStyle: {
        range: { startIndex: idx(h.desde, base), endIndex: idx(h.hasta, base) },
        paragraphStyle: { namedStyleType: h.estilo },
        fields: 'namedStyleType',
      },
    })
  }
  for (const l of plan.listas) {
    out.push({
      createParagraphBullets: {
        range: { startIndex: idx(l.desde, base), endIndex: idx(l.hasta, base) },
        bulletPreset: l.numerada ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
      },
    })
  }
  for (const n of plan.negritas) {
    out.push({
      updateTextStyle: {
        range: { startIndex: idx(n.desde, base), endIndex: idx(n.hasta, base) },
        textStyle: { bold: true },
        fields: 'bold',
      },
    })
  }
  return out
}

/**
 * PETICIONES DEL SEGUNDO PASO: las tablas, de la última a la primera. PURA.
 * Cada tabla entra en el párrafo vacío que el primer paso le reservó.
 */
export function requestsDeTablas(plan, { base = 1 } = {}) {
  return [...plan.tablas].reverse().map((t) => ({
    insertTable: {
      rows: t.filas.length + 1, // +1: el encabezado
      columns: t.columnas.length,
      location: { index: idx(t.reserva, base) },
    },
  }))
}

/**
 * PETICIONES DEL TERCER PASO: el contenido de las celdas, leído del documento YA con las tablas.
 * De la última celda a la primera, por la misma razón que las tablas van al revés. PURA.
 *
 * @param {object} documento respuesta de `getDoc` después de insertar las tablas
 * @param {Array<{columnas:string[], filas:string[][]}>} tablas en el orden del documento
 */
export function requestsDeCeldas(documento, tablas, { desde = 0 } = {}) {
  // `desde` acota a las tablas que ACABAN de insertarse: un documento puede tener tablas viejas más
  // adelante, y llenar una de ésas con los datos de otra sección es peor que no llenar ninguna.
  const enDoc = tablasDesde(documento, desde).slice(0, tablas.length)
  if (enDoc.length !== tablas.length) {
    return { error: `desde el índice ${desde} hay ${enDoc.length} tabla(s) y la estructura declara ${tablas.length}` }
  }
  const out = []
  enDoc.forEach((el, i) => {
    const datos = [tablas[i].columnas, ...tablas[i].filas]
    const filas = el.table?.tableRows ?? []
    filas.forEach((fila, f) => {
      (fila.tableCells ?? []).forEach((celda, c) => {
        const texto = String(datos?.[f]?.[c] ?? '')
        if (!texto) return
        // El índice donde empieza el contenido de la celda: su primer párrafo vacío.
        const start = celda.content?.[0]?.startIndex
        if (!Number.isInteger(start)) return
        out.push({ orden: [i, f, c], req: { insertText: { location: { index: start }, text: texto } } })
      })
    })
  })
  // De la última a la primera: cada inserción corre los índices de lo que viene después.
  return { requests: out.reverse().map((o) => o.req) }
}

/** Las tablas del cuerpo que empiezan en `desde` o después, en orden. PURA. */
export function tablasDesde(documento, desde = 0) {
  return (documento?.body?.content ?? []).filter((el) => el.table && (el.startIndex ?? 0) >= desde)
}

/** Encabezados de tabla en negrita. Se aplica DESPUÉS de llenar, sobre el documento releído. PURA. */
export function requestsDeCabeceraDeTabla(documento, { desde = 0, limite = Infinity } = {}) {
  const out = []
  for (const el of tablasDesde(documento, desde).slice(0, limite)) {
    for (const celda of el.table?.tableRows?.[0]?.tableCells ?? []) {
      const desde = celda.content?.[0]?.startIndex
      const hasta = celda.content?.[celda.content.length - 1]?.endIndex
      if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta - 1 <= desde) continue
      out.push({ updateTextStyle: { range: { startIndex: desde, endIndex: hasta - 1 }, textStyle: { bold: true }, fields: 'bold' } })
    }
  }
  return out
}

/**
 * REEMPLAZO DE VARIABLES `{{clave}}`. PURA.
 * `replaceAllText` lo resuelve la propia API sobre todo el documento, tablas incluidas: hacerlo a
 * mano obligaría a recorrer índices que se mueven con cada reemplazo.
 */
export function requestsDeVariables(variables) {
  return Object.entries(variables ?? {}).map(([clave, valor]) => ({
    replaceAllText: {
      containsText: { text: `{{${clave}}}`, matchCase: true },
      replaceText: String(valor ?? ''),
    },
  }))
}

/** Vacía el contenido de una sección (deja el título). PURA. */
export function requestsDeVaciadoDeSeccion(seccion) {
  if (!seccion || seccion.fin <= seccion.contenido_inicio) return []
  return [{ deleteContentRange: { range: { startIndex: seccion.contenido_inicio, endIndex: seccion.fin } } }]
}
