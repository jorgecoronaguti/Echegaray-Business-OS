// LOS BALDES DE «¿ALCANZA LA CAJA?» — QUÉ PLATA YA SALIÓ Y QUÉ PLATA FALTA CONSEGUIR.
//
// ═══ POR QUÉ ESTO NO VIVE EN `caja-anexo-series.mjs` ═══
//
// Ese archivo escribe fórmulas; esto DECIDE de qué está hecha cada barra del gráfico, que es una
// decisión de tesorería y no de planilla. Separarlas deja que la misma taxonomía la use algo que no
// sea una celda —hoy, la vista en frío con la que se verifica el reparto sin tocar el Sheet— sin
// arrastrar el generador entero.
//
// UNA SOLA DEFINICIÓN. La fórmula del anexo, el gráfico y la vista leen `SALIDAS`. Si alguien agrega
// un balde acá, la columna, la barra, el color y el reparto se mueven juntos o falla un test.

import { NO_REAL } from './caja-tarjetas.mjs'

/**
 * ═══ LOS CINCO BALDES DE LA SALIDA (20/08/2026) ═══
 *
 * El dueño: *"que el gráfico me indique los rubros o lo que me va a ir haciendo descargos de dinero,
 * es decir, cheques, proveedores, sueldos, cargas sociales, impuestos"*. Son cinco baldes y tienen
 * que ser MUTUAMENTE EXCLUYENTES: si una fila cae en dos, el total del día miente hacia arriba y el
 * gráfico dice que hace falta plata que no hace falta.
 *
 * Por eso «Proveedores» NO tiene lista propia: es el RESTO —todos los egresos menos los otros
 * cuatro—. Así ningún rubro queda afuera del gráfico por no haberlo enumerado, que es como se pierde
 * un vencimiento. Y si algún día un sueldo se pagara con cheque, el resto daría negativo y se vería:
 * un balde que se solapa tiene que gritar, no esconderse.
 */
export const BALDES = Object.freeze({
  sueldos: Object.freeze(['Nómina · Jornales de obra', 'Nómina · Sueldos administración']),
  cargas: Object.freeze(['Nómina · Cargas sociales', 'Nómina · Gremiales', 'Deuda previsional (planes de pago)']),
  impuestos: Object.freeze(['Impuestos']),
  /** Cheques se define por INSTRUMENTO, no por rubro: un cheque a un corralón sigue siendo un cheque. */
  cheques: Object.freeze(['cheque', 'echeq']),
})

/**
 * ═══ Y UN SEXTO BALDE, PORQUE LOS CINCO MEZCLABAN DOS COSAS QUE NO SE SUMAN (28/08/2026) ═══
 *
 * El 28/08 el gráfico dibujó $4.200.000 de «Proveedores» para HOY. Era UNA fila de Compras —f834,
 * PEDRO TELLO, efectivo, Estado = Pagado—: plata que YA SALIÓ. La pestaña «Proveedores» mostraba $0
 * ese mismo día porque sólo lista deuda Pendiente. Las dos decían la verdad y medían cosas distintas,
 * y en el gráfico con el que se contesta «¿alcanza?» eso es una respuesta equivocada: lo que ya salió
 * no hay que conseguirlo, y pedirlo de nuevo es pedir dos veces la misma plata.
 *
 * El dueño: *"necesito que el gráfico muestre la información tal cual es, en tiempo y forma"*. No se
 * saca nada del gráfico: se PARTE en dos por la columna que el libro YA TRAE —`estado`, la H de
 * `_MOVIMIENTOS`—. No hizo falta agregarle nada al libro: el dato estaba y el gráfico no lo miraba.
 *
 *   · YA SALIÓ    → `REAL`. Pasó por el banco (o por la caja física) y por lo tanto YA ESTÁ ADENTRO
 *                   de `CAJA_TOTAL_DISPONIBLE`. Es contexto —qué pasó ese día—, no necesidad.
 *   · FALTA PAGAR → `NO_REAL` (COMPROMETIDO · PROYECTADO · VENCIDO), abierto en los cinco rubros.
 *                   ESTA es la parte que se compara contra el saldo, y la única que mueve las curvas.
 *
 * Es la regla absoluta de la skill de tesorería, literal: *"nunca se suman dos categorías distintas
 * en la misma columna sin distinguirlas"*. REAL y COMPROMETIDO son dos categorías distintas, y el
 * archivo ya la respetaba en las otras dos series (ver `saldoHistorico` / `saldoProyectado`): la
 * necesidad diaria era la única que no.
 *
 * ═══ POR QUÉ «YA SALIÓ» NO SE ABRE POR RUBRO ═══
 *
 * Serían diez series apiladas y ninguna se leería. Lo ejecutado no se negocia ni se reprograma: la
 * pregunta que contesta este gráfico es qué plata hay que conseguir, y para eso lo de ayer es una
 * sola barra. El detalle de lo pagado vive en el libro y en la pestaña de cada rubro.
 *
 * ═══ EL ORDEN DE ESTA LISTA ES EL ORDEN DE LAS COLUMNAS Y EL DE LA PILA ═══
 *
 * «Ya salió» va PRIMERO: al pie de la pila, que es donde se lee como piso y no como necesidad. El
 * `resto` NO se resuelve en este orden —ver `necesidadDelDia` y `baldeDeSalida`—: un balde residual
 * se evalúa siempre último dentro de su propio grupo de estados, o se comería a los específicos.
 */
