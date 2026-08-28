// CÓMO SE COTIZA EN ECSAS — el lector de la planilla interna de cotización, no de sus números.
//
// ═══ QUÉ SE ESTUDIA ACÁ, Y QUÉ NO ═══
//
// El dueño lo dijo así: «tenés que aprender cómo se han estado haciendo las cotizaciones, lo que no
// significa que estén en lo correcto». Entonces lo que sale de este archivo NO es «una viga cuesta
// X»: es la PRÁCTICA — qué hojas tiene la planilla, con qué unidad se mide cada partida, qué
// coeficientes se aplican, qué se le muestra al cliente y qué se le esconde, qué notas se escriben.
//
// Un precio de una de estas planillas es un precio de UNA cotización de UNA fecha. No asciende solo.
//
// ═══ POR QUÉ LEE POR ETIQUETA Y NO POR POSICIÓN ═══
//
// Las catorce planillas medidas comparten la misma plantilla pero NO las mismas filas: `Presupuesto`
// aparece a veces primero y a veces cuarta, y una de ellas cambió `UN` por `CANT` en el encabezado
// de la oferta. Un lector por índice de columna habría leído la unidad de la columna de cantidad y
// nadie se habría enterado. Se busca el encabezado por su texto y de ahí salen los índices.
//
// ═══ CADA DATO VIAJA CON SU CELDA ═══
//
// `celda` no es decorativa: es la ubicación que exige la biblioteca para aceptar una afirmación. Sin
// «hoja GG, celda G61» un hallazgo es una impresión, y una impresión no se le lleva al dueño.

import { esErrorDeCelda, textoDelError } from './celda.mjs'

/** Las hojas de la plantilla interna. Los nombres son los que usa el archivo real, con acento. */
export const HOJA = Object.freeze({
  OFERTA: 'OFERTA',
  PRESUPUESTO: 'Presupuesto',
  ANALISIS: 'Análisis',
  GG: 'GG',
  RECURSOS: 'Recursos',
})

/** Texto comparable: sin acentos, sin espacios repetidos, en mayúscula. PURA. */
export const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase()

/** ¿Hay algo escrito? El 0 SÍ es algo escrito: una partida cotizada en cero es el dato que más
 *  importa de esta carpeta, y tratarla como vacía la borraría del hallazgo. PURA. */
export const hayValor = (v) => v !== null && v !== undefined && String(v).trim() !== ''

/** La referencia A1 de una celda a partir de índices 0-based. PURA. */
export function refCelda(columna, fila) {
  let c = Number(columna)
  if (!Number.isInteger(c) || c < 0 || !Number.isInteger(Number(fila)) || Number(fila) < 0) return null
  let letras = ''
  for (let n = c; ; n = Math.floor(n / 26) - 1) {
    letras = String.fromCharCode(65 + (n % 26)) + letras
    if (n < 26) break
  }
  return `${letras}${Number(fila) + 1}`
}

/**
 * UN NÚMERO, O `null`. PURA.
 *
 * La primera versión limpiaba el texto con `replace(/[^0-9.-]/g,'')` y le pasaba el resto a
 * `Number`. Con eso «MANUFACTURAS QUIMICAS JUAN MESSINAS» daba **0**, porque `Number('')` es 0: el
 * nombre de un cliente entraba como un importe de cero. Ahora una cadena que no tiene forma de
 * número devuelve `null`, que es lo que de verdad se sabe de ella.
 */
export function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (!hayValor(v)) return null
  const s = String(v).trim().replace(/\s/g, '').replace(/^\$/, '')
  if (!/^-?[0-9]+([.,][0-9]+)*%?$/.test(s)) return null
  const sinPorciento = s.replace('%', '')
  // «1.234,56» es es-AR: el punto separa miles. «2413.07» viene de la planilla: el punto es decimal.
  const cuerpo = sinPorciento.includes(',')
    ? sinPorciento.replace(/\./g, '').replace(',', '.')
    : sinPorciento
  const n = Number(cuerpo)
  if (!Number.isFinite(n)) return null
  return s.endsWith('%') ? n / 100 : n
}

/**
 * LA FILA DE ENCABEZADO. Devuelve `{ fila, columnas }` o `null` si no está. PURA.
 *
 * `columnas` mapea la etiqueta normalizada al índice de columna. Se busca en las primeras filas
 * porque un encabezado que aparece en la fila 300 no es un encabezado: es un dato que se le parece.
 */
export function encabezado(filas = [], etiquetas = [], { hasta = 40 } = {}) {
  const buscadas = etiquetas.map(normalizar)
  const tope = Math.min(hasta, filas.length)
  for (let i = 0; i < tope; i++) {
    const fila = filas[i] ?? []
    const presentes = fila.map(normalizar)
    if (!buscadas.every((e) => presentes.includes(e))) continue
    const columnas = {}
    presentes.forEach((t, c) => { if (t && columnas[t] === undefined) columnas[t] = c })
    return { fila: i, columnas }
  }
  return null
}

