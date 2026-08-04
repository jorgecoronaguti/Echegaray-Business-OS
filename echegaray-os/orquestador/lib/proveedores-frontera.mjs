// HASTA DÓNDE LLEGA LA MANO DEL GENERADOR EN LA PESTAÑA "Proveedores".
//
// ═══ POR QUÉ EXISTE (04/08) ═══
//
// Las secciones 1 y 2 de "Proveedores" dejaron de ser bloques de fórmulas: hoy son TABLAS DINÁMICAS
// nativas, que las hacen otros dos scripts (proveedores-dos-cuadros.mjs y el pivot de la sección 2).
// El generador viejo —proveedores-materiales-pestana.mjs— las reescribiría como texto y las mataría
// en silencio, así que se le puso una guarda que ABORTABA LA CORRIDA ENTERA.
//
// El remedio salió más caro que la enfermedad: todo lo que vive DEBAJO de las dinámicas —notas de
// crédito, facturas anuladas cargadas en Compras, lo facturado por AFIP que Compras no tiene, el
// control de carga y la plomería de ARCA— dejó de actualizarse. El dueño lo vio antes que ningún
// control: cuadros viejos, y una nota de crédito repetida tres veces con reemplazos de otro
// proveedor —restos de una corrida anterior que ya nadie limpiaba—.
//
// LA REGLA CORRECTA NO ES "NO ESCRIBAS", ES "ESCRIBÍ DE ACÁ PARA ABAJO". Este archivo calcula ese
// "de acá": la FRONTERA. Todo lo de arriba es de las dinámicas y del bloque de posición (fórmulas
// vivas que se mantienen solas); todo lo de abajo es del generador y se rehace entero.
//
// ═══ LA FRONTERA SE BUSCA POR EL TÍTULO, NUNCA POR UN NÚMERO DE FILA ═══
//
// El bloque de arriba CRECE Y SE ACHICA SOLO: una dinámica gana una fila por cada proveedor nuevo al
// que se le empieza a deber. Una frontera fija en "la fila 60" queda mal en la primera corrida en
// que aparece un proveedor, y ahí escribir es destruir. Se busca el TÍTULO del primer bloque que
// genera el script, que es un texto que el generador controla.
//
// Y si el título no aparece, NO SE ESCRIBE: "no pude encontrar la frontera" nunca es permiso para
// escribir en la fila que uno supone.

/** El separador que llevan todos los títulos de sección de la pestaña: "3 · NOTAS DE CRÉDITO". */
const PREFIJO_NUMERO = /^\s*\d+\s*·\s*/

/**
 * LAS SECCIONES, EN EL ORDEN EN QUE LAS VE EL DUEÑO — y de acá sale su número.
 *
 * Las dos primeras son las tablas dinámicas: el generador NO las escribe, pero ocupan los números 1
 * y 2, así que la primera sección generada es la 3. Antes cada `push` traía su número escrito a mano
 * ("5 · NOTAS DE CRÉDITO") y una renumeración al momento de escribir lo corregía: dos lugares que
 * decían el mismo número y podían discrepar — y discreparon, porque en la pestaña se lee "3" y en el
 * código decía "5".
 */
export const SECCIONES_PROVEEDORES = [
  'deuda',              // 1 · QUÉ SE DEBE Y CUÁNDO            (tabla dinámica, no la escribe este OS)
  'cuentaCorriente',    // 2 · CUENTA CORRIENTE POR PROVEEDOR   (tabla dinámica, ídem)
  'notasCredito',       // 3 · NOTAS DE CRÉDITO                 ← LA FRONTERA
  'faltanEnCompras',    // 4 · FACTURADO A LA EMPRESA QUE NO ESTÁ EN COMPRAS
  'control',            // 5 · CONTROL Y AUDITORÍA DE CARGA
  'arca',               // 6 · LO QUE ARCA REGISTRÓ
  'emitidas',           // 7 · FACTURAS EMITIDAS
]