export const SALIDAS = Object.freeze([
  Object.freeze({ clave: 'ejecutado', rotulo: 'Ya salió', estados: Object.freeze(['REAL']), resto: true }),
  Object.freeze({ clave: 'cheques', rotulo: 'Cheques', estados: NO_REAL, instrumentos: BALDES.cheques }),
  Object.freeze({ clave: 'proveedores', rotulo: 'Proveedores', estados: NO_REAL, resto: true }),
  Object.freeze({ clave: 'sueldos', rotulo: 'Sueldos', estados: NO_REAL, rubros: BALDES.sueldos }),
  Object.freeze({ clave: 'cargas', rotulo: 'Cargas sociales', estados: NO_REAL, rubros: BALDES.cargas }),
  Object.freeze({ clave: 'impuestos', rotulo: 'Impuestos', estados: NO_REAL, rubros: BALDES.impuestos }),
])

/** La clave del balde de lo ejecutado. Se nombra una vez: el que la escriba a mano se equivoca. */
export const EJECUTADO = 'ejecutado'

/** ¿Este balde es plata que YA pasó por el banco? Se pregunta por el ESTADO, que es el dato. */
export const esEjecutado = (b) => Boolean(b?.estados?.includes('REAL'))

/** Los baldes que SÍ son necesidad: lo que todavía hay que conseguir. Los que mueven las curvas. */
export const PENDIENTES = Object.freeze(SALIDAS.filter((b) => !esEjecutado(b)))

/**
 * DÓNDE CAE CADA COLUMNA DEL BLOQUE DE NECESIDAD, 1-based, para que el gráfico no las tipee.
 *
 * Agregar un balde corre las dos curvas de saldo una columna a la derecha. Cuando los números vivían
 * en `caja-graficos.mjs` (`[9, 10, 11, 12, 13]`), correrlas significaba dibujar la curva del saldo
 * como si fuera una barra de impuestos — un gráfico perfecto de otra cosa, que es el modo de falla
 * que este archivo entero trata de evitar.
 */
export const COL_NECESIDAD = Object.freeze({
  dia: 8,
  salidas: Object.freeze(SALIDAS.map((_, i) => 9 + i)),
  saldoCobrando: 9 + SALIDAS.length,
  saldoSinCobrar: 10 + SALIDAS.length,
  // El saldo del plan («si cobra») partido en las dos mitades donde de verdad está la plata: cuánto
  // queda en EFECTIVO y cuánto en BANCO, día por día. Las dos curvas apiladas dan exactamente
  // `saldoCobrando` — son su desglose, no otra cuenta. Ver `saldoEfectivoProyectado` en caja-anexo-series.
  saldoEfectivo: 11 + SALIDAS.length,
  saldoBanco: 12 + SALIDAS.length,
})

/**
 * NÚCLEO PURO: en qué balde cae UN movimiento del libro. La MISMA taxonomía que arma las fórmulas.
 *
 * ═══ POR QUÉ EXISTE UNA SEGUNDA LECTURA, SI EL QUE CUENTA ES EL SHEET ═══
 *
 * Porque una fórmula sólo se puede probar contra sí misma: comparar el texto que genera este archivo
 * contra el texto que espera un test demuestra que el generador no cambió, no que el reparto sea
 * correcto. Esta función aplica el MISMO `SALIDAS` a filas de movimiento de verdad, así que el test
 * puede afirmar en pesos que un día con un pago ejecutado Y deuda pendiente muestra los dos.
 *
 * NO ES UN SEGUNDO CÁLCULO DE PRODUCCIÓN: no la llama ningún generador, y el reparto que aplica sale
 * de la misma constante que las fórmulas. Lo que NO prueba —y hay que decirlo— es que la fórmula
 * escrita en la celda haga esto mismo dentro de Sheets; eso sólo lo prueba mirar la pestaña viva.
 *
 * @param {{signo:number|string, estado?:string, rubro?:string, instrumento?:string}} m
 * @returns {string|null} la clave del balde, o `null` si el movimiento no es una salida
 */
export function baldeDeSalida(m) {
  if (Number(m?.signo) !== -1) return null
  const estado = String(m?.estado ?? '').trim().toUpperCase()
  const rubro = String(m?.rubro ?? '').trim()
  const instrumento = String(m?.instrumento ?? '').trim().toLowerCase()
  const cae = (b) => b.estados.includes(estado)
    && (b.instrumentos?.includes(instrumento) || b.rubros?.includes(rubro) || false)
  // LOS ESPECÍFICOS PRIMERO Y LOS RESIDUALES DESPUÉS, aunque en la pila vayan al revés: si el resto
  // se evaluara en el orden de la lista, «Ya salió» se comería todo y «Proveedores» a los sueldos.
  return SALIDAS.find((b) => !b.resto && cae(b))?.clave
    ?? SALIDAS.find((b) => b.resto && b.estados.includes(estado))?.clave
    ?? null
}

/**
 * NÚCLEO PURO: el reparto de un conjunto de movimientos por balde, más los dos totales que decide
 * el dueño — lo que YA SALIÓ y lo que FALTA PAGAR.
 *
 * `faltaPagar` es el único de los dos que se compara contra el saldo. Ver `saldoSinCobrar`.
 *
 * @param {Array<{signo:number, importe:number, estado?:string, rubro?:string, instrumento?:string}>} movs
 */
export function repartirSalidas(movs = []) {
  const por = Object.fromEntries(SALIDAS.map((b) => [b.clave, 0]))
  for (const m of movs) {
    const clave = baldeDeSalida(m)
    if (!clave) continue
    por[clave] += Math.abs(Number(m.importe) || 0)
  }
  const total = (baldes) => baldes.reduce((a, b) => a + por[b.clave], 0)
  return { por, yaSalio: total(SALIDAS.filter(esEjecutado)), faltaPagar: total([...PENDIENTES]) }
}
