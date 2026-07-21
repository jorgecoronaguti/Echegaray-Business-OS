// EL ORDEN DE LA DEUDA, COMO COLUMNA CALCULADA EN COMPRAS.
//
// POR QUÉ EXISTE (21/07). El dueño abrió F8 de la tabla de deuda, vio "700000" en la barra de
// fórmulas y escribió: "1ERRORRRRRR - carga de numero sin referencia, rehacer". Es la SEGUNDA vez
// que marca esa misma celda.
//
// Técnicamente esa celda no tenía nada escrito: era un DERRAME del QUERY que vivía en A8. Pero eso
// no alcanza como respuesta, y él tiene razón: Google Sheets muestra el valor derramado en la barra
// de fórmulas exactamente igual que un número tipeado. Si al abrir la celda no se ve una fórmula, la
// regla no se está cumpliendo DE HECHO, aunque se cumpla en el modelo. Una regla que hay que creer
// no sirve — tiene que verse.
//
// ═══ CÓMO SE RESUELVE ═══
//
// El QUERY que derrama se reemplaza por un ÍNDICE DE ORDEN calculado en Compras, más una fórmula
// INDEX/MATCH en CADA celda de la tabla. Así cada celda —las 144— muestra su propia fórmula al
// abrirla, y la tabla sigue siendo igual de viva: se marca una factura como pagada en Compras y
// desaparece de la tabla sin esperar al agente.
//
// El orden no se puede hacer con RANK porque hay empates —varias facturas vencen el mismo día— y un
// empate en RANK produce dos veces el mismo número y saltea el siguiente: dos filas de la tabla
// mostrarían la misma factura y otra no aparecería nunca. El desempate va por posición en la
// planilla, con un COUNTIFS de rango creciente.

/** El estado que marca una factura como impaga. Una sola definición, la de cuentas-por-pagar. */
/**
 * DÓNDE VIVEN LAS COLUMNAS. El orden va en AH/AI y NO en AF/AG, y la razón es un error propio que
 * vale dejar escrito: la primera versión usó AF, que es el SUB-RUBRO DE ESTRUCTURA
 * (lib/sub-rubro-estructura.mjs). Pisarla dejó toda la pestaña "Estructura" en cero —los ocho
 * rubros, los doce meses— y el control saltó a $33.223.219 de diferencia.
 *
 * Escribir en una columna sin verificar antes qué había es la versión con columnas del error de
 * escribir en filas sin leer toda su altura. Compras es una pestaña de CARGA con nueve columnas
 * calculadas por el OS: antes de tomar una, se busca quién más la usa.
 */
export const COL = { estado: '$X', fechaCaja: '$AD', total: '$O', rubro: '$AC', comercial: '$AJ', orden: 'AH', ordenSinFecha: 'AI' }

/**
 * NÚCLEO PURO: la fórmula de la columna de orden, para la fila `f` de Compras.
 *
 * Devuelve 1, 2, 3… para las facturas impagas CON fecha de caja, ordenadas por esa fecha. Vacío
 * para todas las demás, así que el MATCH de la tabla no las encuentra y no ocupan una fila.
 *
 * @param {number} f fila de Compras (la primera de datos es la 4)
 * @param {string} estadoDeuda el rótulo exacto del estado impago
 */
export function formulaOrden(f, estadoDeuda) {
  const cond = `AND(${COL.estado}${f}="${estadoDeuda}";ISNUMBER(${COL.fechaCaja}${f});ISNUMBER(${COL.total}${f});${COL.comercial}${f}=1)`
  // Cuántas vencen ANTES + cuántas vencen el MISMO día pero están más arriba en la planilla. El
  // segundo término es el desempate: sin él, dos facturas del mismo día comparten número de orden.
  const antes = `COUNTIFS(${COL.fechaCaja}$4:${COL.fechaCaja};"<"&${COL.fechaCaja}${f};${COL.estado}$4:${COL.estado};"${estadoDeuda}";${COL.total}$4:${COL.total};"<>";${COL.comercial}$4:${COL.comercial};1)`
  const empate = `COUNTIFS(${COL.fechaCaja}$4:${COL.fechaCaja}${f};${COL.fechaCaja}${f};${COL.estado}$4:${COL.estado}${f};"${estadoDeuda}";${COL.total}$4:${COL.total}${f};"<>";${COL.comercial}$4:${COL.comercial}${f};1)`
  return `=IF(${cond};${antes}+${empate};"")`
}

/**
 * NÚCLEO PURO: igual que la anterior, para las impagas SIN fecha de caja.
 * Se ordenan por MONTO de mayor a menor: una factura sin fecha no compite por urgencia, compite por
 * tamaño. Es el criterio que pidió el dueño.
 */
