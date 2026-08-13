// LA TAXONOMÍA DE RUBROS DE LAS DOS VISTAS DE CASH FLOW — declarada UNA vez, importada por las dos.
//
//
// ═══ POR QUÉ SE DISCRIMINA (06/08/2026) ═══
//
// "Egresos reales · $118.000.000" contesta cuánto salió y ninguna de las preguntas que siguen: ¿de
// eso, cuánto es nómina y cuánto materiales? ¿el mes que se dispara es por jornales o por impuestos?
// Un subtotal sin apertura obliga a abrir el Libro para decidir cualquier cosa, y entonces el cuadro
// no decide nada.
//
// ═══ LOS NOMBRES SON LOS QUE EMITE EL LIBRO, NO UNA TAXONOMÍA NUEVA ═══
//
// Salen del inventario vivo de `_MOVIMIENTOS`: son exactamente las cadenas que escriben los
// extractores en la columna de rubro. Inventar acá un nombre "más lindo" haría que la sub-línea sume
// cero para siempre sin dar un solo error — el filtro es por igualdad exacta.
//
// ═══ Y POR QUÉ EXISTE "· Otros" ═══
//
// Un rubro que el Libro empiece a emitir mañana y que no esté en estas listas NO puede desaparecer del
// cuadro. "Otros" no se suma: se DESPEJA (subtotal − las sub-líneas listadas), así que cualquier rubro
// nuevo aparece ahí y se ve. Si en cambio el subtotal fuera la suma de las sub-líneas, el rubro nuevo
// se caería del cuadro y el total seguiría cerrando consigo mismo — un cuadro coherente y falso.

import { RUBRO_OBRAS } from './libro-extractores-obras.mjs'

/** Los rubros de INGRESO del libro, en orden de peso. */
export const RUBROS_INGRESO = Object.freeze(['Cobranzas', 'Valores en cartera'])

/** Los rubros de EGRESO del libro, en orden de peso. */
export const RUBROS_EGRESO = Object.freeze([
  'Materiales Civil',
  // ═══ LOS EGRESOS DE LAS OBRAS EN CURSO, CON LÍNEA PROPIA (13/08/2026) ═══
  //
  // El rubro lo emite `libro-extractores-obras.mjs` desde el 07/08 y esta lista no lo nombraba, así
  // que caía entero en "· Otros": $18,9M de materiales, alquileres y combustible de siete obras,
  // visibles en el total pero sin una fila que dijera qué eran. Se importa la constante en vez de
  // repetir la cadena — el filtro del cuadro es por igualdad exacta y un renombre de un solo lado
  // dejaría la fila en cero para siempre sin dar un error.
  //
  // NO SE FUNDE CON "Materiales Civil", que sería la fila donde después aparece su factura. Dos
  // motivos: la mitad de estos egresos no son materiales (alquiler de plataforma, gasoil, nafta), y
  // el que decide necesita ver separado lo que sale de una factura cargada de lo que sale de la
  // explosión de costos que él mismo declaró. El neteo vivo contra Compras impide que se sumen las dos.
  RUBRO_OBRAS,
  'Nómina · Jornales de obra',
  'Nómina · Sueldos administración',
  'Nómina · Cargas sociales',
  'Impuestos',
  'Estructura',
  'Financiero',
  'Nómina · Gremiales',
  'Deuda previsional (planes de pago)',
  'Nómina · SAC',
  'Materiales Mantenimiento',
  'Servicios recurrentes',
  'Cheques emitidos',
  'Cheques y tarjeta sin factura cargada',
])

/** El rótulo del resto. No es un rubro del libro: es lo que queda cuando se restan los que sí lo son. */
export const OTROS = 'Otros'

/**
 * ═══ EL RUBRO QUE NO PUEDE SER REAL (06/08/2026, observación del dueño) ═══
 *
 * *"«Valores en cartera» en Ingresos reales está en cero todos los períodos, no es útil."*
 *
 * Tiene razón y el cero es POR CONSTRUCCIÓN, no por casualidad: un valor en cartera es un cheque que
 * todavía no se acreditó. El día que se acredita, la plata entra al libro por el banco con rubro
 * "Cobranzas" — nunca como un "Valores en cartera" REAL. Una fila condenada a cero en las 53 columnas
 * es peor que una fila ausente: ocupa lugar y enseña a saltear el bloque.
 *
 * NO SE BORRA EL RUBRO, SE BORRA LA FILA BAJO LO REAL. Si mañana el Libro emitiera un
 * "Valores en cartera" con estado REAL, cae en "Ingresos reales · Otros" y SE VE. Sacarlo de la lista
 * de ingresos entera lo habría mandado a netear contra un egreso, que sería mucho peor.
 */