/** El valor de una columna de la fila, por etiqueta. `undefined` si esa columna no existe. PURA. */
const dame = (fila, columnas, etiqueta) => {
  const c = columnas[normalizar(etiqueta)]
  return c === undefined ? undefined : fila?.[c]
}

/**
 * LA OFERTA — lo único que ve el cliente.
 *
 * ═══ LOS BLOQUES DE OTRO CLIENTE ═══
 *
 * Medido en las catorce planillas: la hoja `OFERTA` guarda la oferta actual en A:E y las ofertas
 * ANTERIORES —de otros clientes, con su nombre, su dirección y sus precios— en las columnas de al
 * lado. No es una curiosidad: es el archivo que se manda por mail. Se cuenta y se declara.
 */
export function leerOferta(filas = []) {
  const enc = encabezado(filas, ['TAREA', 'CANT', 'PRECIO UNICARIO', 'SUB TOTAL'])
  if (!enc) return { ok: false, porQue: 'la hoja OFERTA no tiene el encabezado TAREA/CANT/PRECIO/SUB TOTAL' }
  const { fila: f0, columnas } = enc
  const cTarea = columnas[normalizar('TAREA')]
  const ultima = Math.max(...Object.values(columnas))
  const items = []
  for (let i = f0 + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const tarea = dame(fila, columnas, 'TAREA')
    if (normalizar(tarea).startsWith('SUB TOTAL')) break
    const precio = numero(dame(fila, columnas, 'PRECIO UNICARIO'))
    if (!hayValor(tarea) || precio === null) continue
    items.push({
      tarea: String(tarea).replace(/\s+/g, ' ').trim(),
      unidad: hayValor(dame(fila, columnas, 'UN')) ? String(dame(fila, columnas, 'UN')).trim() : null,
      cantidad: numero(dame(fila, columnas, 'CANT')),
      precioUnitario: precio,
      subtotal: numero(dame(fila, columnas, 'SUB TOTAL')),
      fila: i, celda: refCelda(cTarea, i),
    })
  }
  return { ok: true, encabezado: enc, items, ...cierreDeOferta(filas, f0, columnas), ...textosDeOferta(filas, f0), bloquesAjenos: bloquesAjenos(filas, f0, ultima) }
}

/**
 * SUB TOTAL / IVA / TOTAL, buscados por su rótulo en cualquier columna. PURA.
 *
 * `error` no es un detalle: en dos de las catorce ofertas medidas el cierre entero es `#DIV/0!` o
 * `#NAME?`. Sin este campo, esa oferta se leería como una oferta con un total de 7 pesos.
 */
function cierreDeOferta(filas, f0, columnas) {
  const cValor = columnas[normalizar('SUB TOTAL')]
  const leer = (rotulo) => {
    for (let i = f0 + 1; i < filas.length; i++) {
      const fila = filas[i] ?? []
      const j = fila.findIndex((v) => normalizar(v) === normalizar(rotulo))
      if (j >= 0) return { valor: numero(fila[cValor]), error: textoDelError(fila[cValor]), celda: refCelda(cValor, i), rotuloEn: refCelda(j, i) }
    }
    return { valor: null, error: null, celda: null, rotuloEn: null }
  }
  return { subtotal: leer('SUB TOTAL'), iva: leer('IVA'), total: leer('TOTAL') }
}

/** Las notas, la forma de pago y la fecha: la letra chica que define el alcance. PURA. */
function textosDeOferta(filas, f0) {
  const notas = []
  let formaDePago = null
  let fecha = null
  for (let i = f0 + 1; i < filas.length; i++) {
    for (let c = 0; c < (filas[i] ?? []).length; c++) {
      if (esErrorDeCelda(filas[i][c])) continue
      const t = String(filas[i][c] ?? '').replace(/\s+/g, ' ').trim()
      if (!t) continue
      const n = normalizar(t)
      if (n.startsWith('NOTA')) notas.push({ texto: t, celda: refCelda(c, i) })
      else if (n.startsWith('FORMA DE PAGO')) formaDePago = { texto: t, celda: refCelda(c, i) }
      else if (/^SAN JUAN,/.test(n)) fecha = { texto: t, celda: refCelda(c, i) }
    }
  }
  return { notas, formaDePago, fecha }
}

/** Cuántos bloques de oferta hay a la derecha del que se está cotizando. PURA. */
function bloquesAjenos(filas, f0, ultimaColumna) {
  let max = 0
  for (let i = 0; i < f0; i++) {
    const n = (filas[i] ?? []).filter((v, c) => c > ultimaColumna && hayValor(v) && !esErrorDeCelda(v) && numero(v) === null).length
    if (n > max) max = n
  }
  return max
}

