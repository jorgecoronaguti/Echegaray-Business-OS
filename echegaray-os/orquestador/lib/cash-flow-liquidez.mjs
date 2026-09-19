// EL COLCHÓN MÍNIMO ES UNA REGLA, Y LA LIQUIDEZ NO ES LA CAJA — la banda que faltaba bajo el cierre.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El modelo de 13 semanas que pidió el dueño tiene dos reglas que el cuadro no mostraba:
//
//   1. "Que el saldo de cierre no baje nunca de un monto fijado". La caja mínima de la empresa
//      ($20.000.000, parámetro `CAJA_MINIMA` en 01_Valores Iniciales) existía en el archivo pero
//      vivía en una celda de otra pestaña. Una política contra la que no se compara semana a semana
//      no es una política: es un número guardado. Acá es una LÍNEA — literalmente, una fila que corre
//      a lo largo de todo el horizonte y contra la que se mide cada cierre. Y es la segunda serie del
//      gráfico canónico del modelo: se ve CUÁNDO se cruza el piso, antes de que pase.
//
//   2. "Liquidez proyectada = caja + línea revolvente disponible". Hoy el aire de crédito
//      ($26,9M: tarjeta disponible + acuerdo en descubierto, `ANEXO_AIRE`) está declarado en CAJA
//      como "NO es efectivo" — y está bien, no lo es. Pero la pregunta de tesorería no es sólo
//      "¿cuánta plata hay?": es "¿con qué se puede pagar?". Son dos conceptos y el cuadro tenía uno.
//      El segundo se agrega SIN ensuciar el primero: el efectivo al cierre no se toca, la liquidez
//      es otra fila y dice en su rótulo que incluye deuda.
//
// ═══ TODO POR REFERENCIA, NINGÚN NÚMERO ═══
//
// Ni el mínimo ni el revolvente se escriben: son rangos con nombre. Un colchón de $20.000.000
// tipeado en la fórmula del cuadro es un parámetro con dos direcciones, y el día que el dueño lo
// cambie en 01_Valores Iniciales el cuadro va a seguir midiendo contra el viejo sin decir nada.
//
// ═══ LA APROXIMACIÓN DEL REVOLVENTE, DECLARADA ═══
//
// El aire disponible es una foto de HOY y se aplica igual a las trece semanas. En rigor cambia: la
// tarjeta libera cupo a medida que se pagan las cuotas y lo consume a medida que se compra. Modelar
// esa curva exigiría un calendario de cupo que hoy no existe en ningún lado del archivo, y un modelo
// inventado sería peor que una constante declarada. Lo que sí es exacto es el efecto de la caja: si
// el cierre proyectado cae, la liquidez cae con él peso por peso.
//
// Y NO HAY DOBLE CONTEO CON EL DESCUBIERTO: `ANEXO_AIRE` es el acuerdo DISPONIBLE (límite menos lo
// usado hoy), y el cierre proyectado ya incluye el giro en descubierto que la proyección produzca.
// Una liquidez proyectada negativa significa exactamente lo que parece: ni con la línea alcanza.

/** El parámetro de política: la caja mínima que la empresa decidió no bajar. Vive en 01_Valores Iniciales. */
export const REF_MINIMA = 'CAJA_MINIMA'
/** El aire de crédito realmente disponible: tarjeta + acuerdo, calculado en el anexo de CAJA. */
export const REF_REVOLVENTE = 'ANEXO_AIRE'

/** Los rótulos, en un solo lugar: la Regla 0 ancla al TEXTO, y un rótulo que cambia se lee como borrado. */
export const ROTULOS = {
  minima: 'Caja mínima exigida (política de la empresa)',
  excedente: '⇒ Excedente / (Déficit) contra la caja mínima',
  liquidez: 'Liquidez proyectada (caja + línea revolvente disponible)',
}

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: las tres filas de la banda de liquidez, que van pegadas debajo del efectivo al cierre.
 *
 * VAN PEGADAS AL CIERRE Y NO EN UN BLOQUE APARTE porque son la lectura del cierre, no un anexo: el
 * cierre dice cuánta plata queda y estas tres dicen si alcanza. Separarlas obligaría a comparar dos
 * cifras que están a veinte filas de distancia, que es exactamente lo que hoy hay que hacer a ojo.
 *
 * @param {object} p
 * @param {number} p.fila0 fila (1-based) donde arranca la banda
 * @param {number} p.n cantidad de columnas de período
 * @param {number} p.filaCierre fila del efectivo al cierre
 * @param {string} [p.refMinima] · @param {string} [p.refRevolvente] rangos con nombre
 * @returns {{filas:string[][], minima:number, excedente:number, liquidez:number}}
 */