// `Materiales de obra proyectados` entra por la MISMA razón y con el mismo mecanismo: el extractor de
// obras emite sólo PROYECTADO —la factura, cuando llega, entra por Compras con SU rubro— así que su
// fila bajo lo REAL estaría condenada a cero en las 53 columnas. Si mañana el libro emitiera uno REAL
// con este rubro, cae en "Egresos reales · Otros" y SE VE: no se pierde, se hace visible donde molesta.
export const RUBROS_SOLO_PROYECTADO = Object.freeze(['Valores en cartera', RUBRO_OBRAS])

/** Los rubros que abren una medida, según su signo. PURA. */
export const rubrosDeSigno = (signo) => (signo === 1 ? RUBROS_INGRESO : RUBROS_EGRESO)

/**
 * Los rubros que abren una medida, según su signo Y si es la medida de lo YA ocurrido. PURA.
 *
 * Es `rubrosDeSigno` menos lo que no puede ser real. Se separa de aquélla porque `rubrosDeSigno`
 * sigue contestando otra pregunta —"¿de qué lado del cuadro vive este rubro?"— que no depende del
 * estado del movimiento.
 */
export const rubrosDeApertura = (signo, real) =>
  rubrosDeSigno(signo).filter((r) => !(real && RUBROS_SOLO_PROYECTADO.includes(r)))

/**
 * ═══ LAS DEVOLUCIONES: SIGNO DE INGRESO CON RUBRO DE EGRESO (06/08/2026) ═══
 *
 * El dueño, sobre la sub-línea "Ingresos reales · Otros": *"¿Qué sería «Otros» en Ingresos reales? Son
 * valores que no sé dónde encontrar."* Medidos en el Libro ese día: 9 movimientos por $833k — siete
 * notas de crédito de proveedores (DUPEC $531k, Corralón $165k, Ductos $491) y las anulaciones del
 * impuesto al cheque del banco (~$136k, rubro "Financiero").
 *
 * NINGUNA ES UN INGRESO DEL NEGOCIO. Son plata que vuelve porque un egreso se corrigió: mostrarlas
 * como ingreso infla lo que la empresa cobra y deja el egreso de ese rubro más grande de lo que fue.
 * El neto del período era correcto —entraba de los dos lados— pero las dos cifras que se leen para
 * decidir, "cuánto entra" y "cuánto sale", estaban las dos infladas por el mismo importe.
 *
 * Por eso un movimiento que ENTRA con un rubro de EGRESO se trata como lo que es: una devolución que
 * NETEA su propio rubro del lado del egreso.
 *
 * PURA.
 */
export const esDevolucion = (mov = {}) =>
  mov.signo === 1 && RUBROS_EGRESO.includes(mov.rubro)

/**
 * De qué lado del cuadro cae un movimiento: 1 = ingresos, −1 = egresos. PURA.
 *
 * Lo decide el RUBRO antes que el signo, y sólo para el cruce que existe (entra con rubro de egreso).
 * El cruce inverso —sale con rubro de ingreso, un cobro devuelto— NO se invierte a propósito: sale
 * plata, y va al lado de los egresos, donde cae en "· Otros" porque su rubro no está en esa lista.
 */
export const ladoDe = (mov = {}) => (esDevolucion(mov) ? -1 : (mov.signo === 1 ? 1 : -1))

/** La clave de una sub-línea. Lleva la medida adentro: el mismo rubro abre las cuatro. */
export const claveSub = (claveMedida, rubro) => `${claveMedida}::${rubro}`
/** El rótulo de una sub-línea. La sangría es la jerarquía: no hay negrita ni color que la marquen. */
export const rotuloSub = (rubro) => `    · ${rubro}`
