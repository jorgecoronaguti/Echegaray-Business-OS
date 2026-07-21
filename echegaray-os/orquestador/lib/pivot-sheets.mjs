// TABLAS DINÁMICAS NATIVAS — LA FORMA QUE EL DUEÑO PIDIÓ Y YO NO HABÍA USADO.
//
// POR QUÉ EXISTE (21/07). El dueño, sobre Proveedores y Materiales: "en pestaña resumen esta mejor
// esto al ser tablas dinámicas". Lo dijo el 20 y yo seguí armando listas planas con QUERY, así que
// la volvió a rechazar entera: "esa pestaña es completamente inútil".
//
// Fui a mirar RESUMEN y tenía razón. Sus tablas son PIVOTS NATIVOS de Google: agrupan por proveedor
// y por fecha, subtotalan solos, se colapsan con el +/− y el usuario puede reordenarlos sin tocar
// una fórmula. Lo que yo armaba era una lista de 16 columnas generada por QUERY: se ve toda de
// golpe, no se puede plegar, y para cambiar el orden hay que editar la fórmula.
//
// ═══ POR QUÉ UN PIVOT ES LA FORMA CORRECTA, NO SÓLO LA PEDIDA ═══
//
// 1. NO SE CONGELA. La definición apunta a un RANGO de Compras, no a un resultado. Se carga una
//    factura y aparece sola en el cuadro. Una lista con QUERY también, pero un total pegado no.
// 2. RESPETA LA REGLA DE ORO SIN ESFUERZO. No hay un solo número escrito por el código: hay una
//    definición y Google calcula. Es la versión más fuerte de "fórmulas o celdas con origen
//    trazable".
// 3. LOS SUBTOTALES SON DE GOOGLE. Los míos eran filas con SUMIFS que había que mantener alineadas
//    con la lista de arriba. El 21/07 esa lista dio tres totales de deuda distintos en la misma
//    pestaña porque las filas se desalinearon.
// 4. EL QUE LEE PUEDE PREGUNTAR OTRA COSA. Plegar un proveedor, ordenar por deuda, mirar sólo una
//    obra. Un cuadro que sólo contesta la pregunta que yo anticipé sirve una vez.
//
// ═══ EL DEFECTO DE LOS PIVOTS EXISTENTES, Y POR QUÉ NO SE ARREGLA COMO YO QUERÍA ═══
//
// El pivot de cobranzas de RESUMEN filtra con `visibleValues` enumerando siete fechas literales:
// "16/7/2026", "17/7/2026", "2/7/2026"… O sea que un cobro con una fecha nueva NO APARECE en el
// cuadro y nadie se entera. Misma familia que el espejo de JORNALES congelado: una fuente que
// envejece sin gritar.
//
// Mi primera versión de este archivo prohibía las enumeraciones y sólo aceptaba CONDICIONES ("es
// igual a", "no está vacío"), que siguen siendo verdaderas cuando entra un dato nuevo. Lo probé
// contra el Sheet real y NO FUNCIONA: un pivot con `filterCriteria.condition` devuelve cero filas.
//
//   sin filtro                 → 30 proveedores y sus importes
//   con condition TEXT_EQ      → sólo "Suma total", vacío
//
// Los filtros de una tabla dinámica de Google admiten `visibleValues` y nada más. No hay forma de
// expresar una regla; hay que enumerar.
//
// ASÍ QUE EL PROBLEMA SE RESUELVE EN OTRO LADO: la enumeración se REGENERA en cada corrida a partir
// de los valores que existen HOY en la columna, y el llamador está obligado a pasar ese dominio
// completo (`filtroValores` no se puede llamar sin él). El agente rehace esta pestaña cada dos
// horas, así que un valor nuevo entra al cuadro en menos de dos horas en vez de nunca. Y
// `valoresNoCubiertos()` deja el control puesto: si aparece un valor que ninguna enumeración
// contempla, se ve.
//
// No es tan bueno como una condición. Es lo mejor que la API permite, y la diferencia queda
// escrita acá en vez de vivir como una suposición.

/** Las funciones de resumen que se usan. Declaradas para que no se cuele un typo. */
export const RESUMEN = { suma: 'SUM', cuenta: 'COUNTA', promedio: 'AVERAGE', maximo: 'MAX', minimo: 'MIN' }

/**
 * NÚCLEO PURO: el filtro de un pivot — la única forma que la API acepta.
 *
 * OBLIGA a pasar el DOMINIO COMPLETO de la columna (todos los valores que hay hoy) además de los
 * que se quieren ver. Sin el dominio no se puede saber qué está quedando afuera, y un filtro que
 * esconde sin decir qué esconde es cómo se pierde plata en un cuadro.
 *
 * @param {string[]} visibles los valores que se muestran
 * @param {string[]} dominio TODOS los valores que existen hoy en esa columna
 */
export function filtroValores(visibles, dominio) {
  if (!Array.isArray(dominio) || !dominio.length) {
    throw new Error('filtroValores necesita el dominio completo de la columna: sin él no se sabe qué queda afuera')
  }
  const v = visibles.filter((x) => dominio.includes(x))
  if (!v.length) throw new Error(`ninguno de los valores pedidos (${visibles.join(', ')}) existe hoy en la columna; el cuadro saldría vacío`)
  return { visibleValues: v }
}

