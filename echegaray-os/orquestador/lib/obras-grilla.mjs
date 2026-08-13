// LA PESTAÑA `OBRAS` — TODAS LAS OBRAS DEL AÑO EN UNA SOLA PANTALLA. GRILLA PURA, SIN RED.
//
// QUÉ ES (07/08/2026). El dueño quiere ver el año entero de un vistazo: qué se vendió, qué se cobró,
// qué costó y qué falta desembolsar, obra por obra. Y lo pidió con un estándar explícito: *"No quiero
// una planilla mejor. Quiero que parezca un software de tesorería enterprise construido dentro de
// Google Sheets"* — importes protagonistas, poco texto, mucho aire, jerarquía.
//
// LA TRADUCCIÓN A ESTRUCTURA:
// · Sección 1 — OBRAS DEL AÑO: una fila por cliente con venta / cobrado / pendiente / materiales,
//   TODO fórmula viva sobre Cobranzas y Materiales. Nada tipeado.
// · Sección 2 — OBRAS EN CURSO Y FUTURAS: UNA fila protagonista por obra (venta · cobrado · costo
//   real · pendiente · margen · semáforo ✓/⚠) y el detalle de egresos debajo, indentado y gris.
//   Los ÚNICOS números tipeados de la pestaña son los PROYECTADOS de `obras-datos.mjs` (insumo del
//   dueño) — todo lo demás es fórmula.
//
// LAS REGLAS QUE ESTE ARCHIVO NO ROMPE:
// · Rótulos anclados al TEXTO, nunca a la posición (INDEX/MATCH sobre "TOTAL POR OBRA", no una fila).
// · Fórmulas en locale es-AR: separador `;` — una coma acá es un decimal.
// · Rangos ABIERTOS ($M$5:$M): una fila final tipeada deja de ver lo nuevo sin dar error.
// · Una obra sin fechas se VE pero no se proyecta: sin inicio no hay ventana para medir el real.
//
// ═══ LA VENTA DE UNA OBRA SON TODAS SUS FILAS. NO SE DESCARTA NINGUNA (13/08) ═══
//
// ACÁ VIVIÓ UN DEFECTO Y VALE LA PENA DEJARLO ESCRITO, PORQUE ERA CONVINCENTE. Dos versiones de este
// archivo afirmaron que en Cobranzas convivían "la fila madre" de la obra y su cronograma de
// certificaciones por el mismo importe, y que sumar todo duplicaba la venta. La fórmula descartaba
// entonces las filas que dijeran "Certificaci". Era falso, y lo pagó el archivo real: la pestaña
// publicó $624.243.320 de venta 2026 cuando Cobranzas suma $808.994.353, y mostró Instalación
// Eléctrica con margen NEGATIVO y semáforo ⚠ por comparar el costo entero contra media venta.
//
// LO QUE DICEN LOS DATOS (91 filas de public.cobranzas, verificadas una por una). No existe ninguna
// fila madre: las filas SIN "Certificación" son los ANTICIPOS y su propia columna de orden de compra
// lo dice —"Anticipo inicio obra 50% $ 47.590.272"—, mientras las certificaciones dicen "Resto 50%
// s/ total 47.590.272". Anticipo + certificaciones = 100% del contrato, y ninguna repite a otra.
//
// POR QUÉ ENGAÑABA: como el reparto es 50/50, la suma de los anticipos da EXACTAMENTE igual que la de
// las certificaciones. Dos números idénticos parecen un duplicado. Lo son sólo si uno mira los
// importes y no el concepto — que es justo lo que pasó, y encima quedó escrito como premisa para el
// que viniera después. Un comentario del código no es evidencia de nada: la evidencia es el dato.
//
// LA REGLA HOY: venta = TODAS las filas del cliente/obra, sin descartar por concepto. Lo único que se
// excluye es el estado CANCELAR, que es una venta que dejó de existir, no una fila repetida.
//
// ═══ LOS CLIENTES SE DERIVAN DE COBRANZAS Y SE MATCHEAN EXACTO (13/08) ═══
//
// La lista de clientes estuvo TIPEADA acá, y el dueño lo cazó mirando la pestaña: *"la fila 'otros
// clientes' no puede ser, estan todos los clientes y obras declarados"*. Con la lista escrita a mano,
// todo cliente que no estuviera en ella caía en un cajón anónimo — eran tres reales y cobrados: LIRIO
// DANIEL RAMIRO $17.303.000, ADDATO $2.500.000, MACRO CONSTRUCCIONES SRL $135.520. Una lista tipeada
// garantiza que el cuadro quede incompleto cada vez que la empresa factura a alguien nuevo.
//
// Ahora el escritor los LEE de Cobranzas (`clientesDeCobranzas`) y el rótulo ES el texto del archivo.
// Eso permitió pasar de match por prefijo a match EXACTO: el prefijo existía sólo para salvar el
// desfase entre la lista tipeada ("LA ESTRELLA") y el archivo ("LA ESTRELLA /ALIMENTOS DEL SUR SAS"),
// y traía un riesgo propio —"MESSINA" se llevaría las filas de un futuro "MESSINA SRL" sin dar error—.
// Con match exacto eso no puede pasar nunca.
//
// LO QUE SE DERIVA ES QUÉ CLIENTES EXISTEN; CÓMO SE AGRUPAN SIGUE SIENDO DECISIÓN DECLARADA. Las
// variantes de `ALIAS_CLIENTE` colapsan en su canónico: si no, "IMOTOR/San Francisco/JAVI SANCHEZ"
// volvería a abrir fila propia, que es exactamente lo que el dueño mandó unificar.
//
// Y LA FILA DE RESIDUO NO SE BORRA: queda, y tiene que dar $0. Es el control que prueba que no falta
// nadie. Si algún día vuelve a tener monto, apareció un cliente que el mecanismo no supo ubicar.
// Borrar un control porque hoy da cero es como se pierde la capacidad de detectar el problema.
//
// ═══ QUÉ COLUMNA SE USA PARA QUÉ: EL IVA NO ES VENTA (13/08) ═══
//
// Cobranzas tiene el neto (col "Monto neto") y el total con IVA (col "TOTAL a cobrar"). Usar el total
// como venta infló Playón de Azufre a $116.150.000 sobre un contrato de $102.500.000: los
// $13.650.000 de diferencia son el IVA de la parte blanca, que se cobra y se rinde — no es ingreso.
// Peor todavía, las obras en negro no tienen IVA, así que la misma columna comparaba peras con
// manzanas y sobrestimaba el margen SÓLO de las blancas.
//
//   · VENTA y MARGEN      → el NETO.  Es lo que la empresa gana.
//   · COBRADO y RESTA     → el TOTAL. Es la plata que entra por la puerta.
//
// Las dos son ciertas y miden cosas distintas; por eso los rótulos lo dicen y no hay que adivinarlo.
//
// PERO EL RÓTULO NO PUEDE DECIR "c/IVA" (13/08, corrección del dueño): *"no todas las obras llevan
// iva en su totalidad, si dice N es negro sin iva, si dice B es blanco con iva"*. La categoría es por
// FILA (col B), no por obra: las 34 filas N no tienen un peso de IVA —verificado: 0 de 34— así que
// las cuatro obras de San Francisco salían rotuladas "c/IVA" sin llevar nada. Los números estaban
// bien (la col M ya trae el total real de cada fila); lo falso era lo que la pestaña AFIRMABA. Un
// rótulo que miente en la mitad de las filas hace desconfiar de la pestaña entera.
//
// Y UNA OBRA PUEDE ESTAR PARTIDA: Playón es blanco $65.000.000 + negro $37.500.000. Por eso su resta
// a cobrar ($116.150.000) es mayor que su venta neta ($102.500.000) — la diferencia es el IVA de la
// parte blanca, y nada más. Esa composición se publica en la glosa SÓLO cuando la obra es mixta,
// porque es justo la pregunta que dispara ese número; en las otras seis sería ruido.
//
// ═══ QUÉ ES CADA COLUMNA DE COBRANZAS, MEDIDO CONTRA LAS 91 FILAS (13/08) ═══
//
// El "TOTAL a cobrar" (col M) NO es un saldo pendiente: es el importe que el cliente efectivamente
// transfiere. Se verificó por descarte: si fuera saldo, las 46 filas en estado Cobrado tendrían ~0, y
// suman $451.507.276 — el mismo número que `sync-cobranzas` reporta por su cuenta.
//
// ⚠ Y **M NO SE DERIVA DE J y K**. La identidad `total = neto + IVA − retenciones` se cumple en 90 de
// las 91 filas, y por eso parece una regla — pero no lo es. MESSINA "PILON - Anticipo" tiene neto
// $2.330.000 sin IVA y total $9.030.000, y el dueño lo declaró textual el 13/08: *"no hay nada mal
// tipeado"*. Son COLUMNAS INDEPENDIENTES de la fuente. Nunca se calcula una a partir de la otra, y no
// se agrega un control que valide esa identidad: marcaría en rojo una fila correcta, y un control que
// grita sobre lo que está bien se ignora y arrastra a los que sirven. Se LEE la columna que
// corresponde: J para venta y margen, M para cobrado y resta.
//
// POR ESO "LO QUE RESTA COBRAR" NO SE LEE DE UNA COLUMNA: sale del ESTADO. Resta = todo lo que no
// está Cobrado ni CANCELAR. Leerlo de M daría el contrato entero como pendiente.
//
// ═══ POR QUÉ NO UNA TABLA DINÁMICA ═══
//
// El dueño preguntó si una pivot resolvía esto. No, y no es por gusto: una pivot es un objeto que
// vive FUERA de la grilla. Ningún generador la controla, no se versiona, no se testea y nadie la ve
// romperse — este repo ya pagó ese caso exacto: una pivot huérfana en el Flujo de Fondos duplicaba
// Proveedores en silencio. Todo lo que el dueño pidió (cobrado, resta, próxima fecha, forma, el
// detalle por obra) sale de SUMIFS/MINIFS/TEXTJOIN sobre Cobranzas: fórmulas vivas, versionadas, que
// el generador escribe y los tests verifican. No encontré nada que la pivot resuelva y la fórmula no.