/** La pestaña "Materiales" es del generador de punta a punta: sus secciones arrancan en 1. */
export const SECCIONES_MATERIALES = ['familiaMes', 'obra']

/** La primera sección que este generador escribe. Las anteriores son dinámicas. */
export const PRIMERA_GENERADA = 'notasCredito'

/**
 * El número que le toca a una sección. Una sola fuente para el número: el orden de la lista.
 * @param {string} clave
 * @param {string[]} [orden]
 * @returns {number}
 */
export function nSeccion(clave, orden = SECCIONES_PROVEEDORES) {
  const i = orden.indexOf(clave)
  if (i < 0) throw new Error(`sección desconocida: "${clave}" (las que hay: ${orden.join(', ')})`)
  return i + 1
}

/** Sin acentos, sin el número de sección, en mayúsculas: para comparar un título contra la pestaña. */
export function normalizarTitulo(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(PREFIJO_NUMERO, '')
    .trim().toUpperCase()
}

/** ¿Esta celda es el título de una sección ("3 · NOTAS DE CRÉDITO")? */
export const esTituloDeSeccion = (v) => PREFIJO_NUMERO.test(String(v ?? ''))

/** ¿La fila tiene algo escrito? */
const tieneAlgo = (fila) => (fila || []).some((c) => String(c ?? '').trim() !== '')

/**
 * LA FRONTERA: la fila (1-indexada) donde arranca el primer bloque que escribe el generador.
 *
 * Se compara por el texto del título SIN su número, porque el número lo decide `nSeccion` y el de la
 * pestaña puede venir de una versión anterior. Se toma la PRIMERA aparición: si el dueño dejó una
 * copia vieja más abajo, la de arriba es la viva.
 *
 * @param {any[][]} visible  la pestaña como se ve (valores formateados), desde la fila 1
 * @param {string} titulo    el texto invariable del título, sin número ("NOTAS DE CRÉDITO")
 * @returns {number} la fila 1-indexada
 * @throws si no está: sin frontera no se escribe, porque escribir sería a ciegas
 */
export function buscarFrontera(visible = [], titulo) {
  const buscado = normalizarTitulo(titulo)
  for (let i = 0; i < visible.length; i++) {
    if (normalizarTitulo(visible[i]?.[0]) === buscado) return i + 1
  }
  throw new Error(`no encontré "${titulo}" en la columna A de la pestaña: sin ese título no sé dónde `
    + 'terminan las tablas dinámicas y empieza lo mío. NO escribo — una frontera supuesta escribe '
    + 'encima de una dinámica y la mata en silencio. Si el bloque se renombró, hay que actualizar '
    + 'SECCIONES_PROVEEDORES y correrlo con --dry primero.')
}

/**
 * DÓNDE TERMINA UNA TABLA DINÁMICA. La API dice dónde está su ANCLA (la celda que lleva el
 * `pivotTable`), no cuánto ocupa: el cuerpo lo derrama el Sheet al recalcular y no viene en ningún
 * campo. Se mide por lo que se VE, que es el único dato disponible: desde el ancla hacia abajo
 * mientras la fila tenga algo. Se corta también en el título de la sección siguiente, para que una
 * dinámica pegada al título de abajo (sin fila en blanco entre medio) no se lo trague.
 *
 * @param {any[][]} visible
 * @param {number} ancla fila 1-indexada del ancla
 * @returns {number} la última fila 1-indexada que ocupa la dinámica
 */
export function finDeDinamica(visible = [], ancla) {
  let fin = ancla
  for (let f = ancla + 1; f <= visible.length; f++) {
    const fila = visible[f - 1]
    if (!tieneAlgo(fila) || esTituloDeSeccion(fila?.[0])) break
    fin = f
  }
  return fin
}

/**
 * LAS ANCLAS DE LAS DINÁMICAS, sacadas de la respuesta cruda de `getGridData`. Una tabla dinámica no
 * tiene valor ni fórmula propios: el campo `pivotTable` en su celda ancla es la ÚNICA señal de que
 * ahí hay una, y por eso esta detección no se puede hacer con `readSheetValues`.
 *
 * @param {object} grid respuesta de google.getGridData(id, 'Proveedores!A1:Z999')
 * @returns {{fila:number, col:number}[]} filas 1-indexadas
 */
