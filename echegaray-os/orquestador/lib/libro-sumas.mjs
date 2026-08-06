// LAS SUMAS SOBRE EL LIBRO CANÓNICO — el único constructor de fórmulas que lee `_MOVIMIENTOS`.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El dueño: *"desde ese libro deben alimentarse automáticamente Caja, Cash Flow Semanal y Cash Flow
// Mensual. No acepto lógica duplicada. No acepto fórmulas gigantes ni SUMPRODUCT repetidos."*
//
// Las tres vistas van a colgar del libro. Si cada una escribe su propio SUMPRODUCT contra
// `_MOVIMIENTOS`, en tres meses hay tres definiciones de "lo que entra esta semana" — exactamente la
// enfermedad que el libro vino a curar, reescrita una capa más arriba. Acá se define UNA vez cómo se
// suma una ventana del libro, y las tres vistas (y los gráficos) componen con esto.
//
// ═══ EL CONTRATO CON LA PESTAÑA ═══
//
// Las columnas son las del ENCABEZADO que escribe scripts/libro-movimientos-pestana.mjs. Ese script
// no se puede importar (ejecuta main() al cargarse), así que el orden vive acá COPIADO y un test lee
// el fuente del script y falla si divergen — la copia sin test sería una segunda fuente de verdad.
//
// Los rangos son ABIERTOS ($A$2:$A) a propósito: la fila donde termina el libro cambia con cada
// corrida, y un tope escrito hoy es la bomba de tiempo que ya cortó Cobranzas en la fila 200 una vez
// ("el número que decide sale de la fuente con rango abierto", memoria del proyecto).

/** Dónde vive el libro y qué columna es cada cosa. Espejo del ENCABEZADO de la pestaña (con test). */
export const LIBRO = Object.freeze({
  pestana: '_MOVIMIENTOS',
  fila0: 2, // la 1 es el encabezado
  col: Object.freeze({
    fecha: 'A', signo: 'B', importe: 'C', moneda: 'D', concepto: 'E', rubro: 'F', actividad: 'G',
    estado: 'H', instrumento: 'I', contraparte: 'J', cuit: 'K', comprobante: 'L', obra: 'M',
    origen: 'N', fila: 'O', clave: 'P',
    // ═══ POR QUÉ `Cliente` VA AL FINAL Y NO AL LADO DE `Obra`, QUE ES DONDE SE LEERÍA MEJOR ═══
    //
    // Porque el portón (`scripts/conciliar-libro.mjs`) lee la pestaña POR ÍNDICE —origen es el 13—, y
    // meter una columna en el medio le corre tres campos sin darle un solo error: seguiría conciliando,
    // contra los datos equivocados. Al final, ninguna posición existente se mueve.
    cliente: 'Q',
  }),
})

/** El rango abierto de una columna del libro. PURA. */
export const rangoLibro = (col) => `${LIBRO.pestana}!$${col}$${LIBRO.fila0}:$${col}`

const R = rangoLibro

/** Un grupo OR de igualdades sobre una columna: (col="A")+(col="B"), listo para multiplicar. */
const grupoIgual = (col, valores) =>
  `(${valores.map((v) => `(${R(col)}="${v}")`).join('+')})`

/**
 * NÚCLEO PURO: el TÉRMINO de una suma sobre el libro — sin el `=`, para poder componer varios.
 *
 * Toda condición es opcional; sin ninguna, suma el libro entero. `ISNUMBER(fecha)` va SIEMPRE:
 * la pestaña tiene filas de colchón vacías y una celda vacía compara como 0, que caería dentro de
 * cualquier ventana que arranque en el serial 0 (la de los cheques viejos, por ejemplo).
 *
 * @param {object} f
 * @param {string} [f.desde] expresión de fecha inicial (incluida), p.ej. 'TODAY()' o 'B$3'
 * @param {string} [f.hasta] expresión de fecha final (EXCLUIDA) — mismo criterio que todo el repo
 * @param {1|-1}  [f.signo] ENTRA (1) o SALE (-1)
 * @param {string[]} [f.estados] OR de estados (REAL/COMPROMETIDO/PROYECTADO/VENCIDO)
 * @param {string[]} [f.rubros] OR de rubros exactos
 * @param {string[]} [f.origenes] OR de pestañas de origen (columna N)
 * @param {string[]} [f.instrumentos] OR de instrumentos
 * @param {string[]} [f.clientes] OR de clientes CANÓNICOS (columna Q, la que escribe libro-clientes)
 * @param {string}  [f.obra] una obra exacta
 * @param {'neto'|'magnitud'} [f.medida] 'neto' multiplica por el signo (default); 'magnitud' no
 * @returns {string} un término SUMPRODUCT(...) en sintaxis es-AR (`;` no aplica: no lleva argumentos múltiples)
 */
export function terminoLibro(f = {}) {
  const cond = [`ISNUMBER(${R(LIBRO.col.fecha)})`]
  if (f.desde) cond.push(`(${R(LIBRO.col.fecha)}>=${f.desde})`)
  if (f.hasta) cond.push(`(${R(LIBRO.col.fecha)}<${f.hasta})`)
  if (f.signo === 1 || f.signo === -1) cond.push(`(${R(LIBRO.col.signo)}=${f.signo})`)
  if (f.estados?.length) cond.push(grupoIgual(LIBRO.col.estado, f.estados))
  if (f.rubros?.length) cond.push(grupoIgual(LIBRO.col.rubro, f.rubros))
  if (f.origenes?.length) cond.push(grupoIgual(LIBRO.col.origen, f.origenes))
  if (f.instrumentos?.length) cond.push(grupoIgual(LIBRO.col.instrumento, f.instrumentos))
  // El cliente se filtra por la columna CANÓNICA y no por `contraparte`: la contraparte de un egreso
  // es el PROVEEDOR, así que filtrarla por "LA ESTRELLA" devolvería cero para siempre sin dar error.
  // Quién es el cliente de cada fila lo decide `libro-clientes.mjs`, una sola vez, al armar el libro.
  if (f.clientes?.length) cond.push(grupoIgual(LIBRO.col.cliente, f.clientes))
  if (f.obra) cond.push(`(${R(LIBRO.col.obra)}="${f.obra}")`)
  const importe = f.medida === 'magnitud'
    ? `N(${R(LIBRO.col.importe)})`
    : `N(${R(LIBRO.col.importe)})*N(${R(LIBRO.col.signo)})`
  return `SUMPRODUCT(${cond.join('*')}*${importe})`
}

/** La fórmula completa, con su `=`. Para la celda que es UNA suma y nada más. */
export const formulaLibro = (f) => `=${terminoLibro(f)}`