import { VACIO } from './preservar-anotaciones.mjs'
import { conColaLimpiable as colaDeclarada } from './cola-de-rango.mjs'
import { esProyectable } from './obras-datos.mjs'
import { sumaNetaSheet, esMaterialSheet } from './costo-materiales.mjs'
import { sumaConUSD } from './cobranzas-contrato.mjs'
// EL TIPO DE CAMBIO SE IMPORTA, NO SE ESCRIBE DE NUEVO. Vive UNA vez, en el bloque de CAJA, y esta
// pestaña lo referencia por su nombre: un segundo tipo de cambio sería una segunda verdad para el
// mismo concepto, que es justo lo que la REALIDAD ÚNICA prohíbe.
import { RANGO_TC } from './caja-disponibilidades.mjs'

export const PESTANA_OBRAS = 'OBRAS'

/**
 * A rótulo · B % cobrado (S1) | % contrato (S2) · C venta · D cobrado · E resta · F vencido ·
 * G materiales|pendiente · H retenido (S1) | próx. cobro (S2) · I saldo de contrato (S2).
 *
 * ERAN NUEVE. LA NOVENA ERA LA GLOSA Y EL DUEÑO LA MANDÓ SACAR (13/08): *"la columna i en obras
 * ensucia con esa informacion, sacala"*. En Playón y Quattropani ocupaba siete y ocho renglones de
 * prosa que competían con los importes por la atención — lo contrario del estándar que pide:
 * *"minimalismo = less is more, world class = como se usaría en JP Morgan"*. El dato ES el diseño.
 *
 * NO SE MUDÓ A OTRA COLUMNA —eso sería mover la basura de lugar—. El proveedor pasó al rótulo de su
 * fila, que es donde se identifica una fila; las cuotas quedaron en una marca (`×3`); el resto no
 * está. El criterio para cada elemento fue uno: ¿esto cambia una decisión?
 *
 * ═══ LO QUE ENTRÓ POR EL MODELO DEL DUEÑO (13/08) — Y SIN AGREGAR NI UNA COLUMNA ═══
 *
 * El dueño señaló un archivo propio ("CONTROL DE GASTOS.xlsx", una hoja por cliente) y dijo cómo
 * quiere que se trabaje acá. Cada hoja de ese archivo tiene la misma gramática: la obra con su
 * contrato, debajo un renglón por hito con `% FACTURADO`, `ESTADO`, `Fecha de COBRO`, las tres
 * retenciones (Ganancias · IIBB · LH) y `Libre Disponibilidad` = neto − retenciones, y al cierre el
 * `SALDO PENDIENTE`. Esta pestaña es un AGREGADO, no un libro de hitos, así que se tradujo:
 *
 *   · `% FACTURADO`          → la columna B, en percibido: qué proporción de la cartera ya entró.
 *   · las tres retenciones   → una sola columna `Retenido` (Cobranzas ya trae el total en su col L).
 *   · `Libre Disponibilidad` → ya estaba y nadie lo decía: el "TOTAL a cobrar" de Cobranzas es NETO
 *                              DE RETENCIONES, o sea la plata que entra a la cuenta.
 *   · `ESTADO` / `Fecha de COBRO` / forma → ya vivían repartidos en Resta, Vencido y Próx. cobro.
 *
 * ═══ EL `SALDO PENDIENTE` YA SE PUEDE CALCULAR: EL CONTRATO ESTABA EN COBRANZAS (13/08) ═══
 *
 * Esta misma nota declaraba, hasta hoy, que el `SALDO PENDIENTE` del modelo *"no se puede calcular
 * sin inventarlo"* porque el contrato no existía como dato. Se le preguntó al dueño si quería
 * declararlo y contestó: *"ya tenes todo lo necesario en pestaña cobranzas"*. La columna ORDEN DE
 * COMPRA lo dice fila por fila ("Resto 50% s/ total 47.590.272"), y `cobranzas-contrato.mjs` lo lee.
 *
 * ENTRÓ UNA SOLA COLUMNA, LA `I` — que es además la que este generador ya había tenido y borrado, así
 * que no ensancha su huella:
 *
 *   · `SALDO PENDIENTE` del modelo → `I · Saldo contrato` = contrato − venta cargada. Es el número
 *     que el dueño no podía ver: si da POSITIVO hay hitos del contrato que todavía no son fila en
 *     Cobranzas, o sea plata vendida que no está en ninguna proyección de cobro. Si da NEGATIVO se
 *     facturó por encima del contrato (adicionales, materiales con margen) — se publica con su signo
 *     y no se recorta con un MAX(0): recortarlo escondería justo el caso que hay que mirar.
 *   · `% FACTURADO` del modelo → la `B` de la Sección 2 pasa de cartera a CONTRATO (venta/contrato).
 *     Es lo que el dueño pidió ("el % como avance de contrato, no de cartera") y las dos magnitudes
 *     son del mismo criterio: el contrato se declara al NETO —verificado, los hitos de las 6 obras
 *     suman exactamente su contrato— y la venta también.
 *
 * LA `B` DE LA SECCIÓN 1 NO CAMBIA: un cliente no tiene contrato (tiene obras, y además trabajos
 * fuera de ellas), así que ahí sigue midiendo la cartera cobrada. Es la misma gramática que ya usan
 * la `G` y la `H`, que también significan cosas distintas en cada sección y lo declaran en su
 * encabezado.
 */
export const ANCHO_OBRAS = 9

/**
 * EL ANCHO MÁS GRANDE QUE ESTE GENERADOR TUVO ALGUNA VEZ.
 *
 * POR QUÉ EXISTE (13/08). Al pasar de 9 a 8 columnas, la novena quedó EN EL ARCHIVO con el contenido
 * de la corrida anterior: 40 celdas de glosa a la derecha de H, y encima corridas de fila porque la
 * grilla creció de 61 a 62 — el detalle de cobranzas de una obra terminó pegado al encabezado de la
 * Sección 2. Sacar una columna del código no la saca de la pestaña: hay que BORRARLA.
 *
 * La cola se limpia hasta acá y NO hasta el ancho de la hoja: más allá de la 9 nunca escribió este
 * generador, y rellenar a ciegas hasta el borde ya borró 14 fechas del dueño una vez.
 */
export const ANCHO_HISTORICO = 9

/**
 * EL ALTO MÁS GRANDE QUE ESTA GRILLA TUVO. El mismo razonamiento que el ancho, en el otro eje.
 *
 * POR QUÉ (13/08). Arreglé la cola de columnas y no la de filas: la grilla bajó de 62 a 61 y la vieja
 * fila 62 quedó escrita, así que el PDF mostró DOS VECES "Otros trabajos…", con valores distintos y
 * corridos de columna. El generador es dueño de todo su RANGO, y un rango tiene dos ejes.
 *
 * Se limpia hasta acá y no hasta el fondo de la hoja, por lo mismo que el ancho: más abajo nunca
 * escribió este generador. Y si la grilla lo supera, `conColaLimpiable` ROMPE en vez de dejar cola
 * silenciosa — la constante se sube a mano, que es la única forma de que siga significando algo.
 */
export const ALTO_HISTORICO = 62

/**
 * LAS FILAS CON SU COLA LIMPIABLE: cada una llega hasta `hasta` con el centinela VACIO, que significa
 * "esta celda es mía y va vacía" — así la fusión la limpia en vez de conservar lo de la corrida vieja.
 *
 * El mecanismo vive en `cola-de-rango.mjs` desde el 13/08: era el mismo bucle en cinco generadores con
 * cinco variantes, y otros ocho sin él. Acá quedan sólo los DOS NÚMEROS de esta pestaña.
 */
export function conColaLimpiable(filas = [], hasta = ANCHO_HISTORICO, alto = ALTO_HISTORICO) {
  return colaDeclarada(filas, { ancho: hasta, alto, quien: 'obras-grilla' })
}