/**
 * NÚCLEO PURO: qué valores del dominio NO están contemplados por ninguna enumeración.
 *
 * El control que reemplaza a la condición que la API no soporta. Si en Compras aparece un estado
 * nuevo —"En gestión", "Rechazado"— acá se ve, en vez de desaparecer del cuadro en silencio.
 */
export function valoresNoCubiertos(dominio = [], visibles = [], ignorados = []) {
  return dominio.filter((d) => d && !visibles.includes(d) && !ignorados.includes(d))
}

/**
 * NÚCLEO PURO: arma la definición de una tabla dinámica.
 *
 * @param {object} o
 * @param {number} o.sheetId  la pestaña ORIGEN (Compras, normalmente)
 * @param {number} o.desdeFila fila 0-indexada donde arranca el rango origen, INCLUYENDO el encabezado
 * @param {number} o.hastaFila fila 0-indexada exclusiva
 * @param {number} o.columnas  cuántas columnas del origen entran
 * @param {Array<{col:number, orden?:'ASC'|'DESC', totales?:boolean, ordenarPorValor?:number}>} o.filas agrupaciones en filas
 * @param {Array<{col:number, orden?:'ASC'|'DESC', totales?:boolean}>} [o.columnasPivot] agrupaciones en columnas
 * @param {Array<{col:number, resumen?:string, nombre?:string}>} o.valores qué se suma
 * @param {Array<{col:number, criterio:object}>} [o.filtros]
 * @param {'HORIZONTAL'|'VERTICAL'} [o.disposicionValores]
 */
export function pivot({
  sheetId, desdeFila = 0, hastaFila = 1000, columnas = 26,
  filas = [], columnasPivot = [], valores = [], filtros = [],
  disposicionValores = 'HORIZONTAL',
} = {}) {
  if (!filas.length) throw new Error('un pivot sin agrupación de filas es una lista, no un pivot')
  if (!valores.length) throw new Error('un pivot sin valores no muestra nada')

  const grupo = (g, i) => ({
    sourceColumnOffset: g.col,
    // Los totales por grupo son lo que distingue un pivot de una lista. Se pueden apagar en los
    // niveles internos, donde subtotalar cada fecha agrega ruido y no información.
    showTotals: g.totales !== false,
    sortOrder: g.orden === 'DESC' ? 'DESCENDING' : 'ASCENDING',
    // Ordenar el nivel de arriba POR UN VALOR (la deuda, el gasto) y no alfabéticamente es lo que
    // hace que el cuadro conteste "a quién le debo más" sin que nadie ordene nada a mano.
    ...(g.ordenarPorValor !== undefined
      ? { valueBucket: { valuesIndex: g.ordenarPorValor } }
      : {}),
    ...(i === 0 ? {} : {}),
  })

  return {
    source: {
      sheetId,
      startRowIndex: desdeFila,
      endRowIndex: hastaFila,
      startColumnIndex: 0,
      endColumnIndex: columnas,
    },
    rows: filas.map(grupo),
    ...(columnasPivot.length ? { columns: columnasPivot.map(grupo) } : {}),
    values: valores.map((v) => ({
      sourceColumnOffset: v.col,
      summarizeFunction: v.resumen ?? RESUMEN.suma,
      ...(v.nombre ? { name: v.nombre } : {}),
    })),
    ...(filtros.length
      ? { filterSpecs: filtros.map((f) => ({ columnOffsetIndex: f.col, filterCriteria: f.criterio })) }
      : {}),
    valueLayout: disposicionValores,
  }
}

/**
 * NÚCLEO PURO: el request que planta el pivot en una celda.
 * Un pivot vive en UNA celda y se derrama solo: no hay que reservarle un rango.
 */
export function plantar(sheetId, fila, col, definicion) {
  return {
    updateCells: {
      range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{ pivotTable: definicion }] }],
      fields: 'pivotTable',
    },
  }
}

/**
 * NÚCLEO PURO: el request que BORRA el pivot de una celda.
 *
 * Hace falta porque un pivot no se pisa: si se planta uno nuevo sin sacar el viejo donde el viejo
 * ocupaba más filas, quedan restos derramados debajo. Y esta pestaña la rehace un agente cada dos
 * horas.
 */
export function borrar(sheetId, fila, col) {
  return {
    updateCells: {
      range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{}] }],
      fields: 'pivotTable',
    },
  }
}

/**
 * NÚCLEO PURO: las columnas de un pivot que llevan un filtro por enumeración.
 *
 * Ya no es una prohibición —la API no deja otra cosa— sino un INVENTARIO: dice qué filtros hay que
 * regenerar en cada corrida para que no envejezcan. Un pivot ajeno con enumeraciones que nadie
 * regenera, como el de RESUMEN, es un cuadro que se congela.
 */
export function filtrosQueSeCongelan(definicion) {
  const out = []
  for (const f of definicion?.filterSpecs ?? []) {
    if (Array.isArray(f?.filterCriteria?.visibleValues) && f.filterCriteria.visibleValues.length) {
      out.push({ col: f.columnOffsetIndex, valores: f.filterCriteria.visibleValues.length })
    }
  }
  for (const [col, c] of Object.entries(definicion?.criteria ?? {})) {
    if (Array.isArray(c?.visibleValues) && c.visibleValues.length) out.push({ col: Number(col), valores: c.visibleValues.length })
  }
  return out
}