export function formulaOrdenSinFecha(f, estadoDeuda) {
  const cond = `AND(${COL.estado}${f}="${estadoDeuda}";NOT(ISNUMBER(${COL.fechaCaja}${f}));ISNUMBER(${COL.total}${f});${COL.comercial}${f}=1)`
  const mayores = `COUNTIFS(${COL.estado}$4:${COL.estado};"${estadoDeuda}";${COL.fechaCaja}$4:${COL.fechaCaja};"";${COL.total}$4:${COL.total};">"&${COL.total}${f};${COL.comercial}$4:${COL.comercial};1)`
  const empate = `COUNTIFS(${COL.estado}$4:${COL.estado}${f};"${estadoDeuda}";${COL.fechaCaja}$4:${COL.fechaCaja}${f};"";${COL.total}$4:${COL.total}${f};${COL.total}${f};${COL.comercial}$4:${COL.comercial}${f};1)`
  return `=IF(${cond};${mayores}+${empate};"")`
}

/**
 * NÚCLEO PURO: la fórmula de UNA celda de la tabla de deuda.
 *
 * @param {string} colOrigen la columna de Compras que se trae ('$AD', '$E', '$O'…)
 * @param {number} filaTabla la fila del Sheet donde va la celda
 * @param {number} primera   la primera fila de la tabla (para saber qué puesto le toca)
 * @param {string} colOrden  'AF' o 'AG' según qué tabla
 */
export function celdaDeuda(colOrigen, filaTabla, primera, colOrden = COL.orden, texto = false) {
  const puesto = `ROW()-${primera - 1}`
  const dato = `INDEX(Compras!${colOrigen}$4:${colOrigen};MATCH(${puesto};Compras!$${colOrden}$4:$${colOrden};0))`
  // EL &"" NO ES DECORATIVO. El N° de comprobante "5-4163" es texto, pero si la celda quedó alguna
  // vez con formato de fecha, Sheets lo coacciona y muestra 826666 —el número de serie del año
  // 4163— y cambiar el formato después NO lo revierte. Pasó al reordenar las columnas, y es la
  // misma trampa que obligó al apóstrofo en _ARCA_RAW. Concatenar con "" fuerza texto en el
  // resultado, así ningún formato posterior lo puede convertir.
  if (texto === 'comprobante') {
    // ═══ UN N° DE COMPROBANTE QUE SHEETS GUARDÓ COMO FECHA ═══
    //
    // "5-4163" se cargó en Compras y Sheets lo interpretó como MAYO DE 4163: la celda guarda el
    // número 826666 y sólo se ve "5-4163" por su formato de fecha. Lo mismo con "2-7154" (febrero
    // de 7154). Es un defecto de carga real, no de esta fórmula: un comprobante guardado como fecha
    // no se puede cruzar contra Cheques Emitidos ni contra el libro de ARCA, que es justamente para
    // lo que existe el número.
    //
    // Acá se muestra lo que la persona escribió —TEXT con el mismo patrón m-yyyy lo reconstruye
    // exacto— y el bloque de control cuenta cuántos hay, para que se arreglen en el origen.
    return `=IFERROR(IF(${dato}="";"";IF(ISNUMBER(${dato});TEXT(${dato};"m-yyyy");${dato}&""));"")`
  }
  return texto
    ? `=IFERROR(IF(${dato}="";"";${dato}&"");"")`
    : `=IFERROR(${dato};"")`
}

/**
 * NÚCLEO PURO: la columna que dice si una compra es de un PROVEEDOR COMERCIAL.
 *
 * POR QUÉ EXISTE (21/07). El dueño: "ARCA no es proveedor, quitar de esa pestaña y reflejar esta
 * info únicamente donde corresponde, que es Impuestos y Financieros. Estos errores son de no seguir
 * las reglas de oro". La tabla de deuda mostraba las tres cuotas del plan de pago F931 —$2.494.876
 * cada una— que ya están desglosadas en "Impuestos y Financieros". Es la regla 4: un concepto ya
 * desglosado en otra pestaña no se repite.
 *
 * Va como UNA fórmula que derrama, y no como condición repetida en cada fórmula de orden: la
 * pregunta "¿esto es un proveedor comercial?" tiene que tener una sola definición, y vivir en la
 * columna donde vive el dato. Es la misma disciplina que el rubro de caja y la familia de material.
 */
export function formulaComercial(rubrosComerciales = []) {
  const rango = `${COL.rubro}$4:${COL.rubro}`
  const suma = rubrosComerciales.map((r) => `(${rango}="${r}")`).join('+')
  return `=ARRAYFORMULA(IF(${rango}="";"";IF((${suma})>0;1;0)))`
}