/** Anchos en píxeles — los importes con aire, la prosa angosta y al final (estándar del dueño). La
 *  columna A NO se declara acá: la calcula `anchoColumnaA` a partir de los rótulos que se emiten.
 *  La B pasó de 44 a 60 px cuando dejó de tener un glifo (✓/⚠) y pasó a tener un número: "100,0%"
 *  son seis caracteres y con CLIP en toda la hoja lo que no entra no se derrama, DESAPARECE. */
export const ANCHOS_OBRAS = [300, 60, 138, 138, 138, 138, 138, 150, 138]

/** Lo que Sheets muestra cuando una fórmula no evalúa. Publicar uno es peor que no escribir. */
export const ERRORES_SHEET = Object.freeze(['#ERROR!', '#REF!', '#VALUE!', '#NAME?', '#N/A', '#DIV/0!', '#NUM!', '#NULL!'])

/**
 * LAS CELDAS QUE QUEDARON EN ERROR EN LO YA PUBLICADO.
 *
 * POR QUÉ EXISTE (13/08). La pestaña publicó `#ERROR!` en las 7 obras y ningún test lo vio: los tests
 * comparaban el texto que el generador emite contra el texto que el generador espera — las dos puntas
 * del mismo lado. Lo que Sheets EVALÚA sólo lo dice Sheets. Por eso el escritor relee lo que dejó y
 * aborta declarando: la evidencia es del efecto, no del intento.
 *
 * @param {Array<Array>} filas lo leído del destino, con los valores ya renderizados.
 * @returns {Array<{ref:string, valor:string}>} referencia A1 y el error, para poder ir a mirarlo.
 */
export function celdasEnError(filas = []) {
  const malas = []
  for (const [i, fila] of (filas ?? []).entries()) {
    for (const [c, v] of (fila ?? []).entries()) {
      const t = String(v ?? '').trim()
      if (ERRORES_SHEET.includes(t)) malas.push({ ref: `${letraDe(c)}${i + 1}`, valor: t })
    }
  }
  return malas
}
const letraDe = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

/**
 * COLUMNAS QUE SALIERON DESPAREJAS: el generador puso fórmula en TODAS las obras y el archivo
 * devolvió valor en algunas y VACÍO en otras.
 *
 * POR QUÉ EXISTE (13/08). `Próx. cobro` se publicó en blanco en 4 de las 7 obras y nada gritó: un
 * vacío no es `#ERROR!`, así que la relectura lo dejaba pasar. Y un vacío MIENTE más que un error —
 * se lee como "no hay nada que cobrar" cuando había $8,7M para el 19/08.
 *
 * El criterio es la DESPAREJA, no el vacío: si la columna sale vacía en todas, puede ser legítimo
 * (nadie tiene nada pendiente); si sale llena en unas y vacía en otras, alguna fórmula se rompió en
 * silencio. Puede haber un falso positivo real —una obra íntegramente cobrada no tiene próxima
 * fecha—; cuesta una corrida y un vistazo, y la alternativa ya costó cuatro obras publicadas en
 * blanco.
 *
 * @param {Array<Array>} grid lo que el generador escribió · @param {Array<Array>} publicado lo releído
 * @param {number[]} filas las filas 1-based que tienen que comportarse igual (las protagonistas)
 */
export function columnasDesparejas(grid = [], publicado = [], filas = []) {
  const vacio = (v) => String(v ?? '').trim() === ''
  const fuera = []
  for (let c = 0; c < ANCHO_OBRAS; c++) {
    const conFormula = filas.filter((f) => typeof grid[f - 1]?.[c] === 'string' && String(grid[f - 1][c]).startsWith('='))
    if (conFormula.length !== filas.length || !filas.length) continue
    const vacias = conFormula.filter((f) => vacio(publicado[f - 1]?.[c]))
    if (vacias.length && vacias.length < conFormula.length) {
      fuera.push({ columna: letraDe(c), filas: vacias, de: conFormula.length })
    }
  }
  return fuera
}

/**
 * ¿ESTA FÓRMULA PARSEA? Paréntesis balanceados y comillas cerradas.
 *
 * Sheets no evalúa una fórmula que no parsea: la muestra como `#ERROR!`. Es exactamente lo que pasó
 * con la próxima fecha de cobro, que cerraba un paréntesis de más — y se publicó en las 7 obras.
 *
 * @returns {string|null} el motivo, o null si está sana.
 */
export function problemaDeSintaxis(formula) {
  // ═══ UNA VARIABLE ROTA INTERPOLADA EN EL STRING (13/08) ═══
  //
  // Esto se publicó: `'Cobranzas'!$undefined$5:$undefined`. Parsea PERFECTO —paréntesis balanceados,
  // comillas cerradas— y sólo revienta cuando Sheets busca una columna que no existe: 40 celdas con
  // #ERROR! en el archivo del dueño. Contar paréntesis no podía verlo.
  //
  // Va PRIMERO y es una línea, pero ataca toda la familia: cualquier `${x}` que llegue vacío deja su
  // firma en el texto. Ninguna fórmula legítima de esta pestaña dice "undefined", "null" ni "NaN", y
  // un `$$` sólo aparece si una letra de columna llegó vacía entre los dos anclajes.
  const roto = /undefined|null|NaN|\$\$/.exec(String(formula))
  if (roto) return `interpoló "${roto[0]}": una variable llegó vacía al armar la fórmula`

  let nivel = 0
  let comilla = false
  for (const ch of String(formula)) {
    if (ch === '"') { comilla = !comilla; continue }
    if (comilla) continue
    if (ch === '(') nivel++
    if (ch === ')' && --nivel < 0) return 'cierra un paréntesis que nunca abrió'
  }
  if (comilla) return 'una comilla quedó sin cerrar'
  if (nivel > 0) return `quedan ${nivel} paréntesis sin cerrar`
  return null
}

/**
 * PÍXELES QUE OCUPA UN TEXTO EN LA COLUMNA A.
 *
 * El factor sale de MEDIR el corte real en el PDF del 13/08, no de una tabla teórica: con la columna
 * en 300px, el título de 36 caracteres se cortó a los 29 → ≈10,3 px por carácter a 13pt bold. De ahí
 * el 0,80 del tamaño para negrita y 0,70 para el resto, redondeando para arriba.
 */
export const pxDeTexto = (texto, { tam, bold }) => Math.ceil(String(texto).length * tam * (bold ? 0.80 : 0.70))

/**
 * EL ANCHO DE LA COLUMNA A, DERIVADO DE LO QUE LA GRILLA EMITE.
 *
 * POR QUÉ NO ES UN NÚMERO FIJO (13/08). Con 300px fijos el PDF cortaba los títulos a mitad de palabra
 * —"2.7 · Quattropani - Melisa García SAS — SALÓN" sin "COMERCIAL"—, y no lo atrapaba ningún test
 * porque ningún test miraba el ancho. El estilo de la casa pone `wrapStrategy: CLIP` en toda la hoja,
 * así que un rótulo más largo que su columna NO se derrama: desaparece. El título de una obra cortado
 * al medio es lo primero que se lee en una pestaña que quiere parecer software de tesorería.
 *
 * La fila 2 se excluye a propósito: es el subtítulo, va con WRAP y su largo no debe ensanchar nada.
 */
export function anchoColumnaA(g, { minimo = 300, padding = 18 } = {}) {
  const grandes = new Set([...(g.protagonistas ?? []), ...(g.totales ?? [])])
  let px = minimo - padding
  ;(g.filas ?? []).forEach((fila, i) => {
    const t = fila?.[0] === VACIO ? '' : String(fila?.[0] ?? '')
    const n = i + 1
    if (!t || n === 2) return
    const estilo = n === 1 ? { tam: 13, bold: true }
      : (grandes.has(n) || /^\d · /.test(t) || /^⇒/.test(t)) ? { tam: 10, bold: true }
        : { tam: 9, bold: false }
    px = Math.max(px, pxDeTexto(t, estilo))
  })
  return px + padding
}

/**
 * CLIENTES DE MUESTRA — SÓLO PARA EL ENSAYO EN SECO. NO es la lista del año.
 *
 * La lista real se DERIVA de Cobranzas en cada corrida (`clientesDeCobranzas`). Esta constante existe
 * únicamente para que `--dry` pueda dibujar la forma de la pestaña sin red, y está declarada como
 * muestra justamente para que nadie la vuelva a tratar como la verdad.
 */
export const CLIENTES_MUESTRA = [
  'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'San Francisco', 'MESSINA', 'ARCOR',
  'Quattropani - Melisa García SAS', 'LIRIO DANIEL RAMIRO', 'ADDATO', 'MACRO CONSTRUCCIONES SRL',
]

