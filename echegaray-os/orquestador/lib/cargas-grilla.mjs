// LA ESPINA DE "CARGAS SOCIALES" — UNA SOLA GRILLA PARA TODA LA PESTAÑA.
//
// POR QUÉ (23/07, y sigue vigente). El dueño: la pestaña "no respeta el patrón de diseño". La escribían
// TRES scripts distintos, cada uno con su propio ancho —había bloques de 7, 8, 9, 10 y 14 columnas—,
// así que cada cuadro empezaba y terminaba en una columna distinta del de arriba. Eso es exactamente lo
// que se ve como "descuadrado". Un solo constructor de filas no puede descuadrarse contra sí mismo.
//
// ═══ LA GRILLA ═══
//
//   A            el concepto
//   B … M        los doce meses del año, SIEMPRE en la misma columna: enero es B en todos los cuadros
//   N            el total del año
//   O            de dónde sale
//
// Es el estándar de cualquier modelo financiero serio: una sola definición de columna aplicada a todas
// las hojas, para que el ojo compare hacia abajo sin volver a leer el encabezado. Acá vale doble,
// porque toda la pestaña habla de lo mismo —el costo de la nómina— visto de siete maneras: lo
// declarado, lo pagado, la diferencia, lo que viene, cuándo sale de la caja, lo que se devengó y
// todavía no se pagó, y las cuotas de lo viejo.

import { VACIO } from './preservar-anotaciones.mjs'

/** A..O. La columna O es la de procedencia: se vacía y se rinde como nota al pie. */
export const ANCHO = 15
export const COL_ORIGEN = 'O'
export const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** La columna del mes N. Enero es B en TODOS los cuadros de la pestaña: ése es el punto. */
export const cm = (m) => String.fromCharCode(65 + m)
/**
 * EL RANGO DE LOS MESES CON F931 PRESENTADO — sobre el que se miden las alícuotas reales.
 *
 * ═══ ESTABA CONGELADO EN ENERO–JUNIO (27/08/2026, auditoría de la pestaña) ═══
 *
 * Era `$B$fila:$G$fila` fijo, con el comentario «los seis meses». Julio ya tiene DDJJ presentada
 * —la propia pestaña la muestra: $8.235.742, 21 empleados— y quedaba afuera de TODO lo que se mide
 * acá: la dotación proyectada, la relación entre remuneración declarada y jornales netos, y las
 * cinco alícuotas medidas. El sesgo no se corrige solo: en agosto habría seguido midiendo sobre
 * enero–junio sin que nadie se entere.
 *
 * Que el defecto era conocido lo prueba el propio test suite, que ya lo parchó para la fila
 * COMPROMETIDO leyendo la fila entera. El arreglo se hizo en un lugar y no en los otros cuatro.
 *
 * `desdeProy` es el primer mes SIN declarar, así que el último real es el anterior. Es obligatorio a
 * propósito: un default lo volvería a congelar en silencio.
 */
export const REALES = (fila, desdeProy) => {
  if (!Number.isInteger(desdeProy) || desdeProy < 2 || desdeProy > 13) {
    throw new Error(`REALES necesita desdeProy (2..13) y recibió ${desdeProy}`)
  }
  return `$B$${fila}:$${cm(desdeProy - 1)}$${fila}`
}

/**
 * DESDE QUÉ MES SE PROYECTA — SE DEDUCE DEL DATO, NO SE ESCRIBE A MANO.
 *
 * POR QUÉ CAMBIÓ (23/07). El dueño: "si tienen proyecciones que dejaron de serlo porque ya estamos
 * en el momento determinado, ¿se actualiza?". Acá decía `DESDE_PROY = 7`. Una constante no se entera
 * de que pasó el tiempo: en agosto el cuadro habría seguido proyectando julio aunque el F931 de
 * julio ya estuviera presentado y leído — una estimación dibujada al lado de un hecho, sin que nada
 * lo avisara. Es la clase de error que envejece en silencio, igual que un número pegado.
 *
 * Ahora la frontera la pone el dato: se proyecta desde el primer mes SIN DDJJ presentada.
 */
export function desdeQueMesSeProyecta(periodos) {
  const conDato = periodos.map((p) => Number(p.slice(5, 7))).filter(Boolean)
  return conDato.length ? Math.max(...conDato) + 1 : 1
}

/** Los meses que YA tienen DDJJ: 1..desdeProy-1. El denominador de lo que se mide sobre lo real. */
export const MESES_REALES = (desdeProy) => Array.from({ length: desdeProy - 1 }, (_, i) => i + 1)

/**
 * LOS MESES EN QUE SE PAGA EL AGUINALDO. Ley 23.041: dos cuotas, junio y diciembre.
 *
 * No es un detalle de calendario: la remuneración declarada de esos meses lleva MEDIO SUELDO de más,
 * así que cualquier relación medida sobre ellos queda inflada. Medido en el archivo vivo: junio
 * declaró $18,3 M contra ~$12,5 M de mayo y julio.
 */
export const MESES_CON_SAC = Object.freeze([6, 12])