/** EL PRESUPUESTO INTERNO — la partida con su código, su unidad y su coeficiente de ajuste. PURA. */
export function leerPresupuesto(filas = []) {
  const enc = encabezado(filas, ['ID TAREA', 'TAREA', 'U.', 'CANT.'])
  if (!enc) return { ok: false, porQue: 'la hoja Presupuesto no tiene el encabezado ID TAREA/TAREA/U./CANT.' }
  const { fila: f0, columnas } = enc
  const cId = columnas[normalizar('ID')]
  const items = []
  const rubros = []
  for (let i = f0 + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const tarea = dame(fila, columnas, 'TAREA')
    const codigo = hayValor(dame(fila, columnas, 'ID')) ? String(dame(fila, columnas, 'ID')).trim() : null
    if (!hayValor(tarea)) continue
    // Una fila con texto en TAREA y sin código ni unidad es un título de rubro. Es la estructura de
    // la cotización, y perderla es perder en qué orden ECSAS piensa una obra.
    if (!codigo && !hayValor(dame(fila, columnas, 'U.'))) { rubros.push({ nombre: String(tarea).trim(), fila: i, celda: refCelda(columnas[normalizar('TAREA')], i) }); continue }
    items.push({
      codigo,
      tarea: String(tarea).replace(/\s+/g, ' ').trim(),
      unidad: hayValor(dame(fila, columnas, 'U.')) ? String(dame(fila, columnas, 'U.')).trim() : null,
      cantidad: numero(dame(fila, columnas, 'CANT.')),
      costoUnitario: numero(dame(fila, columnas, 'COSTO U TOTAL')),
      coeficienteAjuste: numero(dame(fila, columnas, 'COEF. AJUSTE')),
      subtotal: numero(dame(fila, columnas, 'SUBTOTAL')),
      costoMO: numero(dame(fila, columnas, 'COSTO MO')),
      costoMA: numero(dame(fila, columnas, 'COSTO MA')),
      fila: i, celda: refCelda(cId ?? 0, i),
    })
  }
  return { ok: true, encabezado: enc, items, rubros }
}

/** EL ANÁLISIS DE COSTOS — la partida y sus horas de oficial y de ayudante POR UNIDAD. PURA. */
export function leerAnalisis(filas = []) {
  const enc = encabezado(filas, ['COD T', 'DESCRIPCION', 'UN'])
  if (!enc) return { ok: false, porQue: 'la hoja Análisis no tiene el encabezado COD T/DESCRIPCION/UN' }
  const { fila: f0, columnas } = enc
  const cCod = columnas[normalizar('COD T')]
  const partidas = []
  for (let i = f0 + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const cod = dame(fila, columnas, 'COD T')
    if (!hayValor(cod)) continue
    partidas.push({
      codigo: String(cod).trim(),
      descripcion: String(dame(fila, columnas, 'DESCRIPCION') ?? '').replace(/\s+/g, ' ').trim(),
      unidad: hayValor(dame(fila, columnas, 'UN')) ? String(dame(fila, columnas, 'UN')).trim() : null,
      oficialHPorUnidad: numero(dame(fila, columnas, 'OF E - OF')),
      ayudanteHPorUnidad: numero(dame(fila, columnas, 'AY')),
      total: numero(dame(fila, columnas, 'TOTAL')),
      manoDeObra: numero(dame(fila, columnas, 'MO')),
      materiales: numero(dame(fila, columnas, 'MA')),
      fila: i, celda: refCelda(cCod, i),
    })
  }
  return { ok: true, encabezado: enc, partidas }
}

/** El porcentaje que el RÓTULO promete, cuando lo dice entre paréntesis. `null` si no lo dice. PURA. */
export function porcentajeDelRotulo(rotulo) {
  const m = String(rotulo ?? '').match(/\(\s*([0-9]+(?:[.,][0-9]+)?)\s*%/)
  return m ? Number(m[1].replace(',', '.')) / 100 : null
}

/**
 * LOS GASTOS GENERALES Y LA FORMACIÓN DEL PRECIO.
 *
 * Devuelve cada concepto con el porcentaje que su rótulo promete y el que la planilla aplica. Que
 * esos dos números puedan diferir es el hallazgo principal de esta carpeta, así que se leen los dos
 * y no se elige uno.
 */
export function leerGastosGenerales(filas = [], { columnaRotulo = 1, columnaCoeficiente = 6, columnaImporte = 7 } = {}) {
  const conceptos = []
  const hitos = {}
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const rotulo = String(fila[columnaRotulo] ?? '').replace(/\s+/g, ' ').trim()
    const titulo = normalizar(fila[0])
    if (titulo) hitos[titulo] = { fila: i, valores: fila.map((v, c) => ({ valor: numero(v), celda: refCelda(c, i) })).filter((x) => x.valor !== null) }
    if (!rotulo) continue
    const aplicado = numero(fila[columnaCoeficiente])
    const importe = numero(fila[columnaImporte])
    if (aplicado === null && importe === null) continue
    conceptos.push({
      concepto: rotulo,
      prometidoPorElRotulo: porcentajeDelRotulo(rotulo),
      aplicado, importe,
      celdaRotulo: refCelda(columnaRotulo, i),
      celdaCoeficiente: refCelda(columnaCoeficiente, i),
      celdaImporte: refCelda(columnaImporte, i),
      fila: i,
    })
  }
  return { ok: conceptos.length > 0, conceptos, hitos, porQue: conceptos.length ? null : 'la hoja GG no tiene conceptos con coeficiente ni importe' }
}