/**
 * LOS CLIENTES DEL AÑO, DERIVADOS DE COBRANZAS. La lista no se tipea: se lee.
 *
 * POR QUÉ (13/08, pedido del dueño): *"la fila 'otros clientes' en pestaña 'obras' no puede ser,
 * estan todos los clientes y obras declarados, busca y empareja"*. Tenía razón, y el defecto era de
 * mecanismo: la lista estaba escrita en el código, así que TODO cliente que no estuviera en ella caía
 * en un cajón anónimo —LIRIO DANIEL RAMIRO $17.303.000, ADDATO $2.500.000, MACRO $135.520, todos
 * reales y todos cobrados—. Una lista tipeada garantiza que el cuadro quede incompleto cada vez que
 * la empresa factura a alguien nuevo, y que nadie se entere.
 *
 * LO QUE SE DERIVA ES QUÉ CLIENTES EXISTEN; CÓMO SE AGRUPAN SIGUE SIENDO DECISIÓN DECLARADA. Las
 * variantes de `ALIAS_CLIENTE` colapsan en su canónico —si no, "IMOTOR/San Francisco/JAVI SANCHEZ"
 * volvería a abrir fila propia, que es justo lo que el dueño mandó unificar.
 *
 * @param {Array} valores la columna "Obra / Cliente" tal como se leyó, de la primera fila de datos.
 * @returns {string[]} los canónicos, sin repetir, en el orden en que aparecen en el archivo.
 */
export function clientesDeCobranzas(valores = [], alias = ALIAS_CLIENTE) {
  const canonDe = new Map()
  for (const [canon, variantes] of Object.entries(alias)) for (const v of variantes) canonDe.set(v, canon)
  const vistos = new Set()
  const orden = []
  for (const crudo of valores) {
    const t = String(Array.isArray(crudo) ? crudo[0] : crudo ?? '').trim()
    if (!t) continue
    const canon = canonDe.get(t) ?? t
    if (vistos.has(canon)) continue
    vistos.add(canon)
    orden.push(canon)
  }
  return orden
}

/**
 * Las columnas de Cobranzas / Compras / Materiales que la grilla cita. Son el DEFECTO para construir
 * en frío; el escritor (`scripts/obras-pestana.mjs`) las resuelve contra el encabezado REAL por
 * rótulo — nunca por letra fija — y falla cerrado si un rótulo no está.
 */
export const REFS_OBRAS = {
  // `retenciones` es la col L de Cobranzas ("Retenciones / descuentos"): el TOTAL retenido de la
  // fila. El archivo también trae el desglose (Ganancias, IIBB, el 16,8%) en tres columnas propias
  // más a la derecha; acá se cita el total porque la pestaña publica un solo número por cliente y
  // sumar tres columnas para llegar al mismo importe sería una segunda definición del concepto.
  // `moneda` es la col AA: casi siempre vacía (pesos) y "USD" en la fila del anticipo en dólares de
  // Quattropani. Toda suma de esta pestaña la cita — ver `sumaConUSD`.
  cob: { hoja: 'Cobranzas', cliente: 'G', concepto: 'I', neto: 'J', total: 'M', retenciones: 'L', estado: 'O', fechaCobro: 'Q', fechaVenta: 'P', forma: 'N', categoria: 'B', oc: 'H', moneda: 'AA', desde: 5 },
  // `neto` es la columna "Importe" (M = Total − IVA). El costo se mide ahí, no en "Total" (O): la
  // venta ya se mide al neto, y comparar venta neta contra costo con IVA castigaba el margen ~21% en
  // todo lo que se compra en blanco. Neto contra neto. El IVA de compras es crédito fiscal, no costo.
  cmp: { hoja: 'Compras', fecha: 'C', proveedor: 'E', cliente: 'J', neto: 'M', iva: 'N', total: 'O', familia: 'AE', desde: 4 },
  mat: { hoja: 'Materiales', filaTotal: 'TOTAL POR OBRA', filaCabecera: '2 · POR OBRA' },
}

/** El serial de Sheets de una fecha ISO (base 30/12/1899). Es como se ESCRIBE una fecha tipeada. */
export const serialISO = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

/**
 * UN RANGO ABIERTO DE UNA FUENTE — Y LA GUARDA QUE HACE IMPOSIBLE LA CLASE DE DEFECTO QUE ROMPIÓ LA
 * PESTAÑA PUBLICADA (13/08).
 *
 * QUÉ PASÓ. La grilla empezó a usar la Orden de Compra (`oc`) para reconocer una obra, pero el
 * escritor nunca agregó ese rótulo a su `resolverColumnas`. En frío no se notaba —`--dry` usa las
 * columnas por DEFECTO de REFS_OBRAS, que sí la tienen—, pero contra el archivo vivo `refs.cob.oc`
 * llegaba `undefined` y cada fórmula salía como `'Cobranzas'!$undefined$5:$undefined`. Eso no es un
 * paréntesis mal cerrado: PARSEA distinto y Sheets lo rechaza al evaluar. 40 celdas con `#ERROR!` en
 * la cara del dueño, y el contador de paréntesis no podía verlo.
 *
 * POR QUÉ LA GUARDA VA ACÁ Y NO EN EL ESCRITOR. Acá pasa TODA referencia a una fuente, de cualquier
 * campo y de cualquier hoja. Una lista de campos obligatorios en el escritor habría que acordarse de
 * actualizarla cada vez que la grilla usa una columna nueva — o sea, el mismo olvido otra vez. Así el
 * desajuste entre lo que la grilla CONSUME y lo que el escritor RESUELVE es imposible: la grilla ni
 * siquiera se construye, y el escritor aborta ANTES de tocar el archivo.
 */
const abierto = (c, campo) => {
  const col = c?.[campo]
  if (!col || !c?.hoja || !c?.desde) {
    throw new Error(`obras-grilla: la columna "${campo}" de ${c?.hoja ?? '(hoja sin nombre)'} no está resuelta`
      + ' — el escritor tiene que buscarla por su rótulo. NO se construye la grilla con una referencia rota.')
  }
  return `'${c.hoja}'!$${col}$${c.desde}:$${col}`
}

/** Un literal de texto para una fórmula. Ninguno de los textos de esta pestaña lleva comillas
 *  adentro; si algún día llevara, `problemaDeSintaxis` lo caza antes de escribir. */
const quote = (t) => `"${t}"`

/** El estado que saca una fila de la venta: cancelada, no vendida. Es lo ÚNICO que se descarta. */
const NO_VENTA = 'CANCELAR'

/** El año que la pestaña declara en su rótulo. La ventana no se deduce: se escribe. */
export const ANO = 2026

/**
 * LA VENTANA DEL AÑO — porque el rótulo dice "⇒ TOTAL 2026" y hasta ahora era toda la pestaña.
 *
 * Sin ventana, el total incluía una venta con fecha 15/12/2025 ($15.000.000, IMOTOR) y la primera
 * fila de 2027 lo iba a empeorar sin un solo error. Un rótulo que afirma un filtro que no existe es
 * una mentira con formato de dato.
 *
 * LA VENTA SE ACOTA POR SU FECHA DE VENTA Y EL COBRO POR LA DE COBRO, no por una sola fecha para
 * todo: son criterios distintos —devengado y percibido— y esa misma fila lo muestra, vendida el
 * 15/12/2025 y cobrada el 15/01/2026. Mezclarlos en una sola ventana rompería una de las dos.
 */
const enElAno = (c, campo) => `;${abierto(c, campo)};">="&${serialISO(`${ANO}-01-01`)};${abierto(c, campo)};"<="&${serialISO(`${ANO}-12-31`)}`

/**
 * EL COSTO NETO DE MATERIALES DE UN CLIENTE.
 *
 * ANTES ESTA COLUMNA LEÍA `TOTAL POR OBRA` DE LA PESTAÑA MATERIALES, que la armaba con "Total" (O,
 * con IVA): publicaba $251.440.609 donde el criterio declarado por esta misma pestaña da
 * $165.196.937 — $86.243.672 de más en la fila de al lado de "Venta (neto)". Se pasó a calcularla
 * desde la FUENTE, y ahí quedó el defecto de fondo: las dos pestañas seguían midiendo distinto.
 *
 * EL CRITERIO YA NO VIVE ACÁ (13/08/2026). Está en `lib/costo-materiales.mjs`, y la pestaña
 * Materiales emite la MISMA función. El dueño: *"el mismo concepto de materiales sea familia o
 * individual no pueden diferir de ninguna manera"* — con la regla escrita dos veces eso no se puede
 * garantizar, sólo prometer.
 */
function costoNeto(cmp, cliente) {
  // SÓLO MATERIALES, no todo el costo del cliente. La columna era "Materiales (real)" y al calcularla
  // desde Compras la había convertido en el costo entero —$155,0M donde había $147,8M para LA
  // ESTRELLA—: un cambio que el dueño no pidió. El universo lo define `esMaterialSheet`.
  const porCliente = `${abierto(cmp, 'cliente')};"${nombreEnCostos(cliente)}";${esMaterialSheet(abierto(cmp, 'familia'))}`
  return `=${sumaNetaSheet({
    neto: abierto(cmp, 'neto'), iva: abierto(cmp, 'iva'), total: abierto(cmp, 'total'), criterios: porCliente,
  })}`
}