export function bloqueLiquidez({ fila0, n, filaCierre, refMinima = REF_MINIMA, refRevolvente = REF_REVOLVENTE }) {
  const cols = Array.from({ length: n }, (_, i) => i)
  const col = (i) => letra(i + 1)
  const colTotal = letra(n + 1)
  const cierre = (i) => `${col(i)}${filaCierre}`

  // La línea del piso: el MISMO valor en todas las columnas. Se ve como una recta y eso es el punto —
  // es una regla, no una serie. Va por referencia al nombre, nunca el número.
  const fMin = fila0
  const filaMinima = [ROTULOS.minima, ...cols.map(() => `=N(${refMinima})`), `=N(${refMinima})`]

  // El excedente hereda el vacío del cierre: antes del período en que hay saldo cargado, el cierre está
  // en blanco a propósito (no se puede saber), y restarle el mínimo dibujaría un déficit de $20M que no
  // existe. Un déficit inventado en la fila que dispara la alarma es el peor número posible del cuadro.
  const fExc = fila0 + 1
  const filaExcedente = [ROTULOS.excedente,
    ...cols.map((i) => `=IF(${cierre(i)}="";"";${cierre(i)}-${col(i)}${fMin})`),
    `=IF(${colTotal}${filaCierre}="";"";${colTotal}${filaCierre}-${colTotal}${fMin})`]

  const fLiq = fila0 + 2
  const filaLiquidez = [ROTULOS.liquidez,
    ...cols.map((i) => `=IF(${cierre(i)}="";"";${cierre(i)}+N(${refRevolvente}))`),
    `=IF(${colTotal}${filaCierre}="";"";${colTotal}${filaCierre}+N(${refRevolvente}))`]

  return {
    filas: [filaMinima, filaExcedente, filaLiquidez],
    minima: fMin,
    excedente: fExc,
    liquidez: fLiq,
  }
}

/**
 * Los veredictos escalares que salen de la banda: cuántos períodos rompen el piso, cuánto es el peor
 * déficit, y cuántos períodos tienen plata parada de más.
 *
 * EL EXCESO DE LIQUIDEZ NO ES UNA BUENA NOTICIA y por eso se mide. Caja quieta muy por encima del
 * colchón en un país con esta inflación es margen que se evapora: la skill de tesorería lo trata como
 * un costo de oportunidad, no como holgura. El umbral es el DOBLE del mínimo — un múltiplo del
 * parámetro, no una constante nueva: si el dueño sube el colchón, el umbral sube con él.
 *
 * @param {object} p
 * @param {number} p.filaExcedente · @param {number} p.filaCierre · @param {number} p.filaMinima
 * @param {string} p.colN letra de la última columna de período
 * @returns {{criticos:string, peorDeficit:string, exceso:string, cobertura:string}}
 */
export function veredictosLiquidez({ filaExcedente, filaCierre, filaMinima, colN }) {
  const exc = `$B$${filaExcedente}:${colN}$${filaExcedente}`
  const cie = `$B$${filaCierre}:${colN}$${filaCierre}`
  const min = `$B$${filaMinima}`
  return {
    // "Días críticos" a nivel de columna: los períodos que CIERRAN por debajo del piso. Contar los que
    // dan negativo en caja sería otra cosa (y mucho más tarde): para cuando la caja da negativo, la
    // decisión que había que tomar ya pasó.
    criticos: `=COUNTIF(${exc};"<0")`,
    // El peor déficit del horizonte: cuánto hay que conseguir, no cuántas veces falta.
    peorDeficit: `=IF(COUNTIF(${exc};"<0")=0;0;MIN(${exc}))`,
    exceso: `=SUMPRODUCT((${cie}<>"")*(${cie}>2*${min}))`,
    // Cuánta plata parada por encima del doble del colchón en el período con más exceso: es el techo de
    // lo que se podría inmovilizar sin tocar la política.
    cobertura: `=IFERROR(MAX(0;MAX(${cie})-2*${min});0)`,
  }
}
