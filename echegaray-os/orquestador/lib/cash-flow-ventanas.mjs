// ¿DE QUÉ VENTANA DE TIEMPO HABLA CADA CIFRA? — el medidor de la regla que el titular no puede violar.
//
// ═══ POR QUÉ EL MAPA SE DERIVA Y NO SE ESCRIBE (29/08/2026, hallazgo de la auditoría) ═══
//
// La primera versión de este archivo enumeraba CUATRO claves a mano. El cuadro tiene OCHENTA Y UNA
// filas, y las 77 restantes —36 aperturas por rubro (`egresoProyectado::Impuestos`), 28 por cliente
// (`cliente::ARCOR::ingresoReal`), los netos y los saldos— quedaban invisibles para el medidor. Con
// eso, una glosa de `YA PASÓ EN EL AÑO` que citara la fila 49 —`resultado`, que es LA mezcla, el
// $(23.136.331) que originó este trabajo— pasaba los 93 tests en verde.
//
// Y el test de completitud era un espejo: comparaba las cuatro claves declaradas contra una copia
// tipeada de esas mismas cuatro. Nunca le preguntaba al cuadro. Es el mismo defecto que ya se bloqueó
// una vez en esta rama (`empareja` contra `CRITERIO_INVERTIDO`): un control validado contra la
// información que él mismo produce.
//
// Ahora lo único declarado son las CUATRO MEDIDAS del cuadro, y la clasificación se deriva de la
// ESTRUCTURA de cada clave: `conceptosDe` las nombra con `::` y cada segmento dice qué es. Una fila
// nueva —un rubro, un cliente— entra clasificada sola; una que no se pueda clasificar se declara
// DESCONOCIDA y `ventanasDe` la trata como si mezclara, que es fallar cerrado: citarla en el titular
// da rojo hasta que alguien decida qué es.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

/** Las dos ventanas. Un hecho no es una promesa, y el titular no puede sumarlos. */
export const YA_PASO = 'ya pasó'
export const PROYECCION = 'proyección'

/**
 * LO ÚNICO QUE SE DECLARA: la ventana de cada una de las cuatro MEDIDAS del cuadro.
 *
 * Todo lo demás sale de acá por la estructura de la clave: `ingresoReal::Cobranzas` es una apertura de
 * `ingresoReal`, y `cliente::ARCOR::egresoProyectado` es la misma medida acotada a un cliente. Que
 * estas cuatro sean EXACTAMENTE las medidas del cuadro lo verifica el test contra `MEDIDAS`.
 */
const VENTANA_DE_LA_MEDIDA = Object.freeze({
  ingresoReal: YA_PASO,
  egresoReal: YA_PASO,
  ingresoProyectado: PROYECCION,
  egresoProyectado: PROYECCION,
})

/**
 * LOS SALDOS NO SON DE NINGUNA VENTANA, Y NO ES UNA EXCEPCIÓN DE CONVENIENCIA.
 *
 * Un saldo es un STOCK: la plata que hay en un instante. No es un flujo, así que no pertenece ni a lo
 * que pasó ni a lo que viene — es el resultado de todo lo anterior mirado en un punto. Por eso la
 * tarjeta `CIERRE PROYECTADO AL 31/12`, que publica `saldoFinal` de diciembre, no "mezcla": publica
 * una sola foto, y la ventana la declara su rótulo (al 31/12) porque es la fecha de la foto, no la de
 * los flujos que la formaron.
 *
 * Si `saldoFinal` estuviera clasificado como proyección, esa tarjeta daría rojo contra sí misma; si
 * estuviera en las dos, también. La distinción flujo/stock es la que hace que el control signifique
 * algo — y es la misma por la que la columna TOTAL no suma los saldos (ver `total: false` en TRONCO).
 */
const STOCKS = new Set(['saldoInicial', 'saldoFinal'])

/** Filas que no publican plata: títulos de sección. No hay ventana que clasificar. */
const SIN_CIFRA = new Set(['tituloPorCliente'])

/**
 * NÚCLEO PURO: a qué ventanas pertenece un concepto del cuadro, por su ESTRUCTURA.
 *
 * @param {string} clave la clave que publica `conceptosDe` (`egresoReal::Impuestos`, `cliente::X::…`)
 * @returns {{ventanas:string[], conocido:boolean}} `conocido:false` = nadie decidió qué es esta fila
 */
export function ventanaDeConcepto(clave) {
  const partes = String(clave ?? '').split('::')
  // (1) LA MEDIDA, esté donde esté el segmento: `ingresoReal::Cobranzas` la lleva adelante y
  // `cliente::ARCOR::ingresoReal` atrás. Un `::Otros` no aporta ventana y no hace falta que aporte.
  const porMedida = [...new Set(partes.map((p) => VENTANA_DE_LA_MEDIDA[p]).filter(Boolean))]
  if (porMedida.length) return { ventanas: porMedida, conocido: true }
  if (STOCKS.has(clave) || SIN_CIFRA.has(clave)) return { ventanas: [], conocido: true }
  // (2) LA CABECERA DE UN CLIENTE (`cliente::ARCOR`, sin tercer segmento) es entra − sale sobre sus
  // cuatro celdas: la misma aritmética que `resultado`, y por eso la misma clasificación.
  if (partes.length === 2 && partes[0] === 'cliente') return { ventanas: [YA_PASO, PROYECCION], conocido: true }
  // (3) TODO LO DEMÁS QUE PUBLICA PLATA ES UN NETO de las cuatro medidas: `resultado` y las dos
  // variaciones, que se calculan sobre él. Pertenecen a las DOS ventanas — que es precisamente lo que
  // hace que citarlas en una tarjeta dé rojo. `resultado` es la mezcla que el dueño rechazó.
  return { ventanas: [YA_PASO, PROYECCION], conocido: NETOS.has(clave) }
}

/** Los netos conocidos. No clasifican: sólo dicen que alguien ya miró esta fila y decidió. */
const NETOS = new Set(['resultado', 'variacionPresupuesto', 'variacionMesAnterior'])

/**
 * NÚCLEO PURO: qué ventanas de tiempo cita una fórmula, mirando a qué filas del cuadro apunta.
 *
 * LAS REFERENCIAS A OTRAS PESTAÑAS SE DESCARTAN PRIMERO. `_MOVIMIENTOS!$A$12` no es la fila 12 de esta
 * vista; sin sacarlas, el titular del Semanal —que filtra el libro por columnas— acusaría ventanas que
 * no cita y el control se volvería ruido que se aprende a ignorar.
 *
 * @param {string} formula la fórmula tal como se escribe en la celda
 * @param {Record<string,number>} fila el mapa clave → nº de fila que cada vista publica en su `meta`
 * @returns {string[]} las ventanas citadas, sin repetir
 */
export function ventanasDe(formula, fila = {}) {
  const local = String(formula ?? '')
    .replace(/(?:'[^']*'|[A-Za-z_]\w*)!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?/g, ' ')
  const out = new Set()
  for (const [clave, f] of Object.entries(fila)) {
    // `\b` al final para que la fila 9 no empareje con la 90: `$N$9)` sí, `$N$90` no.
    if (!f || !new RegExp(`\\$[A-Z]+\\$${f}\\b`).test(local)) continue
    for (const v of ventanaDeConcepto(clave).ventanas) out.add(v)
  }
  return [...out]
}

/** Las claves del cuadro que nadie clasificó. El test de completitud le pregunta a la grilla real. */
export const sinClasificar = (fila = {}) => Object.keys(fila).filter((c) => !ventanaDeConcepto(c).conocido)