/** El estado de una fila ya cobrada. Todo lo demás que no sea CANCELAR es lo que resta cobrar. */
const COBRADO = 'Cobrado'


/**
 * EL CRITERIO DE UN CLIENTE: SU TEXTO EXACTO.
 *
 * Antes era un prefijo (`"San Francisco*"`), porque la lista tipeada decía "LA ESTRELLA" y el archivo
 * "LA ESTRELLA /ALIMENTOS DEL SUR SAS". Al derivar los nombres de Cobranzas ese desfase desaparece
 * —el rótulo ES el texto del archivo— y el prefijo pasa a ser un riesgo puro: bastaría que existiera
 * "MESSINA" y "MESSINA SRL" para que la primera se llevara las filas de la segunda, sin dar error.
 * Hoy no hay ninguna colisión de prefijo en el archivo; con match exacto no puede haberla nunca.
 */
export const criterioCliente = (texto) => `${texto}`

/**
 * LAS VARIANTES CON QUE UN CLIENTE APARECE EN COBRANZAS. Decisión del DUEÑO, no inferencia.
 *
 * 13/08, textual: *"si es san francisco, imotor"* — la fila "IMOTOR/San Francisco/JAVI SANCHEZ" ES
 * San Francisco (IMOTOR es la obra). Va acá y no como un comodín más ancho: aflojar el match para que
 * entre este caso volvería a mezclar los clientes que acabamos de separar. El mapa deja la decisión
 * escrita y auditable fila por fila.
 */
export const ALIAS_CLIENTE = Object.freeze({
  'San Francisco': ['IMOTOR/San Francisco/JAVI SANCHEZ'],
})

/**
 * EL MISMO CLIENTE SE ESCRIBE DISTINTO EN CADA FUENTE. ACÁ SE DECLARA LA TRADUCCIÓN.
 *
 * Cobranzas dice "LA ESTRELLA /ALIMENTOS DEL SUR SAS"; Compras y Materiales dicen "LA ESTRELLA" a
 * secas (verificado: 295 comprobantes por $103.854.407 bajo ese nombre). Como el rótulo de la fila se
 * DERIVA de Cobranzas, buscarlo tal cual en Materiales no encontraba nada y la celda quedaba en "—":
 * $147.827.124 del cliente más grande del año desaparecieron del cuadro sin un solo error.
 *
 * Es el mismo problema que `ALIAS_CLIENTE`, del otro lado, y por eso NO se mezclan en el mismo mapa:
 * `ALIAS_CLIENTE` dice qué variantes DENTRO de Cobranzas son el mismo cliente; éste dice cómo se
 * llama ese cliente EN OTRA FUENTE. Confundirlos haría que agrupar por un lado cambie la búsqueda
 * por el otro. Lo que no está acá se busca con su propio nombre, que es lo correcto para los siete
 * clientes restantes — verificado uno por uno contra `costos_obra`.
 */
export const NOMBRE_EN_COSTOS = Object.freeze({
  'LA ESTRELLA /ALIMENTOS DEL SUR SAS': 'LA ESTRELLA',
})

/** Cómo se llama este cliente en Compras / Materiales. */
export const nombreEnCostos = (cliente) => NOMBRE_EN_COSTOS[cliente] ?? cliente

/** El canónico y sus variantes declaradas. Cada una se ancla al prefijo por separado. */
export const variantesDe = (cliente) => [cliente, ...(ALIAS_CLIENTE[cliente] ?? [])]

/**
 * UNA SUMA SOBRE COBRANZAS PARA UN CLIENTE Y SUS ALIAS.
 *
 * Se emite un SUMIFS por variante y se suman: SUMIFS no sabe hacer OR, y la alternativa —un comodín
 * que abarque las dos— es justo lo que mezclaba clientes distintos.
 *
 * @param {string} campo cuál importe se suma: `neto` (venta y margen) o `total` (plata que entra).
 * @param {string} extra criterios adicionales ya formateados, o ''.
 * @param {string} estado el criterio de estado, entre comillas.
 */
function sumaCobranzas(cob, campo, cliente, extra, estado) {
  // UNA OBRA SE RECONOCE POR EL CONCEPTO **O** POR LA ORDEN DE COMPRA (ver `tramos`): el anticipo
  // puede no nombrarla en el Concepto, y mirar sólo ahí dejaba media obra afuera.
  // La venta se acota por su fecha de VENTA; lo que mide plata que entra, por la de COBRO.
  const ventana = enElAno(cob, campo === 'neto' ? 'fechaVenta' : 'fechaCobro')
  return tramos(cob, cliente, extra)
    .map(([v, c]) => enPesos(cob, campo, `${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c};${abierto(cob, 'estado')};${estado}${ventana}`))
    .join('+')
}

/**
 * UNA SUMA DE COBRANZAS EN PESOS DE VERDAD: los importes en dólares valuados al tipo de cambio.
 *
 * Toda suma de esta pestaña pasa por acá. La forma y el porqué viven en `sumaConUSD`
 * (`cobranzas-contrato.mjs`), que es donde se puede probar sin armar una grilla entera.
 */
const enPesos = (cob, campo, criterios) => sumaConUSD({
  rango: abierto(cob, campo), criterios, moneda: abierto(cob, 'moneda'), tc: RANGO_TC,
})

/** VENTA: el NETO de todo lo que no está cancelado. El IVA no es venta. */
const venta = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'neto', cliente, extra, `"<>${NO_VENTA}"`)}`

/** COBRADO: el importe que entró, con IVA. */
const cobrado = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)}`

/** RESTA COBRAR: lo facturado/proyectado que todavía no entró, con IVA. Sale del ESTADO, no de una
 *  columna de saldo — la col M no es un saldo (ver el encabezado). */
const restaCobrar = (cob, cliente, extra = {}) =>
  `=${sumaCobranzas(cob, 'total', cliente, extra, `"<>${NO_VENTA}"`)}-(${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)})`

/**
 * RETENIDO: lo que el cliente NO transfirió porque lo retuvo y lo depositó a nombre de la empresa.
 *
 * POR QUÉ EXISTE (13/08). Es la traducción de las tres columnas de retención del modelo del dueño
 * (Ret. Ganancia · IIBB · LH) y son $7.671.680 REALES de 2026 que ninguna pestaña de obras miraba.
 * No es un costo: es plata de la empresa que está en ARCA/Rentas y se computa contra el impuesto —
 * pero explica por qué el cobrado de un cliente es menor que su venta más IVA, que es justo la
 * pregunta que dispara la columna.
 *
 * DOS DECISIONES QUE NO SON DE ESTILO:
 * · SÓLO LO **COBRADO**. La retención se sufre en el momento del pago; la de una fila pendiente es
 *   una estimación tipeada. Verificado en el archivo: las 11 filas con retención están cobradas.
 *   Publicar una estimación al lado de un hecho es exactamente lo que la regla de oro 2 prohíbe.
 * · VENTANA POR FECHA DE **COBRO**, como todo lo percibido de esta pestaña. Por fecha de venta
 *   mezclaría criterios en la misma columna.
 */