export function anclasDeDinamicas(grid) {
  const data = grid?.sheets?.[0]?.data?.[0]
  const base = (data?.startRow ?? 0) + 1
  const out = []
  ;(data?.rowData ?? []).forEach((fila, i) => {
    (fila?.values ?? []).forEach((celda, j) => {
      if (celda?.pivotTable) out.push({ fila: base + i, col: j })
    })
  })
  return out
}

/**
 * EL GUARD, EN SU ROL NUEVO: la frontera tiene que caer DEBAJO de la última dinámica.
 *
 * Antes esta comprobación abortaba la corrida entera por el solo hecho de que hubiera una dinámica.
 * Ahora la dinámica es lo normal, y lo que se verifica es la única condición que importa: que lo que
 * se va a escribir empiece después de que las dinámicas terminen. Si la frontera cae dentro de una,
 * la detección está fallando y escribir sería destruirla — ahí sí se aborta.
 *
 * @param {{frontera:number, dinamicas:{ancla:number, fin:number}[]}} arg
 * @throws si alguna dinámica llega a la frontera o la pasa
 */
export function verificarFronteraBajoDinamicas({ frontera, dinamicas = [] }) {
  const chocan = dinamicas.filter((d) => d.fin >= frontera)
  if (chocan.length) {
    throw new Error(`la frontera calculada (fila ${frontera}) cae DENTRO de una tabla dinámica `
      + `(${chocan.map((d) => `ancla fila ${d.ancla}, ocupa hasta la ${d.fin}`).join(' · ')}). `
      + 'NO escribo: escribir ahí reemplaza la dinámica por texto y la mata en silencio. '
      + 'Es un defecto de detección de la frontera, no un permiso.')
  }
}

/**
 * EL ANCHO QUE EL BLOQUE TIENE QUE LIMPIAR ANTES DE ESCRIBIR.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA ═══
 *
 * Las columnas "Anula la factura" y "La reemplaza" de las notas de crédito mostraban restos de una
 * corrida anterior: una nota de Trielec repetida con reemplazos de otro proveedor. La causa es
 * siempre la misma — la corrida nueva escribió MENOS columnas de las que había, y la fusión (que por
 * diseño conserva lo que el generador deja vacío) dejó las viejas clavadas en su fila física.
 *
 * Un bloque generado es dueño de TODO SU ANCHO: lo que no llena, lo LIMPIA. Por eso el ancho no sale
 * de la fila más larga de esta corrida sino del ancho DECLARADO del bloque, que no encoge cuando el
 * dato del día es más angosto.
 *
 * LO QUE DELIBERADAMENTE NO ENTRA: el ancho de lo que había en la pestaña. Más allá del footprint
 * declarado, el generador no puede distinguir su propio resto de una anotación del dueño al margen —
 * y en la duda no se escribe. Achicar el footprint declarado sí es una decisión, y se toma acá.
 *
 * @param {{nuevas?:any[][], declarado?:number}} arg
 * @returns {number}
 */
export function anchoALimpiar({ nuevas = [], declarado = 0 } = {}) {
  const delDato = (nuevas || []).reduce((mx, f) => Math.max(mx, (f || []).length), 0)
  return Math.max(delDato, declarado)
}

/**
 * Lleva cada fila al ancho del bloque rellenando con el CENTINELA de vacío —"esta celda es mía y va
 * vacía"—, que es lo que hace que la fusión BORRE el resto viejo en vez de conservarlo.
 *
 * @param {any[][]} filas
 * @param {number} ancho
 * @param {any} vacio el centinela (lib/preservar-anotaciones.mjs)
 * @returns {any[][]}
 */
export function aAnchoCompleto(filas = [], ancho = 0, vacio) {
  return filas.map((f) => {
    const r = [...(f || [])]
    while (r.length < ancho) r.push(vacio)
    return r
  })
}
