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
// parte blanca, y nada más.
//
// ═══ NO ES UN DEFECTO, Y NO SE LE PONE UN CONTROL ENCIMA (13/08, verificado fila por fila) ═══
//
// Un auditor mirando la pantalla lo marcó como imposible: "si no cobró nada, la Resta tendría que ser
// igual a la Venta". Se midieron las seis filas de Playón en Cobranzas: los netos (col J) suman
// $102.500.000 y los totales pendientes (col M) $116.150.000; la diferencia son exactamente los
// $13.650.000 de IVA de las tres filas blancas (col K). Las dos columnas están bien y sus encabezados
// ya lo declaran — "Venta (neto)" y "Resta (total)".
//
// LA IDENTIDAD `Resta ≤ Venta cuando Cobrado = 0` ES FALSA acá, y por eso el control que parece obvio
// no se agrega: marcaría en rojo dos obras correctas (Playón y BSA, las dos mixtas). Tampoco sirve
// `Resta ≤ Venta × 1,21`, porque las dos columnas usan VENTANAS distintas —la venta se acota por
// fecha de venta y la resta por fecha de cobro—, así que una obra vendida en diciembre y cobrada en
// enero daría alarma sin tener nada malo. Un control que grita sobre lo que está bien se ignora y
// arrastra a los que sirven; es la misma decisión que ya se tomó para la identidad de M sobre J y K.
//
// LA GLOSA QUE EXPLICABA ESTO YA NO EXISTE: la columna I de prosa salió el 13/08 por pedido del dueño
// ("ensucia con esa información"). Quien lea la pantalla ve dos números que no cierran entre sí y no
// tiene dónde leer por qué. Es un límite CONOCIDO de la pestaña, no un error de cálculo.
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
import { comprasObraDe, esProyectable, totalEgresos } from './obras-datos.mjs'
import { sumaNetaSheet, esMaterialSheet } from './costo-materiales.mjs'
import { sumaConUSD } from './cobranzas-contrato.mjs'
import { formulaCertificado } from './obras-certificado.mjs'
// EL TIPO DE CAMBIO SE IMPORTA, NO SE ESCRIBE DE NUEVO. Vive UNA vez, en el bloque de CAJA, y esta
// pestaña lo referencia por su nombre: un segundo tipo de cambio sería una segunda verdad para el
// mismo concepto, que es justo lo que la REALIDAD ÚNICA prohíbe.
import { RANGO_TC } from './caja-disponibilidades.mjs'
// LA SEÑAL DE ALERTA VIVE EN UN SOLO LUGAR. Acá estaba tipeado el ⚠, que el PDF no dibuja: la marca
// estaba en la celda y no en la pantalla. Ver `glifos.mjs`.
import { ALERTA } from './glifos.mjs'
// QUÉ ES UNA COBRANZA VENCIDA: una sola definición, con su plazo y sus tramos. Ver el archivo — acá
// vivía el criterio viejo, que medía contra la fecha de cobro ESPERADA y por eso daba siempre cero.
import {
  PLAZO_COBRO_DIAS, TRAMOS_ANTIGUEDAD, critPorVencer, critVencido, critTramo,
} from './cobranzas-vencido.mjs'

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
export const ALTO_HISTORICO = 66

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
export const ANCHOS_OBRAS = [300, 60, 138, 138, 138, 138, 138, 138, 150]

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
  // EL RÓTULO DE UNA OBRA ES UNA FÓRMULA DESDE QUE LLEVA EL ⚠ VIVO. Medir la fórmula daría una
  // columna A de ~900px por un rótulo de 60 caracteres: se mide lo que la celda MUESTRA.
  const visible = new Map((g.rotulos ?? []).map((r) => [r.fila, r.texto]))
  let px = minimo - padding
  ;(g.filas ?? []).forEach((fila, i) => {
    const t = visible.get(i + 1) ?? (fila?.[0] === VACIO ? '' : String(fila?.[0] ?? ''))
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
  // `fechaEmision` es la col C: la fecha en que la deuda NACIÓ. Es la única de las tres fechas que no
  // se re-escribe cuando el cobro se posterga, y por eso es el reloj de lo vencido (ver
  // `cobranzas-vencido.mjs`). Medir contra `fechaCobro` daba $0 todos los días.
  cob: { hoja: 'Cobranzas', cliente: 'G', concepto: 'I', neto: 'J', total: 'M', retenciones: 'L', estado: 'O', fechaCobro: 'Q', fechaVenta: 'P', fechaEmision: 'C', forma: 'N', categoria: 'B', oc: 'H', moneda: 'AA', desde: 5 },
  // `neto` es la columna "Importe" (M = Total − IVA). El costo se mide ahí, no en "Total" (O): la
  // venta ya se mide al neto, y comparar venta neta contra costo con IVA castigaba el margen ~21% en
  // todo lo que se compra en blanco. Neto contra neto. El IVA de compras es crédito fiscal, no costo.
  // `obra` es la col K, "Detalles / Obra": el texto que el dueño escribe a mano al cargar el
  // comprobante. Es el ÚNICO lugar de Compras donde consta a qué obra va un gasto — la col J
  // ("Cliente / Asignación") llega hasta el cliente y ahí se detiene, y las cuatro obras de San
  // Francisco comparten cliente. Por qué el emparejamiento va por acá y no por proveedor: el bloque
  // `comprasObra` de obras-datos.mjs, que es donde vive la evidencia.
  cmp: { hoja: 'Compras', fecha: 'C', proveedor: 'E', cliente: 'J', obra: 'K', neto: 'M', iva: 'N', total: 'O', familia: 'AE', desde: 4 },
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
 * EL RÓTULO DEL CIERRE DEL AÑO Y EL DE SU COLUMNA — porque quien los LEE también los necesita.
 *
 * El calendario de cobros se cuadra contra este cierre, y para eso tiene que encontrarlo en la
 * pestaña ya publicada. Mientras cada lado tipeó su propio texto, el lector buscaba por el prefijo
 * "⇒ TOTAL" — y el 14/08 entró arriba el titular de cartera, cuyo cierre es "⇒ TOTAL POR COBRAR":
 * el buscador se quedó con esa fila y leyó un tramo de antigüedad ($3,5M) creyendo leer la Resta
 * del año ($357,5M). Exportarlos desde acá hace que el que escribe y el que lee no puedan
 * discrepar, y que subir `ANO` mueva los dos a la vez.
 */
export const ROTULO_TOTAL_ANO = `⇒ TOTAL ${ANO}`
export const ROTULO_RESTA = 'Resta (total)'

/**
 * EN QUÉ NÚMERO DE BLOQUE CAEN LAS OBRAS — y por qué es una constante y no un `2` tipeado.
 *
 * La numeración de bloques tiene que ser CONSECUTIVA y sin huecos: un cuadro que va "1, 3" hace creer
 * que falta algo. Al entrar el titular de cartera como bloque 1, las obras pasaron de 2.x a 3.x, y
 * ese número aparecía en dos lugares —el título del bloque y el rótulo de cada obra—. Con la
 * constante, agregar o sacar un bloque arriba no puede dejar la mitad de la pestaña renumerada y la
 * otra mitad no.
 */
export const SECCION_OBRAS = 3

/** El bloque del gasto por obra. Mismo motivo que `SECCION_OBRAS`: el número aparece en el título del
 *  bloque y en el rótulo de cada fila, y los dos tienen que moverse juntos. */
export const SECCION_COSTO = 4

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
const pctContrato = (f, contrato) => (contrato ? `=IF(G${f}=0;0;C${f}/G${f})` : SIN_CONTRATO)

/**
 * `SALDO CONTRATO` — el `SALDO PENDIENTE` del modelo del dueño.
 *
 * QUÉ CONTESTA, Y ES LA PREGUNTA QUE HABILITA TODO ESTO: si da POSITIVO, hay hitos del contrato que
 * todavía no son fila en Cobranzas — plata ya vendida que no está en ninguna proyección de cobro y
 * que hoy el dueño no puede ver en ningún lado. Si da NEGATIVO, se facturó por encima del contrato.
 *
 * ═══ EL CONTRATO DEJÓ DE VIVIR ADENTRO DE LA FÓRMULA (14/08) ═══
 *
 * Hasta hoy esta celda decía `=47590272-C18`: el contrato era un número enterrado en una fórmula, el
 * defecto que la regla de oro 5 nombra con todas las letras. No se podía leer sin abrir la celda, y
 * ninguna otra fórmula lo podía citar.
 *
 * Al pedir el dueño ver "cuánto contrató" por obra, el número pasó a tener su propia columna (la `G`)
 * y esta celda lo referencia. Sale gratis y arregla tres cosas de una: el contrato se ve, el `%
 * certificado` lo cita en vez de llevar su propia copia, y una sola celda define el número.
 *
 * SIGUE SIN FOSILIZARSE: `obras-pestana.mjs` lo vuelve a leer de la ORDEN DE COMPRA de Cobranzas en
 * CADA corrida, y si esa lectura no trae contrato las dos celdas pasan a "—" solas. Lo que Sheets no
 * puede hacer por sí mismo es extraer "47.590.272" de adentro del texto "Resto 50% s/ total
 * 47.590.272 — certificación quincenal 1/4"; por eso el número lo trae el escritor y no una fórmula.
 */
const saldoContrato = (f, contrato) => (contrato ? `=G${f}-C${f}` : SIN_CONTRATO)

/**
 * EL CONTROL DE LA COLUMNA DEL CONTRATO, Y POR QUÉ MIRA LA FÓRMULA Y NO LO QUE SE VE.
 *
 * ═══ EL DEFECTO QUE ESTA FUNCIÓN VIENE A ARREGLAR (13/08) ═══
 *
 * La verificación anterior leía el valor FORMATEADO de la I y exigía que una obra con contrato
 * publicara algo con un dígito. Abortó la publicación de cinco obras sanas.
 *
 * No había ningún defecto: `MONEDA_CUERPO` es `'#,##0;(#,##0);"—"'`, y esa tercera sección es la
 * del CERO. Una obra 100% facturada tiene saldo cero, y el cero se dibuja **exactamente igual** que
 * `SIN_CONTRATO`. Leyendo lo que se ve, "esta obra ya no debe nada" y "esta obra no declara
 * contrato" son el mismo carácter — dos hechos opuestos con el mismo glifo.
 *
 * Es la trampa del repo que dice que un control nunca se valida contra la misma información que
 * produce: el formato lo elige este mismo generador, así que preguntarle a la pantalla qué escribió
 * es preguntarle al propio trabajo si salió bien.
 *
 * LA FÓRMULA NO ES AMBIGUA: con contrato hay `=47590272-C18`; sin contrato hay el texto `—`. Por eso
 * el control relee con `render: 'FORMULA'`, que además prueba lo que importa —que la celda quedó
 * VIVA, atada a su C— y no sólo que hoy muestra un número. Una celda pegada a mano con el valor
 * correcto pasaba el control viejo; con éste, no.
 *
 * @param {{clave:string, fProt:number, contrato:number|null}[]} bloques
 * @param {string[][]} publicadoFormula la relectura de la pestaña con render FORMULA
 * @returns {string[]} un motivo por obra mal publicada; vacío si están todas bien
 */
export function saldoContratoMalPublicado(bloques = [], publicadoFormula = []) {
  const malas = []
  for (const b of bloques) {
    // La G lleva el contrato (número leído de Cobranzas) y la H la resta viva contra lo certificado.
    const enG = String(publicadoFormula[b.fProt - 1]?.[6] ?? '').trim()
    const enH = String(publicadoFormula[b.fProt - 1]?.[7] ?? '').trim()
    if (b.contrato) {
      if (Number(enG) !== Number(b.contrato)) {
        malas.push(`${b.clave}: contrato $${b.contrato.toLocaleString('es-AR')} y la G quedó "${enG}"`)
      }
      // La fórmula VIVA, atada a las dos celdas de ESTA fila: ni un número pegado, ni vacío.
      if (enH !== `=G${b.fProt}-C${b.fProt}`) {
        malas.push(`${b.clave}: la H quedó "${enH}" en vez de la fórmula viva "=G${b.fProt}-C${b.fProt}"`)
      }
    } else if (enG !== SIN_CONTRATO || enH !== SIN_CONTRATO) {
      malas.push(`${b.clave}: sin contrato declarado y quedó G="${enG}" H="${enH}" en vez de "${SIN_CONTRATO}"`)
    }
  }
  return malas
}

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

/**
 * LO PENDIENTE DE UNA FILA: ni cobrado ni cancelado, dentro de la ventana del año.
 *
 * ES EL MISMO UNIVERSO QUE `Resta (total)`, Y ESO ES DELIBERADO. Lo vencido y los tramos de
 * antigüedad son un REPARTO de la resta, no otra medición: si cada uno acotara distinto, las dos
 * cifras dejarían de cerrar entre sí y la pestaña publicaría dos totales de cartera que no se
 * explican. Lo único que cambia entre "resta" y "vencido" es el reloj, no la población.
 */
const pendienteDelAno = (cob) => `;${abierto(cob, 'estado')};"<>${COBRADO}"`
  + `;${abierto(cob, 'estado')};"<>${NO_VENTA}"${enElAno(cob, 'fechaCobro')}`

/**
 * LO VENCIDO: emitido hace más que el plazo acordado y todavía sin cobrar.
 *
 * ═══ EL DEFECTO QUE ACÁ SE ARREGLA (14/08/2026) ═══
 *
 * Esta fórmula decía `fechaCobro < TODAY()` y publicaba "—" en las 18 celdas de la pestaña. El dueño:
 * *"esta contemplando mal la columna de 'vencido' porque si hay cobranzas q estan vencidas"*.
 *
 * La `Fecha cobro` de una fila PENDIENTE no es un vencimiento: es cuándo se ESPERA cobrar, y se corre
 * hacia adelante cada vez que la fecha pasa. La columna preguntaba *"¿ya pasó la fecha que dijimos?"*
 * sobre una fecha que se vuelve a escribir justo cuando pasa — cero por construcción, no por salud de
 * la cartera. Y no lo desmentía nada, porque el semáforo propio de Cobranzas (`Estado cobro`) mira
 * esa MISMA celda: el control estaba validado contra la información que él mismo produce.
 *
 * El reloj correcto es la EMISIÓN más el plazo, y el porqué de cada pieza está en
 * `cobranzas-vencido.mjs`. Contra el archivo del 14/08/2026: 10 filas por $50.594.878, donde antes
 * había $0.
 */
const vencido = (cob, cliente, extra = {}) =>
  `=${tramos(cob, cliente, extra).map(([v, c]) => enPesos(cob, 'total', `${abierto(cob, 'cliente')};"${criterioCliente(v)}"${c}`
    + `${pendienteDelAno(cob)}${critVencido(abierto(cob, 'fechaEmision'), PLAZO_COBRO_DIAS)}`)).join('+')}`

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
    /** Fila → el texto que la celda MUESTRA, cuando la celda es una fórmula que arma un rótulo.
     *  `anchoColumnaA` mide píxeles de texto: sin esto mediría la fórmula y daría una columna de
     *  900px por un rótulo de 60 caracteres. */
    rotulos: [],
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
 * SECCIÓN 1 — LA ANTIGÜEDAD DE LA CARTERA. UNA LÍNEA, Y ES EL TITULAR DE LA PESTAÑA.
 *
 * ═══ QUÉ PREGUNTA CONTESTA, Y POR QUÉ NO LA CONTESTABA NADIE ═══
 *
 * El dueño pidió *"que se muestre mejor esa información"* sobre lo vencido. La columna `Vencido` dice
 * CUÁNTO y de QUIÉN; lo que faltaba es DESDE CUÁNDO — y es la parte que decide. $50.594.878 vencidos
 * hace una semana son un llamado; los mismos $50M repartidos con $15.932.016 de más de 90 días son
 * otra conversación, con otro interlocutor y otra probabilidad de cobro.
 *
 * El corte por tramos es el estándar de cartera (*accounts receivable aging*): se agrupa por cuánto
 * hace que la factura está VENCIDA, no por cuánto hace que se emitió. Los tramos y su fuente están
 * en `cobranzas-vencido.mjs`.
 *
 * ═══ POR QUÉ UNA SOLA LÍNEA Y NO UN CUADRO DE SIETE FILAS ═══
 *
 * La versión vertical —una fila por tramo con su importe y su porcentaje— es la que se ve en un
 * reporte de cobranzas, y ocupa diez renglones arriba de todo. Acá el pedido es explícito y va en la
 * otra dirección: *"minimalismo = less is more"*. Los mismos seis números entran en un renglón, se
 * leen de izquierda a derecha del más sano al más viejo, y el cuadro de obras —que es para lo que la
 * pestaña existe— sigue empezando en la primera pantalla.
 *
 * ═══ EL CIERRE ES LA PRUEBA, NO UNA DECORACIÓN ═══
 *
 * La suma de los cinco tramos TIENE que dar el total pendiente, y ese total tiene que ser el mismo
 * `Resta (total)` que publica el cierre de la sección de clientes — que se calcula por otro camino
 * (`todo lo no cancelado − lo cobrado`). Son dos rutas independientes al mismo número: si difieren,
 * hay una fila que no cayó en ningún tramo (típicamente una emisión vacía) y el escritor aborta. Un
 * bloque que no cierra contra el cuadro de abajo sería justo el "número que asusta sin explicación"
 * que el estándar prohíbe.
 */
function seccionCartera(h, refs) {
  const { cob } = refs
  // EL TÍTULO LLEVA LA FECHA VIVA. Una cartera es una foto: sin el día al lado, el lector no sabe si
  // mira la de hoy o la de la última corrida del generador. `TODAY()` la mantiene sola.
  const fTitulo = h.push([`=${quote('1 · COBRANZAS PENDIENTES AL ')}&TEXT(TODAY();"dd/mm/yyyy")`])
  h.rotulos.push({ fila: fTitulo, texto: '1 · COBRANZAS PENDIENTES AL 00/00/0000' })
  // EL ▲ VA EN EL ENCABEZADO DE LOS TRAMOS VENCIDOS y no en cada celda: marca de una sola vez cuáles
  // de las cinco columnas son la alarma, sin repetir el glifo en cada importe.
  h.push(['Cartera', '% venc.', 'Por vencer',
    ...TRAMOS_ANTIGUEDAD.map((t) => `${ALERTA} ${t.clave}`), '', 'Total pendiente'])
  const f = h.n + 1
  const cartera = (crit) => `=${enPesos(cob, 'total', `${abierto(cob, 'estado')};"<>${COBRADO}"`
    + `;${abierto(cob, 'estado')};"<>${NO_VENTA}"${enElAno(cob, 'fechaCobro')}${crit}`)}`
  h.push([
    '⇒ TOTAL POR COBRAR',
    // EL % ES EL DE LO VENCIDO SOBRE EL TOTAL — la única proporción que decide acá. Sin IFERROR y con
    // guarda de cero por el mismo motivo que `pctCobrado`: una cartera vacía devuelve 0, no un vacío
    // que el escritor no puede distinguir de una fórmula rota.
    `=IF(I${f}=0;0;(D${f}+E${f}+F${f}+G${f})/I${f})`,
    cartera(critPorVencer(abierto(cob, 'fechaEmision'), PLAZO_COBRO_DIAS)),
    ...TRAMOS_ANTIGUEDAD.map((t) => cartera(critTramo(abierto(cob, 'fechaEmision'), t, PLAZO_COBRO_DIAS))),
    // LA H QUEDA VACÍA A PROPÓSITO: separa la desagregación (los cinco tramos) del agregado. Es la
    // regla de IFRS 18 de agregación y desagregación, resuelta con aire en vez de con una línea.
    '',
    `=C${f}+D${f}+E${f}+F${f}+G${f}`,
  ])
  h.push([])
  return { fCartera: f }
}

/**
 * SECCIÓN 2 — LAS OBRAS DEL AÑO, POR CLIENTE. Todo fórmula viva.
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
  h.push(['2 · OBRAS DEL AÑO'])
  h.push(['Cliente', '% cob.', 'Venta (neto)', 'Cobrado (total)', ROTULO_RESTA, 'Vencido', 'Materiales (neto)', 'Retenido'])
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
  h.push([ROTULO_TOTAL_ANO, pctCobrado(fTot), `=${todo('neto', `<>${NO_VENTA}`)}`, `=${todo('total', COBRADO)}`,
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

/** Todo lo que Compras le imputó a un CLIENTE en el año, sin mirar la obra. Es el universo del que
 *  sale lo de cada obra, y por eso es también el que cierra la fila SIN IMPUTAR. */
const compradoDeCliente = (cmp, cliente) =>
  `SUMIFS(${abierto(cmp, 'neto')};${abierto(cmp, 'cliente')};"${nombreEnCostos(cliente)}"${enElAno(cmp, 'fecha')})`

/**
 * LO QUE COMPRAS YA LE IMPUTÓ A UNA OBRA.
 *
 * ═══ ACÁ VIVÍA EL EMPAREJAMIENTO POR PROVEEDOR, Y PUBLICABA $0 EN LAS SIETE OBRAS (14/08) ═══
 *
 * El dueño: *"el cuadro 4 en obras costo esta mal, hay gastos en pestaña compras q si se han hecho
 * para las obras señaladas"*. Tenía razón, y el motivo de los tres filtros que fallaban a la vez
 * —proveedor, cliente y fecha— está escrito con los números en el bloque `comprasObra` de
 * obras-datos.mjs, que es donde vive la evidencia y donde se agrega el próximo patrón.
 *
 * LO QUE HAY ACÁ ES EL CAMINO QUE SÍ EXISTE: `cliente` + el texto que el dueño escribió en la
 * columna "Detalles / Obra" de Compras. Un solo SUMIFS por obra, y las dos condiciones son datos de
 * la fuente — ninguna es una deducción mía.
 *
 * ═══ LAS TRES COSAS QUE SE SACARON, Y POR QUÉ CADA UNA ═══
 *
 * EL CORTE POR FECHA DE INICIO SE FUE. En construcción se compra ANTES de arrancar: los $27.358.960
 * de Quattropani se facturaron el 29/07 para una obra que empieza el 18/08. El filtro `≥ inicio` no
 * medía "lo gastado en esta obra", medía "lo gastado después de una fecha", y tiraba justo el gasto
 * que el dueño estaba reclamando. Queda la ventana del AÑO, que es la que la pestaña declara en su
 * subtítulo — no una ventana nueva, la misma que usan la venta y la cobranza.
 *
 * EL `MIN` CONTRA EL MONTO PROYECTADO SE FUE. Existía porque el emparejamiento era por proveedor y
 * un proveedor factura a varias obras del mismo cliente: sin el tope, plata de otra obra inflaba
 * ésta. Con el emparejamiento por obra ese riesgo desaparece —las filas SON de esta obra— y el tope
 * pasa a hacer daño: taparía exactamente lo que hay que ver. BSA lo muestra: proyectado $2.108.281,
 * comprado $7.955.772. Con `MIN` se publicaría $2.108.281 y la pestaña diría que va justa una obra
 * que ya gastó casi cuatro veces su proyección. Un número recortado para que la resta no dé negativo
 * es un número que miente para quedar prolijo.
 *
 * EL FILTRO POR OBRA PROYECTABLE SE FUE. Devolvía $0 si la obra no tenía fechas; el gasto real de
 * una obra no depende de que se le haya puesto cronograma.
 *
 * @returns la fórmula, o `'=0'` cuando la obra no declara texto — que NO es "no gastó nada": es "no
 *   hay ninguna compra que la nombre". Esa plata no se reparte: se ve entera en la fila SIN IMPUTAR.
 */
function compradoDeObra(cmp, o) {
  const patron = comprasObraDe(o)
  if (!patron) return '=0'
  // El `*` a los dos lados es a propósito: en K conviven "Planta de BSA", "Camion - BSA" y
  // "Excavadora - BSA", y las tres son la misma obra. La igualdad exacta dejaría afuera dos de ellas.
  return `=SUMIFS(${abierto(cmp, 'neto')};${abierto(cmp, 'cliente')};"${nombreEnCostos(o.cliente)}"`
    + `;${abierto(cmp, 'obra')};"*${patron}*"${enElAno(cmp, 'fecha')})`
}

/**
 * UNA OBRA EN EL CUADRO DE VENTA: UNA SOLA FILA.
 *
 * ═══ ACÁ VIVÍAN 40 FILAS DE DETALLE Y EL DUEÑO LAS MANDÓ SACAR (14/08) ═══
 *
 * Textual: *"no es de utilidad el listado de materiales o lo q sea q compone cada obra, necesito mas
 * claridad en certificaciones proyectadas, inicio fin, pagos realizados, cobros futuros"*. Cada obra
 * abría su explosión de gastos —Gasoil · ACA, Nafta · VILLA DEL PINO ×2, Alambrón · Mercado Libre…—:
 * dos tercios de la pestaña eran renglones de $129.523 que no cambian ninguna decisión, compitiendo
 * por la atención con los importes que sí.
 *
 * NO SE PERDIÓ NINGÚN NÚMERO. El insumo sigue entero en `obras-datos.mjs` (que es de donde lo leen
 * Jornales, el Calendario y el Libro — ninguno leía estas filas), y lo que las filas calculaban —el
 * costo proyectado y el neteo contra Compras— pasó a dos columnas del cuadro 4. Lo que se sacó es la
 * DESAGREGACIÓN, no el dato.
 *
 * LA GRAMÁTICA DE COLUMNA ES LA MISMA QUE LA DEL CUADRO DE CLIENTES, Y ES DELIBERADO: `C` es el total
 * del concepto, `D` lo que ya se movió, `E` lo que falta y `F` la alarma. El dueño llamó "confuso" a
 * esta pestaña justamente porque una misma columna cambiaba de significado según la fila.
 */
function bloqueObra(h, refs, o, idx, unica = false) {
  const { cob } = refs
  // La definición de "se puede proyectar" vive en obras-datos.mjs, no acá: repetirla como
  // `o.inicio && o.fin` es la segunda versión del mismo concepto esperando a divergir.
  const proyectable = esProyectable(o)
  const fProt = h.n + 1

  const dela = { needle: o.ventaTexto, unica }
  // EL RÓTULO YA NO SE ARMA ACÁ: lleva las fechas del dueño y un ⚠ vivo, y las dos cosas se pueden
  // probar sin construir una grilla entera. Ver `rotuloDeObra`.
  const rot = rotuloDeObra(o, idx)
  h.rotulos.push({ fila: fProt, texto: rot.texto })
  h.push([rot.celda,
    // ACÁ VIVÍA EL SEMÁFORO `✓/⚠`, que miraba la cobranza vencida. Sale por el estándar del dueño
    // (13/08, el modelo que señaló no usa un solo glifo) y porque no informaba: daba ✓ en las siete
    // obras, y su única señal —hay vencido— la publica la columna F con el importe, que dice cuánto.
    // Y DESDE EL 13/08 NO ES EL % DE CARTERA SINO EL DE CONTRATO, que es lo que el dueño pidió ver.
    // EL % ES EL DE CONTRATO CERTIFICADO, que es lo que el dueño pidió ver ("el % como avance de
    // contrato, no de cartera") y lo que la AIA G702 publica como `% (G/C)`: obra completada sobre
    // valor contratado. Numerador y denominador son los dos al NETO.
    pctContrato(fProt, o.contrato),
    // ═══ LA `C` ES EL CERTIFICADO, Y HASTA HOY ERA `venta()` — LA MISMA FÓRMULA DEL CUADRO 2 ═══
    //
    // Certificar es reconocer avance CONTRA UN CONTRATO; facturar es cualquier cosa que se le cobre
    // al cliente. Mientras coincidan el error no se ve, y en seis de las siete obras coinciden. La
    // séptima —Quattropani— factura materiales en la MISMA factura que el anticipo, sobre un contrato
    // de sólo mano de obra: publicaba 136,4% y "Falta certificar" en negativo. El dueño: *"esta mal
    // eso de quattropani, revisa bien"*. El porqué entero y la aritmética contra el contrato firmado
    // están en `obras-certificado.mjs`; acá sólo se elige la fórmula.
    //
    // SIN HITOS SE VUELVE A `venta()` A PROPÓSITO: BSA no declara contrato ni hitos, y publicar un
    // vacío donde antes había un importe sería perder el dato para arreglar otra obra.
    formulaCertificado(o.cert, `G${fProt}`) ?? venta(cob, o.cliente, dela),
    cobrado(cob, o.cliente, dela), restaCobrar(cob, o.cliente, dela),
    vencido(cob, o.cliente, dela),
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
    o.contrato ?? SIN_CONTRATO,
    saldoContrato(fProt, o.contrato, 'G'),
    proximoCobro(cob, o.cliente, dela)])
  return { clave: o.clave, fProt, proyectable, contrato: o.contrato ?? null }
}

/** El glifo de la columna de auditoría cuando ninguna compra nombra la obra. Es una alarma, no un
 *  cero: la plata existe y está en la fila SIN IMPUTAR, esperando que Compras diga a qué obra va. */
export const SIN_TEXTO_EN_COMPRAS = `${ALERTA} ninguna compra la nombra`

/**
 * UNA OBRA EN EL CUADRO DE COSTO: lo que se pensaba gastar contra lo que ya se compró.
 *
 * ═══ QUÉ PREGUNTA CONTESTA, Y QUÉ NO PUEDE CONTESTAR ═══
 *
 * El dueño pidió *"presupuesto vs costo proyectado"*. Lo que este cuadro publica es **costo
 * proyectado vs comprado**: su propia explosión de gastos por obra (el insumo que él cargó el 07/08)
 * contra lo que Compras ya le imputó a esa obra.
 *
 * ═══ DICE "COMPRADO" Y NO "PAGADO", Y LA PALABRA IMPORTA (14/08) ═══
 *
 * La columna se llamaba `Pagado (real)` y medía el "Importe" de Compras, que es la FACTURA — no el
 * pago. De los $39,5M que empareja hoy, $11,8M están en estado "Pendiente / 🟡 Por vencer": llamarlos
 * pagados es presentar una obligación abierta como plata que ya salió, justo al lado de la columna
 * de la que se decide qué se paga. Cuando haga falta lo PAGADO de verdad, la fuente es otra columna
 * de Compras ("Monto Pagado", que además viene con IVA) y es una decisión del dueño, no una
 * renombrada: por eso acá se publica lo que la fórmula mide de verdad y se lo dice.
 *
 * ═══ LA COLUMNA F DECLARA DE DÓNDE SALE CADA PESO ═══
 *
 * En la gramática de la pestaña la F es la alarma, y acá cumple las dos funciones con el mismo dato:
 * dice el texto de Compras por el que la obra emparejó —para que el dueño pueda ir a la fuente,
 * filtrar por él y ver las mismas filas— y cuando no hay texto, dice que no lo hay. Sin esto, la
 * columna D sería un número sin forma de auditarlo.
 *
 * ═══ EL LÍMITE ESTRUCTURAL, QUE NINGÚN EMPAREJAMIENTO ARREGLA ═══
 *
 * `Costo proyectado` son $145.855.278 y $126.974.442 de eso (el 87%) es MANO DE OBRA. La mano de obra
 * NO está en Compras ni va a estarlo: se paga por Jornales. Así que la columna `Resta proyectado`
 * nunca va a bajar a cero por más compras que entren, y no es un defecto de este cuadro: es que el
 * proyectado y el comprado miden universos distintos. Se declara en el subtítulo del bloque.
 *
 * EL PRESUPUESTO DE LA COTIZACIÓN NO ESTÁ Y NO SE INVENTA. Se buscó donde tiene que estar: la tabla
 * `presupuestos` del OS tiene DOS filas, las dos colgadas de obras de `public.obras` que están
 * pausadas o cerradas ("Galpones" y "Pisos"), y en una de las dos el costo presupuestado está
 * declarado en sus propias notas como INFERIDO (monto ÷ 1,30 por el markup objetivo), no observado.
 * Ninguna de las siete obras en curso tiene presupuesto de costo cargado. Publicar una columna que
 * sale "—" en seis de siete filas, y en la séptima una inferencia, sería presentar una estimación
 * como un hecho — que es exactamente lo que las reglas de oro prohíben. Queda declarado como gap.
 */
function bloqueCosto(h, refs, o, idx) {
  const { cmp } = refs
  const f = h.n + 1
  const rot = rotuloDeObra(o, idx, SECCION_COSTO)
  h.rotulos.push({ fila: f, texto: rot.texto })
  const proyectado = totalEgresos(o)
  const patron = comprasObraDe(o)
  h.push([rot.celda, `=IF(C${f}=0;0;D${f}/C${f})`, proyectado, compradoDeObra(cmp, o), `=C${f}-D${f}`,
    patron ? `Compras: "${patron}"` : SIN_TEXTO_EN_COMPRAS])
  h.tipeadas.push({ fila: f, col: 2 })
  return { clave: o.clave, fila: f, proyectado, patron }
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
  // EL PLAZO DE COBRO SE DECLARA ACÁ Y NO EN NINGÚN OTRO LADO. Es el único parámetro de la pestaña
  // que no se puede deducir mirando la tabla: sin él, "Vencido" es un número sin definición. Va en el
  // subtítulo por la misma razón que el criterio de venta y el tipo de cambio — es un criterio, no una
  // explicación. (El número vive una sola vez, en `cobranzas-vencido.mjs`; acá se lo cita.)
  // EL CRITERIO DEL CUADRO 4 ENTRA ACÁ Y NO EN UNA GLOSA APARTE (14/08). Son las dos cosas que no se
  // pueden deducir mirando esa tabla: que el costo real se empareja por el TEXTO de "Detalles / Obra"
  // de Compras (por eso hay una columna que dice cuál), y que el costo proyectado incluye la mano de
  // obra, que se paga por Jornales y no puede aparecer nunca del lado comprado. Sin la segunda, la
  // columna "Resta proyectado" se lee como una deuda con proveedores y es, en su mayor parte, sueldos.
  h.push([`=${quote(`${ANO} · venta al NETO (devengado) · cobranzas al TOTAL neto de retenciones (percibido)`
    + ` · vencido a los ${PLAZO_COBRO_DIAS} días de la fecha de emisión`
    + ' · contrato leído de la ORDEN DE COMPRA de Cobranzas'
    + ' · costo real = Compras imputada por su texto de "Detalles / Obra", al neto y sin corte por fecha de inicio'
    + ' (se compra antes de arrancar); el costo proyectado incluye la mano de obra, que va por Jornales'
    + ' · USD valuado a ')}&`
    + `IFERROR(TEXT(${RANGO_TC};"$ #.##0,00");"(sin tipo de cambio)")`])
  h.push([])

  // EL TITULAR VA PRIMERO. El estándar del área lo pide con todas las letras —"las 2-3 cifras que se
  // deciden arriba, el resto es el detalle de esas cifras"— y hasta hoy esta pestaña abría con el
  // cuadro de clientes: había que recorrerla entera para saber si la cartera estaba sana.
  const s0 = seccionCartera(h, refs)
  const s1 = seccionObrasDelAno(h, refs, clientes)

  // ═══ DOS CUADROS DE OBRA, Y ES LA RESPUESTA A "NO ENTRA EN UNO SOLO" (14/08) ═══
  //
  // El dueño pidió ver por obra: inicio y fin, contratado, certificado, falta certificar, cobrado,
  // vencido, cuándo entra lo que falta, y costo proyectado contra pagado. Son NUEVE magnitudes más un
  // porcentaje y una fecha, sobre nueve columnas de las cuales la primera es el rótulo. No entran, y
  // ensanchar la pestaña es exactamente lo que él ya rechazó dos veces (la glosa y el margen salieron
  // por eso). Así que se parte por PREGUNTA, no por comodidad: el cuadro 3 contesta "¿cómo viene el
  // contrato?" y el 4, "¿cómo viene el gasto?". Cada uno se lee entero sin mirar el otro.
  //
  // LA GRAMÁTICA DE COLUMNA ES LA MISMA EN LOS TRES CUADROS DE ABAJO, y es lo que arregla el "es
  // confuso" del dueño: `C` es el total del concepto, `D` lo que YA se movió, `E` lo que FALTA
  // moverse, `F` la alarma. Vale para la cartera de un cliente, para el contrato de una obra y para
  // el gasto de una obra — tres cosas distintas que se leen igual.
  //
  // LOS RÓTULOS DEL CUADRO 3 SON LOS DE LA AIA G702/G703 «Application and Certificate for Payment»,
  // que es el formulario con el que se certifica obra en el mundo desde hace medio siglo: valor
  // contratado (`Scheduled Value`), obra completada a la fecha (`Work Completed to Date`), el
  // porcentaje entre las dos (`% (G/C)`) y el saldo para terminar (`Balance to Finish`). No se
  // inventó un cuadro: se usó el que ya existe.
  h.push([`${SECCION_OBRAS} · OBRAS — CONTRATO, CERTIFICACIÓN Y COBRO`])
  h.push(['Obra', '% cert.', 'Certificado (neto)', 'Cobrado (total)', 'Por cobrar (total)', 'Vencido',
    'Contratado', 'Falta certificar', 'Próx. cobro'])
  // Cuántas obras declaradas tiene cada cliente: es lo que habilita la regla del dueño de arriba.
  const porCliente = obras.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const bloques = obras.map((o, i) => bloqueObra(h, refs, o, i + 1, porCliente.get(o.cliente) === 1))
  const suma = (col, filas) => `=${filas.map((f) => `${col}${f}`).join('+')}`
  const filasObra = bloques.map((b) => b.fProt)
  const fTot2 = bloques.length ? h.n + 1 : null
  if (fTot2) {
    // EL CIERRE DEL CONTRATO CITA SÓLO LAS OBRAS QUE LO DECLARAN, y no es un detalle de
    // implementación: las otras publican el guion "—", y una fila que suma texto depende de que
    // Sheets lo ignore. Puede que lo ignore; no lo puedo VERIFICAR desde acá sin escribir en el
    // archivo, y una pestaña que descansa en una conducta que nadie probó es la definición de un
    // número que miente despacio. Citando sólo las filas con número, el resultado es el mismo en
    // Sheets y en el evaluador en frío — y el test puede afirmarlo.
    const conContrato = bloques.filter((b) => b.contrato).map((b) => b.fProt)
    const contratado = conContrato.length ? suma('G', conContrato) : SIN_CONTRATO
    const falta = conContrato.length ? suma('H', conContrato) : SIN_CONTRATO
    // El % del cierre se arma con los MISMOS dos lados que las filas: lo certificado de las obras CON
    // contrato (= contratado − falta) sobre ese contratado. Tomar la C del total metería el
    // certificado de BSA en el numerador y no en el denominador, y el cierre diría un avance que
    // ninguna fila respalda.
    const pct = conContrato.length ? `=IF(G${fTot2}=0;0;(G${fTot2}-H${fTot2})/G${fTot2})` : SIN_CONTRATO
    h.push([`⇒ TOTAL — ${bloques.length} OBRAS`, pct, suma('C', filasObra), suma('D', filasObra),
      suma('E', filasObra), suma('F', filasObra), contratado, falta, ''])
  }
  h.push([])

  // ═══ CUADRO 4 — EL GASTO. LO QUE ANTES ERAN 40 RENGLONES DE DETALLE, EN DOS COLUMNAS ═══
  //
  // `Costo proyectado` es la explosión de gastos que el dueño cargó por obra (`obras-datos.mjs`),
  // sumada: es su estimación, y se dibuja como tal. `Comprado (real)` es lo que Compras le imputó a
  // esa obra por su texto de "Detalles / Obra": es un hecho, y la columna F dice cuál es ese texto
  // para que se pueda ir a la fuente a verificarlo. El porqué del camino está en `compradoDeObra`.
  h.push([`${SECCION_COSTO} · OBRAS — COSTO PROYECTADO Y COMPRAS IMPUTADAS`])
  // La fila del encabezado se GUARDA, no se deduce restando: el día que el cuadro gane o pierda una
  // fila, una resta a mano deja el formato apuntando a la obra 4.1 y nadie lo ve hasta publicar.
  const fEncCosto = h.n + 1
  h.push(['Obra', '% comprado', 'Costo proyectado', 'Comprado (real)', 'Resta proyectado', 'Imputado por'])
  const costos = obras.map((o, i) => bloqueCosto(h, refs, o, i + 1))
  const filasCosto = costos.map((c) => c.fila)
  const fTot3 = costos.length ? h.n + 1 : null
  let fSinImputar = null
  if (fTot3) {
    h.push([`⇒ TOTAL — ${costos.length} OBRAS`, `=IF(C${fTot3}=0;0;D${fTot3}/C${fTot3})`,
      suma('C', filasCosto), suma('D', filasCosto), suma('E', filasCosto)])

    // ═══ LA FILA QUE HACE QUE NADA SE PIERDA NI SE REPARTA (14/08) ═══
    //
    // El dueño ya sacó dos veces una fila "⇒ sin ubicar" que daba $0 todos los días, y tenía razón:
    // un renglón que nunca dice nada no es un control, es ruido. ÉSTA ES LO CONTRARIO — hoy vale
    // $35.260.034 y nombra un trabajo concreto: hay compras cargadas a estos clientes que no dicen a
    // qué obra van. Mientras esa plata no esté en ninguna obra, se ve entera acá.
    //
    // Y ES EL CONTROL DE INTEGRIDAD DEL CUADRO, no un comentario: se calcula como TODO lo que Compras
    // le imputó a estos clientes MENOS lo que las obras se llevaron. Por construcción, obras +
    // sin imputar = el total del cliente en la fuente. Si mañana el dueño escribe un texto nuevo en
    // "Detalles / Obra", esta fila baja sola; si un patrón dejara de emparejar, sube sola. No hay
    // forma de que un peso desaparezca en silencio, que es exactamente lo que pasaba antes.
    //
    // LA DIRECCIÓN DEL ERROR ES DELIBERADA: lo dudoso cae ACÁ, nunca en una obra. Un emparejamiento
    // por parecido que acierta el 60% mete el gasto de una obra en otra y nadie se entera; un peso de
    // más en esta fila se ve a la primera mirada.
    const clientes3 = [...new Set(obras.map((o) => o.cliente))]
    if (clientes3.length) {
      fSinImputar = h.n + 1
      h.push(['⇒ SIN IMPUTAR — compras de estos clientes que no dicen la obra', '', '',
        `=${clientes3.map((c) => compradoDeCliente(refs.cmp, c)).join('+')}-D${fTot3}`, '',
        `${ALERTA} falta escribir la obra en Compras`])
    }
  }

  // LA LÍNEA DE CARTERA ES UN CIERRE: lleva el "$" y la regla arriba, como los otros dos totales.
  const totales = [s0.fCartera, s1.fTot, fTot2, fTot3, fSinImputar].filter(Boolean)
  return {
    filas: h.filas,
    /** La fila del titular de cartera. El escritor la necesita para el control de cierre: los cinco
     *  tramos tienen que dar el mismo total que la `Resta` del cuadro de clientes, por otro camino. */
    fCartera: s0.fCartera,
    tipeadas: h.tipeadas,
    /** Fila → texto visible, para las celdas cuyo contenido es una fórmula que arma un rótulo. */
    rotulos: h.rotulos,
    protagonistas: [...filasObra, ...filasCosto],
    /** Las filas del cuadro de costo. El formateador las necesita aparte: su `C` es una PROYECCIÓN
     *  (la explosión del dueño) y su `D` un HECHO, al revés que en los cuadros de venta. */
    filasCosto,
    totales,
    /** Los cierres de cada cuadro, en orden — el escritor los cita por nombre y no por posición. */
    fTotObras: fTot2,
    fTotCosto: fTot3,
    /** La fila SIN IMPUTAR del cuadro 4. El escritor la usa para el control de cierre: obras +
     *  sin imputar tiene que dar lo que Compras le imputó a estos clientes, por otro camino. */
    fSinImputar,
    /** Las filas del cuadro 4 cuya columna F lleva TEXTO de auditoría y no un importe: el
     *  encabezado, las siete obras y el SIN IMPUTAR. El formateador las necesita porque la F está
     *  declarada como columna de alarma en pesos y dibujaría el texto pegado al margen derecho. */
    textoEnF: [fEncCosto, ...filasCosto, fSinImputar].filter(Boolean),
    /** El cierre del cuadro de clientes: es el que concilia contra Cobranzas entera. */
    fTotClientes: s1.fTot,
    bloques,
    fClientes: s1.fClientes,
    filaDeCliente: s1.filaDeCliente,
    /** Las filas donde la H lleva un IMPORTE y no una fecha ni un texto: el `Retenido` del cuadro de
     *  clientes y el `Falta certificar` del de obras. El formateador las necesita porque un importe
     *  con formato de fecha se dibuja como un día del año 2110 — ya pasó con $7.671.680. */
    importeEnH: [...rango(s1.fClientes[0], s1.fClientes[1]), s1.fTot, ...filasObra, ...(fTot2 ? [fTot2] : [])],
  }
}

/** Los enteros de `a` a `b`, inclusive. */
const rango = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r }

/**
 * EL RÓTULO DE UNA OBRA, CON SUS FECHAS DE INICIO Y FIN.
 *
 * ═══ POR QUÉ (13/08, pedido del dueño) ═══
 *
 * *"necesito q la pestaña obras me marque bien claro los datos q habian sido enviados respecto a las
 * fechas de inicio y fin de obra"*. Tenía razón y el defecto era grande: las siete obras TIENEN sus
 * fechas declaradas desde el 07/08 en `obras-datos.mjs` —él mismo las mandó con las explosiones de
 * gastos— y la pestaña **no publicaba ninguna**. La única vez que las nombraba era en negativo, para
 * avisar que faltaban. Un dato que el dueño entregó y que el cuadro no muestra es peor que un dato
 * que falta: él cree que ya está a la vista.
 *
 * VA EN EL RÓTULO Y NO EN DOS COLUMNAS NUEVAS. Es la misma decisión que ya se tomó con el proveedor
 * del egreso cuando el dueño mandó sacar la glosa: la celda que IDENTIFICA la fila es donde se
 * identifica la fila. Dos columnas de fecha para un dato que no se suma ni se compara entre obras
 * costarían 276px y volverían a empujar los importes fuera de pantalla — que es exactamente por lo
 * que la columna I salió.
 *
 * ═══ EL ⚠ ES UNA FÓRMULA VIVA, NO UN TEXTO TIPEADO ═══
 *
 * La marca de "esta obra ya pasó su fecha de fin" se calcula con `TODAY()` DENTRO del Sheet. Si se
 * tipeara acá, la obra que vence mañana quedaría sin marcar hasta que alguien se acuerde de correr el
 * generador — o sea, justo el día que la marca sirve para algo. Con `TODAY()` la pestaña se entera
 * sola. Es el mismo criterio con que `vencido` mide la cobranza atrasada.
 *
 * NO SE MARCA "ATRASADA": se marca que PASÓ EL FIN. La grilla no sabe si la obra terminó — el avance
 * físico no está en ninguna fuente que esta pestaña lea, y afirmar un atraso sin medirlo sería
 * presentar una inferencia como un hecho. Lo que el glifo dice es verificable: la fecha ya pasó.
 *
 * @returns {{texto:string, celda:string}} `texto` es lo que se VE (lo necesita `anchoColumnaA`, que
 *   mide píxeles: midiendo la fórmula daría una columna de 900px); `celda` es lo que se escribe.
 */
export function rotuloDeObra(o, idx, seccion = SECCION_OBRAS) {
  const base = `${seccion}.${idx} · ${o.cliente} — ${o.obra}`
  // SIN FECHAS NO SE INVENTA NINGUNA. El aviso es el que ya existía y sigue siendo texto plano: no
  // hay ninguna fecha con la que armar un TODAY() y una fórmula que no puede fallar no debe existir.
  if (!esProyectable(o)) return { texto: `${base}   ${ALERTA} sin fechas — no se proyecta`, celda: `${base}   ${ALERTA} sin fechas — no se proyecta` }
  const dm = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}` }
  const texto = `${base} · ${dm(o.inicio)} → ${dm(o.fin)}`
  return { texto: `${texto} ${ALERTA}`, celda: `=${quote(texto)}&IF(TODAY()>${serialISO(o.fin)};" ${ALERTA}";"")` }
}

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