const retenido = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'retenciones', cliente, extra, `"${COBRADO}"`)}`

/**
 * % COBRADO — el `% FACTURADO` del modelo del dueño, pasado a percibido.
 *
 * QUÉ CONTESTA: qué proporción de la cartera de esta fila ya entró. Es el único número de la pestaña
 * que no es plata, y por eso ocupa la columna B: ahí vivía un semáforo `✓/⚠` que daba ✓ en las siete
 * obras —una columna donde todas las celdas dicen lo mismo no informa nada— y cuya única señal (hay
 * vencido) ya la publica la columna F con su importe, que es más específica que un glifo.
 *
 * EL DENOMINADOR ES `cobrado + resta`, NO LA VENTA. Las dos magnitudes que se dividen tienen que ser
 * el mismo criterio: cobrado y resta se miden al TOTAL y la venta al NETO, así que `cobrado/venta`
 * daría 113% en una obra blanca íntegramente cobrada — un avance imposible que se leería como un
 * error de la pestaña. Con `cobrado/(cobrado+resta)` el resultado vive siempre entre 0 y 1.
 *
 * SIN `IFERROR`: una fila sin cartera devuelve 0, no vacío. Un vacío obliga al escritor a decidir si
 * es una fórmula rota (ya pasó: `Próx. cobro` salió en blanco en 4 de 7 obras y nadie lo vio), y una
 * obra recién declarada sin cobranzas cargadas haría abortar la publicación entera por un caso
 * legítimo. 0% dice lo que pasa —no entró nada— y las tres columnas de al lado dicen por qué.
 */
const pctCobrado = (f) => `=IF(D${f}+E${f}=0;0;D${f}/(D${f}+E${f}))`

/**
 * LO QUE SE PUBLICA CUANDO NO HAY DATO. No es un cero y no es una celda en blanco.
 *
 * Un 0 afirmaría que el contrato vale cero; un blanco es indistinguible de una fórmula que se rompió
 * en silencio, que es el defecto que `columnasDesparejas` existe para cazar. El guion dice lo único
 * cierto: esta obra no declara contrato en ninguna de sus filas de Cobranzas.
 */
export const SIN_CONTRATO = '—'

/**
 * `% CONTRATO` — el `% FACTURADO` del modelo del dueño, contra el contrato y no contra la cartera.
 *
 * El dueño lo pidió así: *"el % como avance de contrato, no de cartera"*. Numerador y denominador
 * son del mismo criterio —los dos al NETO— porque el contrato que declara la Orden de Compra es
 * neto: verificado fila por fila, los hitos de las seis obras con contrato suman EXACTAMENTE su
 * contrato al neto (Pisos: 23.795.136 + 5.950.000×3 + 5.945.136 = 47.590.272).
 *
 * PUEDE PASAR DE 100% Y ESO NO ES UN ERROR: Quattropani tiene $133.211.023 cargados sobre un
 * contrato de $97.650.000 porque el anticipo incluye materiales que se facturan con margen fuera del
 * contrato ("(paga el 33% del 50%) + Materiales"). Recortarlo a 100% escondería justo ese hecho.
 */
const pctContrato = (f, contrato) => (contrato ? `=C${f}/${contrato}` : SIN_CONTRATO)

/**
 * `SALDO CONTRATO` — el `SALDO PENDIENTE` del modelo del dueño.
 *
 * QUÉ CONTESTA, Y ES LA PREGUNTA QUE HABILITA TODO ESTO: si da POSITIVO, hay hitos del contrato que
 * todavía no son fila en Cobranzas — plata ya vendida que no está en ninguna proyección de cobro y
 * que hoy el dueño no puede ver en ningún lado. Si da NEGATIVO, se facturó por encima del contrato.
 *
 * EL CONTRATO VA COMO NÚMERO DENTRO DE LA FÓRMULA, no como una celda aparte, y eso es una decisión:
 * no hay forma razonable de que Sheets extraiga por sí solo "47.590.272" de adentro del texto "Resto
 * 50% s/ total 47.590.272 — certificación quincenal 1/4" sin una expresión regular monstruosa que
 * este worktree no puede evaluar contra el archivo real. Lo que sí se garantiza es que el número no
 * se fosiliza: `obras-pestana.mjs` lo vuelve a leer de Cobranzas en CADA corrida, y si esa lectura
 * no trae contrato la celda pasa a "—" sola. El origen se declara en el subtítulo de la pestaña.
 */
const saldoContrato = (f, contrato) => (contrato ? `=${contrato}-C${f}` : SIN_CONTRATO)

/** LO VENCIDO: fecha de cobro pasada y todavía sin cobrar. Es la plata que había que cobrar y no
 *  entró — el único número de esta pestaña que tiene que gritar. */
/** Los pares (variante de cliente, criterio de obra) que forman UNA obra. Sin needle, el cliente entero. */
const tramos = (cob, cliente, extra = {}) => {
  const cat = extra.cat ? `;${abierto(cob, 'categoria')};"${extra.cat}"` : ''
  // ═══ REGLA DEL DUEÑO (13/08): UN CLIENTE CON UNA SOLA OBRA ES ESA OBRA ═══
  //
  // No es una inferencia mía: es criterio de negocio, decidido cuando se le mostró que el anticipo de
  // Quattropani (ids 57/58/59, $61.425.085) no nombra la obra ni en el Concepto ni en la Orden de
  // Compra, y que por eso Salón Comercial publicaba la mitad de su venta. Eligió la regla general
  // antes que retocar Cobranzas. Si el cliente tiene DOS O MÁS obras declaradas, sigue mandando el
  // match por texto: MESSINA factura trabajos fuera de las 7 obras y forzarlos sería inventar.
  if (extra.unica) return variantesDe(cliente).map((v) => [v, cat])
  return variantesDe(cliente).flatMap((v) => (extra.needle
    ? [[v, `;${abierto(cob, 'concepto')};"*${extra.needle}*"${cat}`],
      [v, `;${abierto(cob, 'oc')};"*${extra.needle}*";${abierto(cob, 'concepto')};"<>*${extra.needle}*"${cat}`]]
    : [[v, cat]]))
}

const vencido = (cob, cliente, extra = {}) =>
  `=${tramos(cob, cliente, extra).map(([v, c]) => enPesos(cob, 'total', `${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c}`
    + `;${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}";${abierto(cob, 'fechaCobro')};"<"&TODAY()${enElAno(cob, 'fechaCobro')}`)).join('+')}`

/**
 * LA PRÓXIMA FECHA DE COBRO pendiente.
 *
 * `MINIFS` devuelve 0 cuando no hay ninguna pendiente, y un 0 en una celda con formato de fecha se
 * dibuja "30/12/1899". El `1/(1/x)` convierte ese 0 en un error que el IFERROR transforma en blanco:
 * una obra sin cobranzas pendientes no tiene próxima fecha, y eso es un guion, no un error.
 *
 * ACÁ VIVIÓ EL `#ERROR!` QUE SE PUBLICÓ EN LAS 7 OBRAS (13/08): esta fórmula cerraba un paréntesis de
 * más. Sheets no evalúa una fórmula que no parsea — la muestra como `#ERROR!` — y los tests no lo
 * veían porque comparaban el texto que yo emitía contra el texto que yo esperaba. Ahora `todas las
 * fórmulas están balanceadas` es un test, y el escritor relee la pestaña y aborta si publicó un error.
 */
const LEJOS = 2958465

const proximoCobro = (cob, cliente, extra = '') => {
  // EL DUEÑO PIDIÓ LA FORMA DE COBRO con todas las letras —*"de ahi me tiene q ser facil ver cuanto
  // resta, qué forma de cobro"*— y se perdió cuando salió la columna de glosa. Vuelve pegada a la
  // fecha que ya existía, no en una columna nueva: es UNA palabra ("Efectivo", "Transferencia") y
  // abrirle una columna sería reponer por la ventana lo que él mandó sacar por la puerta.
  // La celda pasa a ser TEXTO: nada la referencia como fecha —el neteo usa el serial del inicio de
  // obra, no esta celda— así que no rompe ningún cálculo.
  const ms = tramos(cob, cliente, extra).map(([v, c]) => `MINIFS(${abierto(cob, 'fechaCobro')};${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c}`
    + `;${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}";${abierto(cob, 'fechaCobro')};">0")`)
  // CADA MINIFS SIN COINCIDENCIAS DEVUELVE 0, Y UN 0 GANA CUALQUIER `MIN`. Ese fue el defecto: las 4
  // obras de San Francisco salieron con la fecha EN BLANCO porque su alias IMOTOR no tiene filas
  // pendientes de esa obra, su MINIFS daba 0 y el MIN lo tomaba como el mínimo. Blanco se lee como
  // "no hay nada que cobrar", y había $8,7M para el 19/08. El 0 se mapea a una fecha imposible.
  const min = `MIN(${ms.map((m) => `IF(${m}=0;${LEJOS};${m})`).join(';')})`
  // La forma sale de la fila cuya fecha de cobro ES esa próxima fecha, del mismo cliente y sin cobrar.
  const forma = `IFERROR(INDEX(${abierto(cob, 'forma')};MATCH(1;ARRAYFORMULA(`
    + `(${variantesDe(cliente).map((v) => `(${abierto(cob, 'cliente')}="${v}")`).join('+')})`
    + `*(${abierto(cob, 'fechaCobro')}=${min})*(${abierto(cob, 'estado')}<>"${COBRADO}"));0));"")`
  return `=IF(${min}>=${LEJOS};"";TEXT(${min};"dd/mm")&" · "&${forma})`
}

/** Mismo constructor de grilla que el anexo de CAJA: push devuelve la fila 1-based, y toda celda
 *  vacía sale con el centinela VACIO ("es mía y va vacía") para que la fusión la limpie. */
function hoja() {
  const filas = []
  const h = {
    filas,
    tipeadas: [],
    get n() { return filas.length },
    push(c = []) {
      const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
      while (r.length < ANCHO_OBRAS) r.push(VACIO)
      r.length = ANCHO_OBRAS
      filas.push(r)
      return filas.length
    },
  }
  return h
}

/**
 * SECCIÓN 1 — LAS OBRAS DEL AÑO, POR CLIENTE. Todo fórmula viva.
 *
 * El cliente se ancla al PREFIJO de "Obra / Cliente": el archivo escribe "LA ESTRELLA /ALIMENTOS DEL
 * SUR SAS", así que un match exacto daría $0, pero buscarlo adentro le sumaba a San Francisco las 9
 * filas de "IMOTOR/San Francisco/JAVI SANCHEZ", que es otro cliente. El gasto real en materiales lo
 * declara la pestaña Materiales en su fila "TOTAL POR OBRA", citada por rótulo con INDEX/MATCH.
 *
 * EL TOTAL NO ES LA SUMA DE LAS FILAS DE ARRIBA: sale de Cobranzas entera. Y la diferencia contra los
 * clientes listados se publica en su propia fila, con nombre. Así la pestaña se concilia sola contra
 * su fuente y ningún cliente puede desaparecer del número grande sin que se vea dónde fue — que es
 * exactamente lo que pasó cuando el total decía $624M sobre una fuente de $809M.
 */