/**
 * SOBRE QUÉ MESES SE MIDE LA RELACIÓN ENTRE LO DECLARADO Y LOS JORNALES.
 *
 * ═══ ERA «TODOS LOS QUE TIENEN DDJJ», Y ESO TENÍA DOS DEFECTOS (21/09/2026) ═══
 *
 * La relación `remuneración declarada ÷ jornales netos` es lo que multiplica TODA la proyección de
 * cargas sociales de la pestaña, y por lo tanto la línea del Cash Flow. Se medía sobre los ocho
 * meses con DDJJ y daba 0,7013. Los dos problemas, medidos:
 *
 *   1. JUNIO ESTABA ADENTRO. Junio lleva la primera cuota del aguinaldo: su relación es 0,974
 *      contra 0,69–0,80 de los meses vecinos. Promediado sobre ocho meses, eso reparte un octavo de
 *      aguinaldo en CADA mes proyectado —septiembre, octubre y noviembre, que no tienen SAC— y al
 *      mismo tiempo deja a diciembre, que SÍ lo tiene, con el mismo promedio que los demás. El error
 *      va para los dos lados a la vez.
 *   2. EL AÑO ENTERO NO ES EL RITMO DE HOY. La relación viene subiendo todo el año —0,45 en febrero,
 *      0,78 en julio, 0,81 en agosto— porque sube la porción registrada. Un promedio de doce meses
 *      no describe ningún mes: describe el pasado.
 *
 * Con los últimos tres meses sin SAC (mayo, julio, agosto) la relación da 0,7563 en vez de 0,7013:
 * la proyección de septiembre a diciembre sube ~$2,5 M, que es plata que sale de la caja.
 *
 * LA VENTANA ES UN PARÁMETRO, NO UNA VERDAD. Tres meses es el suavizado habitual de una serie
 * mensual ruidosa, y es lo que se puede defender — no es un valor normativo ni medido. Se declara en
 * la pestaña, al lado del número, para que se pueda discutir.
 *
 * @param {number} desdeProy el primer mes SIN DDJJ presentada
 * @param {{ventana?:number, sac?:number[]}} opciones
 * @returns {number[]} los meses, en orden, sobre los que se mide
 */
export const VENTANA_CALIBRACION = 3

export function mesesDeCalibracion(desdeProy, { ventana = VENTANA_CALIBRACION, sac = MESES_CON_SAC } = {}) {
  const conDDJJ = MESES_REALES(desdeProy)
  const limpios = conDDJJ.filter((m) => !sac.includes(m))
  // SIN NINGÚN MES LIMPIO NO SE INVENTA UNA MEDICIÓN: se vuelve a todos los que hay. Pasa en los
  // primeros meses del año, cuando el único mes con DDJJ podría ser uno con aguinaldo — y en ese caso
  // una relación inflada declarada es mejor que ninguna, porque sin relación la proyección es cero y
  // el Cash Flow vuelve a la fila plana de Compras.
  const base = limpios.length ? limpios : conDDJJ
  return base.slice(Math.max(0, base.length - ventana))
}

/** El constructor de la grilla: las tres formas de fila que usa la pestaña, y nada más. */
/** Un mes cuya DDJJ todavía no existe. TEXTO y no número: no entra en ninguna suma, y se lee como
 *  la ausencia que es en vez de como un cero declarado (07/09/2026, pedido del dueño). */
export const SIN_DDJJ = 'sin DDJJ'

export function crearGrilla(anio) {
  const filas = []
  /** Empuja una fila rellenando hasta el ancho de la grilla y devuelve su número de fila real. */
  const push = (c = []) => {
    const r = [...c]
    // VACIO = "es mi celda y va vacía". Sin esto la fusión preservaría lo que había antes en esa
    // celda —incluidos los restos de la pestaña vieja— y el cuadro mostraría dos verdades.
    while (r.length < ANCHO) r.push(VACIO)
    for (let j = 0; j < ANCHO; j++) if (r[j] === '' || r[j] === undefined || r[j] === null) r[j] = VACIO
    filas.push(r)
    return filas.length
  }
  /** Una fila del cuadro mensual: rótulo, doce meses, total y origen. */
  const mensual = (rotulo, celda, origen, { meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], totaliza = true } = {}) => {
    const f = filas.length + 1
    const cols = Array.from({ length: 12 }, (_, i) => (meses.includes(i + 1) ? celda(i + 1) : VACIO))
    return push([rotulo, ...cols, totaliza ? `=SUM($B${f}:$M${f})` : VACIO, origen])
  }
  const cabecera = () => push(['Concepto', ...MES.slice(1).map((m) => `'${m}-${String(anio).slice(2)}`), 'Total', 'De dónde sale'])

  return { filas, push, mensual, cabecera, n: () => filas.length }
}

/**
 * EL ECO: la celda de un «Total declarado» que todavía no tiene DDJJ muestra la PROYECCIÓN.
 *
 * Las dos filas declaradas de la pestaña —el F931 y los gremiales— tienen el mismo problema y la
 * misma solución, y por eso la regla se escribe UNA vez: un mes sin DDJJ no puede quedarse mudo,
 * porque el Libro leería vacío y la línea del cash flow volvería a la fila PLANA de Compras (los
 * $6.500.000 del F931 que el dueño denunció el 08/09, los $1.500.000 de gremiales del 09/09).
 *
 * NO SE MARCA CON UNA PALABRA ADENTRO DEL IMPORTE. La distinción entre lo presentado y lo proyectado
 * la hace el FORMATO —gris e itálica— y el Libro la hace por el ECO: si el declarado del mes es
 * exactamente el mismo número que la propia pestaña publica como proyección, esa celda está mostrando
 * la proyección y el movimiento viaja como PROYECTADO (ver `obligacionDeclarada`). Sin proyección la
 * celda vuelve a decir «sin DDJJ»: un cero sigue sin ser una respuesta posible.
 *
 * @returns {{fila:number, meses:number[]}} lo que la piel necesita para dibujar esos meses en gris
 */
export function ecoDeLaProyeccion(G, { fila, filaProy, declarado }) {
  const meses = []
  for (let m = 1; m <= 12; m++) {
    if (declarado(m)) continue
    meses.push(m)
    G.filas[fila - 1][m] = `=IF(N(${cm(m)}${filaProy})=0;"${SIN_DDJJ}";${cm(m)}${filaProy})`
  }
  return { fila, meses }
}