function seccionObrasDelAno(h, refs, clientes) {
  const { cob, cmp } = refs
  h.push(['1 · OBRAS DEL AÑO'])
  h.push(['Cliente', '% cob.', 'Venta (neto)', 'Cobrado (total)', 'Resta (total)', 'Vencido', 'Materiales (neto)', 'Retenido'])
  const f0 = h.n + 1
  /** En qué fila quedó cada cliente. El escritor lo necesita para el control de doble conteo: sin
   *  esto tendría que buscar el rótulo en la grilla, que es anclar en el texto de una fila. */
  const filaDeCliente = {}
  for (const cli of clientes) {
    const f = h.n + 1
    filaDeCliente[cli] = f
    h.push([cli, pctCobrado(f), venta(cob, cli), cobrado(cob, cli), restaCobrar(cob, cli), vencido(cob, cli),
costoNeto(cmp, cli),
      retenido(cob, cli)])
  }
  const f1 = h.n
  // COBRANZAS ENTERA, sin filtrar por cliente. El único criterio es el estado, así que una fila con la
  // columna de cliente vacía entra igual: si dependiera del cliente, el residuo podría esconder plata.
  const todo = (campo, estado) => enPesos(cob, campo, `${abierto(cob, 'estado')};"${estado}"`
    + `${enElAno(cob, campo === 'neto' ? 'fechaVenta' : 'fechaCobro')}`)
  // ═══ ACÁ IBA "⇒ sin ubicar". EL DUEÑO LA SACÓ DOS VECES Y TIENE RAZÓN ═══
  //
  // *"la fila 'otros clientes' no puede ser, estan todos los clientes y obras declarados"*. Un control
  // que da $0 todos los días no es información: es una fila que ocupa lugar en la portada para
  // decirle que no pasa nada. La CAPACIDAD de detectar el problema no se perdió — se mudó a donde
  // molesta menos y grita más fuerte: el escritor compara la suma de los clientes contra el total de
  // la fuente y ABORTA SIN PUBLICAR si difieren. Un generador que no escribe es mejor control que una
  // fila que el dueño ya dijo dos veces que no quiere ver.
  const fTot = h.n + 1
  h.push(['⇒ TOTAL 2026', pctCobrado(fTot), `=${todo('neto', `<>${NO_VENTA}`)}`, `=${todo('total', COBRADO)}`,
    // LOS PARÉNTESIS NO SON DE ESTILO: desde que la suma vale `todo − dólares + dólares×TC`, un
    // `A-B` sin agrupar restaría sólo el primer término de B y sumaría los otros dos.
    `=(${todo('total', `<>${NO_VENTA}`)})-(${todo('total', COBRADO)})`,
    `=SUM(F${f0}:F${f1})`, `=SUM(G${f0}:G${f1})`,
    // El retenido del año sale de la FUENTE ENTERA, igual que la venta y el cobrado: si un cliente
    // quedara fuera de la lista derivada, su retención tiene que seguir estando en el total.
    `=${todo('retenciones', COBRADO)}`])
  h.push([])
  return { fClientes: [f0, f1], fTot, filaDeCliente }
}

/** Lo REALMENTE facturado en Compras para un egreso: mismo proveedor (nombre canónico), mismo cliente
 *  y fecha de factura desde el inicio de la obra. El inicio va como serial literal: es dato del dueño
 *  (obras-datos.mjs) y ya no hay una celda de la fila protagonista donde leerlo — esa columna ahora
 *  publica la próxima fecha de COBRO. */
function realEgreso(cmp, proveedor, cliente, inicio) {
  return `SUMIFS(${abierto(cmp, 'neto')};${abierto(cmp, 'proveedor')};"${proveedor}";`
    + `${abierto(cmp, 'cliente')};"${nombreEnCostos(cliente)}";${abierto(cmp, 'fecha')};">="&${serialISO(inicio)})`
}

/**
 * UN BLOQUE DE OBRA: la fila protagonista y su detalle.
 *
 * La protagonista se empuja PRIMERO y sus sumas citan las filas del detalle, que se conocen antes de
 * empujarlas (el patrón del anexo de CAJA). El costo real es la suma de lo medible: los egresos con
 * proveedor declarado, contra Compras. La MO no se mide acá — va por Jornales — y su pendiente es el
 * monto entero, declarado en prosa.
 */
function bloqueObra(h, refs, o, idx, unica = false) {
  const { cob, cmp } = refs
  // La definición de "se puede proyectar" vive en obras-datos.mjs, no acá: repetirla como
  // `o.inicio && o.fin` es la segunda versión del mismo concepto esperando a divergir.
  const proyectable = esProyectable(o)
  const fProt = h.n + 1
  const nDetalle = (o.egresos?.length ?? 0) + 1 // egresos + la fila de MO
  const [f0, f1] = [fProt + 1, fProt + nDetalle]

  const dela = { needle: o.ventaTexto, unica }
  h.push([`2.${idx} · ${o.cliente} — ${o.obra}${proyectable ? '' : '   ⚠ sin fechas — no se proyecta'}`,
    // ACÁ VIVÍA EL SEMÁFORO `✓/⚠`, que miraba la cobranza vencida. Sale por el estándar del dueño
    // (13/08, el modelo que señaló no usa un solo glifo) y porque no informaba: daba ✓ en las siete
    // obras, y su única señal —hay vencido— la publica la columna F con el importe, que dice cuánto.
    // Y DESDE EL 13/08 NO ES EL % DE CARTERA SINO EL DE CONTRATO, que es lo que el dueño pidió ver.
    pctContrato(fProt, o.contrato),
    venta(cob, o.cliente, dela), cobrado(cob, o.cliente, dela), restaCobrar(cob, o.cliente, dela),
    vencido(cob, o.cliente, dela),
    `=SUM(G${f0}:G${f1})`,
    // ═══ ACÁ IBA EL MARGEN. EL DUEÑO LO MANDÓ SACAR (13/08) Y ESTA NOTA ES PARA QUE NADIE LO REPONGA ═══
    //
    // No es calculable por obra: Compras tiene "Cliente / Asignación" pero NO tiene columna de obra,
    // así que las 4 obras de San Francisco comparten un único costo real y no hay forma de repartirlo.
    // Lo que se publicaba era venta del contrato menos el costo PROYECTADO, y donde la proyección está
    // declarada incompleta —BSA y Quattropani, con materiales ya facturados— daba un margen alto y
    // falso. Publicar eso es presentar una estimación como un hecho.
    //
    // PARA QUE EL MARGEN POR OBRA EXISTA hace falta que cada compra diga a QUÉ OBRA va, no sólo a qué
    // cliente. Mientras eso no esté, la columna no vuelve.
    proximoCobro(cob, o.cliente, dela),
    saldoContrato(fProt, o.contrato)])

  for (const e of o.egresos ?? []) {
    const f = h.n + 1
    const fecha = e.cuotas?.length ? e.cuotas[0].fecha : e.fechaEstimada
    const medible = Boolean(e.proveedor && proyectable)
    // EL NETEO VIVO VA EMBEBIDO EN "PENDIENTE": cuando entra la factura real a Compras, el pendiente
    // baja solo. La columna del real dejó su lugar a "Resta cobrar" — el dueño la declaró inútil acá
    // (13/08: *"esa columna real no sirve"*) y el dato que sí decide es cuánto FALTA desembolsar.
    // EL PROVEEDOR IDENTIFICA LA FILA: va en el rótulo, no en una glosa. Las cuotas se reducen a
    // "×3" —cuántas son cambia el desembolso, sus fechas exactas no— y sin proveedor el ⚠ dice que
    // el real no se puede medir. Todo eso ocupaba antes una columna entera de prosa.
    h.push([`      ${e.concepto}${e.proveedor ? ` · ${e.proveedor}` : ' · ⚠ sin proveedor'}`
      + `${e.cuotas?.length ? ` ×${e.cuotas.length}` : ''}`, '', e.monto, '', '',
      '', medible ? `=MAX(0;C${f}-${realEgreso(cmp, e.proveedor, o.cliente, o.inicio)})` : `=MAX(0;C${f})`,
      fecha ? serialISO(fecha) : ''])
    h.tipeadas.push({ fila: f, col: 2 })
    if (fecha) h.tipeadas.push({ fila: f, col: 7 })
  }

  const fMO = h.n + 1
  h.push(['      Mano de obra + cargas sociales · Jornales', '', o.moCargasPesos, '', '', '', `=C${fMO}`, ''])
  h.tipeadas.push({ fila: fMO, col: 2 })

  let fNoCaja = null
  if (o.noCaja?.maquinaPropia) {
    // El ⊘ ES la marca: equipo propio, no es plata que sale. Repetirlo en prosa no agrega nada.
    fNoCaja = h.push(['      ⊘ Máquina propia', '', o.noCaja.maquinaPropia, '', '', '', '', ''])
    h.tipeadas.push({ fila: fNoCaja, col: 2 })
  }
  h.push([])
  return { clave: o.clave, fProt, fDetalle: [f0, f1], fMO, fNoCaja, proyectable, contrato: o.contrato ?? null }
}

/**
 * LA GRILLA COMPLETA DE `OBRAS`.
 *
 * @param {object} ctx `obras` (defecto: OBRAS_FUTURAS de obras-datos.mjs, inyectable en los tests),
 *   `refs` (defecto: REFS_OBRAS; el escritor pasa las resueltas por rótulo), `clientes`.
 * @returns {{filas:Array, tipeadas:Array, protagonistas:number[], detalles:number[], totales:number[],
 *   bloques:Array, fClientes:number[]}} `bloques` expone la anatomía de cada obra (protagonista,
 *   rango de detalle, MO, no-caja) para que la verificación mire la estructura y no el texto.
 */
export function grillaObras(ctx = {}) {
  const refs = { ...REFS_OBRAS, ...ctx.refs }
  const obras = ctx.obras ?? []
  const clientes = ctx.clientes ?? CLIENTES_MUESTRA
  const h = hoja()

  h.push([`${PESTANA_OBRAS} — EL AÑO ENTERO, OBRA POR OBRA`])
  // UNA LÍNEA, Y SÓLO PARA DECLARAR EL CRITERIO. El dueño rechazó hoy otra pestaña por *"muchas
  // palabras y frases y explicaciones que nadie lee"*. Lo único que no se puede deducir mirando la
  // tabla es con qué criterio está medida cada columna, y eso la regla de oro 3 obliga a declararlo.
  // EL SUBTÍTULO ES DONDE ESTA PESTAÑA DECLARA SUS CRITERIOS, y ahora tiene dos que declarar más: de
  // dónde sale el contrato (para que "Saldo contrato" no sea un número mágico) y a qué tipo de cambio
  // se valúan los dólares. El TC va como FÓRMULA sobre el rango con nombre de CAJA: escribirlo como
  // texto lo dejaría viejo al día siguiente y nadie se enteraría.
  h.push([`=${quote(`${ANO} · venta al NETO (devengado) · cobranzas al TOTAL neto de retenciones (percibido)`
    + ' · contrato leído de la ORDEN DE COMPRA de Cobranzas · USD valuado a ')}&`
    + `IFERROR(TEXT(${RANGO_TC};"$ #.##0,00");"(sin tipo de cambio)")`])
  h.push([])

  const s1 = seccionObrasDelAno(h, refs, clientes)

  h.push(['2 · OBRAS EN CURSO Y FUTURAS'])
  h.push(['Obra', '% contr.', 'Venta (neto)', 'Cobrado (total)', 'Resta (total)', 'Vencido', 'Pendiente pago', 'Próx. cobro', 'Saldo contrato'])
  // Cuántas obras declaradas tiene cada cliente: es lo que habilita la regla del dueño de arriba.
  const porCliente = obras.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const bloques = obras.map((o, i) => bloqueObra(h, refs, o, i + 1, porCliente.get(o.cliente) === 1))
  const suma = (col) => `=${bloques.map((b) => `${col}${b.fProt}`).join('+')}`
  const fTot2 = bloques.length ? h.n + 1 : null
  // LOS CONTRATOS DEL AÑO: sólo los DECLARADOS. Una obra sin contrato (BSA no lo declara en ninguna
  // fila) no suma cero al denominador — queda afuera de los dos lados del cociente, que es la única
  // forma de que el porcentaje siga significando lo mismo que en cada fila.
  const contratos = bloques.reduce((s, b) => s + (Number(b.contrato) || 0), 0)
  if (fTot2) {
    // EL TOTAL DE `Saldo contrato` CITA SÓLO LAS OBRAS QUE DECLARAN CONTRATO, y no es un detalle de
    // implementación: las otras publican el guion "—", y una fila que suma texto depende de que
    // Sheets lo ignore. Puede que lo ignore; no lo puedo VERIFICAR desde acá sin escribir en el
    // archivo, y una pestaña que descansa en una conducta que nadie probó es la definición de un
    // número que miente despacio. Citando sólo las filas con número, el resultado es el mismo en
    // Sheets y en el evaluador en frío — y el test puede afirmarlo.
    const conContrato = bloques.filter((b) => b.contrato)
    const saldo = conContrato.length ? `=${conContrato.map((b) => `I${b.fProt}`).join('+')}` : SIN_CONTRATO
    // El % del cierre se arma con los MISMOS dos lados que las filas: venta de las obras CON contrato
    // (= contratos − saldo) sobre esos contratos. Tomar la C del total metería la venta de BSA en el
    // numerador y no en el denominador, y el cierre diría un avance que ninguna fila respalda.
    const pct = contratos ? `=(${contratos}-I${fTot2})/${contratos}` : SIN_CONTRATO
    h.push(['⇒ TOTAL — OBRAS EN CURSO Y FUTURAS', pct, suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), '', saldo])
  }

  // ═══ ACÁ IBA "Otros trabajos de N cliente(s) con obra". EL DUEÑO SACÓ LA FILA DE RESIDUO ═══
  //
  // Es la tercera vez que manda sacar un renglón de sobrante ("otros clientes", "sin ubicar", y
  // ésta). El argumento es el mismo y es correcto: una fila que existe para que el cuadro cierre no
  // responde ninguna pregunta del negocio, y encima competía por la atención con los importes de las
  // obras — justo lo contrario del estándar que pidió.
  //
  // LO QUE LA FILA CONTROLABA NO SE PERDIÓ, SE MUDÓ AL ESCRITOR. La identidad sigue viva
  // (`trabajosFueraDeObra`): la venta de los clientes CON obra menos la suma de las obras es lo que
  // se les factura fuera de ellas, y ese número no puede ser negativo — si lo es, una obra se está
  // contando dos veces, que es el defecto de $692.395.550 que esta misma fila publicó una vez. El
  // control corre contra lo YA PUBLICADO y aborta con nombre y monto. Un control en el log que
  // detiene la corrida vale más que un renglón que el dueño no quiere ver.

  const totales = [s1.fTot, fTot2].filter(Boolean)
  return {
    filas: h.filas,
    tipeadas: h.tipeadas,
    protagonistas: bloques.map((b) => b.fProt),
    detalles: bloques.flatMap((b) => { const r = []; for (let f = b.fDetalle[0]; f <= b.fDetalle[1]; f++) r.push(f); return b.fNoCaja ? [...r, b.fNoCaja] : r }),
    totales,
    bloques,
    fClientes: s1.fClientes,
    filaDeCliente: s1.filaDeCliente,
    /** Las filas donde la H lleva un IMPORTE (Retenido) y no una fecha ni un texto. El formateador
     *  las necesita: la columna entera está declarada como fecha por el detalle de egresos, y un
     *  importe con formato de fecha se dibuja como un día del año 2110. */
    importeEnH: [...rango(s1.fClientes[0], s1.fClientes[1]), s1.fTot],
  }
}

/** Los enteros de `a` a `b`, inclusive. */
const rango = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r }

/**
 * LO QUE SE LE FACTURA A LOS CLIENTES CON OBRA, FUERA DE SUS OBRAS DECLARADAS — Y EL DEFECTO QUE
 * DELATA.
 *
 * Las obras de la Sección 2 son un SUBCONJUNTO de lo que se le factura a esos clientes: MESSINA
 * factura trabajos fuera de Playón y BSA, y IMOTOR entra a San Francisco por su alias. Por eso el
 * sobrante es NORMAL y positivo.
 *
 * LO QUE ES IMPOSIBLE ES QUE SEA NEGATIVO: significaría que las obras suman más que la venta entera
 * de sus propios clientes, o sea que alguna se cuenta dos veces. Ese defecto ya se publicó —la fila
 * de residuo mostró $692.395.550 donde iban $125.680.764 por un paréntesis— y no da error en Sheets:
 * devuelve un número creíble. Por eso el control es del ESCRITOR y detiene la corrida.
 *
 * @param {number} ventaClientes la venta de los clientes que tienen al menos una obra declarada
 * @param {number} ventaObras el total de la Sección 2
 * @param {number} tolerancia pesos de redondeo que no se consideran un problema
 * @returns {{fuera:number, problema:string|null}}
 */
export function trabajosFueraDeObra(ventaClientes, ventaObras, tolerancia = 1) {
  const fuera = Math.round((Number(ventaClientes) - Number(ventaObras)) * 100) / 100
  if (fuera >= -tolerancia) return { fuera, problema: null }
  return {
    fuera,
    problema: `las obras declaradas suman $${Math.round(ventaObras).toLocaleString('es-AR')} y sus clientes`
      + ` facturaron $${Math.round(ventaClientes).toLocaleString('es-AR')}: sobran $${Math.round(-fuera).toLocaleString('es-AR')}`
      + ' que sólo pueden venir de contar una obra DOS VECES',
  }
}
