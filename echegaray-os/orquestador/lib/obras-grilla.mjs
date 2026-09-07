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
import { esProyectable } from './obras-datos.mjs'
import { sumaConUSD } from './cobranzas-contrato.mjs'
// «Certificado» dejo de ser una COLUMNA el 07/09/2026 (dos cuadros, decision del dueno): la formula
// sigue viva en obras-certificado.mjs porque la usa el calculo de hitos del calendario de cobros.
// EL CONTRATO DE LA RÉPLICA `_OBRAS_RAW` VIVE EN UN SOLO LADO: nombre de la pestaña, letras de
// columna, tope del rango y la fórmula que los usa. Ver lib/obras-replica.mjs.
import { formulaCostoProyectado, formulaCostoPorTipo, TIPO } from './obras-replica.mjs'
// EL TIPO DE CAMBIO SE IMPORTA, NO SE ESCRIBE DE NUEVO. Vive UNA vez, en el bloque de CAJA, y esta
// pestaña lo referencia por su nombre: un segundo tipo de cambio sería una segunda verdad para el
// mismo concepto, que es justo lo que la REALIDAD ÚNICA prohíbe.
import { RANGO_TC } from './caja-disponibilidades.mjs'
// LA SEÑAL DE ALERTA VIVE EN UN SOLO LUGAR. Acá estaba tipeado el ⚠, que el PDF no dibuja: la marca
// estaba en la celda y no en la pantalla. Ver `glifos.mjs`.
import { ALERTA } from './glifos.mjs'
// QUÉ ES UNA COBRANZA VENCIDA: una sola definición, con su plazo y sus tramos. Ver el archivo — acá
// vivía el criterio viejo, que medía contra la fecha de cobro ESPERADA y por eso daba siempre cero.
import { PLAZO_COBRO_DIAS, critVencido } from './cobranzas-vencido.mjs'
// LA ESPECIE DE CADA CELDA — de dónde sale su formato. Se declara donde se escribe el valor.
import { ESPECIES, matrizDeEspecies } from './obras-especies.mjs'

export const PESTANA_OBRAS = 'OBRAS'

/**
 * LA FILA DE ENCABEZADO DE UN CUADRO: nueve rótulos, nunca plata.
 *
 * Va como constante y no repetida en cada cuadro porque los tres encabezados son la MISMA cosa. El
 * rótulo se ALINEA con su columna (a la derecha sobre importes) en el escritor, que es donde vive el
 * criterio de alineación de un estado financiero — acá se declara qué ES la celda, no dónde se apoya.
 */
const ENCABEZADO = Object.freeze(Array.from({ length: 11 }, () => 'rotulo'))

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
// ═══ NUEVE → ONCE: EL COSTO SE ABRE (07/09/2026, pedido del dueño) ═══
//
// Textual: *«me dijeras valor de venta y costos totales y discriminado por mano de obra y
// materiales»*. Dos columnas más, y son las que el estándar de la industria pide: un WIP schedule de
// construcción abre el costo a la fecha en mano de obra, materiales, subcontratos y equipos. Acá se
// abre en las DOS que la empresa tiene medidas —la explosión de gastos del dueño clasifica cada
// egreso como `mano_de_obra` o `material`, y no hay una tercera— porque publicar una columna
// «Subcontratos» que siempre sale en cero sería la fila de $0 que él ya sacó dos veces.
//
// LA BRECHA ENTRE LAS DOS ES EL DATO, y por eso van juntas y no sumadas: 87% mano de obra en la
// instalación eléctrica de San Francisco contra 21% en BSA. Dos obras del mismo año con motores
// económicos opuestos, y eso decide cómo se cotiza la próxima.
export const ANCHO_OBRAS = 11

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
export const ANCHO_HISTORICO = 11

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
 *
 * 66 → 72 el 07/09/2026: entraron las tres obras de MESSINA que faltaban contra Cobranzas (Playón
 * para Dilución de Ácido, Adicional tercer muro, Pisos 120 m² + Rampa) y la grilla pasó a 68 filas.
 * El guardián rompió y dijo exactamente a cuánto subirla — que es para lo que existe.
 *
 * SE DEJA HOLGURA Y NO SE CLAVA EN 68 A PROPÓSITO. Con el alto EXACTAMENTE igual a la grilla no queda
 * banda de limpieza: el día que una obra salga, su fila vieja se queda publicada. Cuatro filas de
 * margen son dos obras más — y la limpieza sólo toca lo que el registro de rótulos prueba que es de
 * este generador, así que una anotación del dueño ahí abajo se conserva igual.
 */
export const ALTO_HISTORICO = 72

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
export const ANCHOS_OBRAS = [300, 74, 74, 126, 126, 126, 122, 126, 118, 118, 122]

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
// 07/09/2026: con el cuadro por CLIENTE afuera, la columna que publica lo que falta cobrar se llama
// «Por cobrar» y vive en el cuadro del año. El nombre se exporta desde acá por lo mismo de siempre:
// lo busca el calendario de cobros sobre la pestaña ya publicada, y dos textos tipeados de los dos
// lados divergen sin dar error — el 14/08 el buscador se quedó con «⇒ TOTAL POR COBRAR» y leyó un
// tramo de antigüedad ($3,5M) creyendo leer la Resta del año ($357,5M).
export const ROTULO_RESTA = 'Por cobrar'

/**
 * EN QUÉ NÚMERO DE BLOQUE CAEN LAS OBRAS — y por qué es una constante y no un `2` tipeado.
 *
 * La numeración de bloques tiene que ser CONSECUTIVA y sin huecos: un cuadro que va "1, 3" hace creer
 * que falta algo. Al entrar el titular de cartera como bloque 1, las obras pasaron de 2.x a 3.x, y
 * ese número aparecía en dos lugares —el título del bloque y el rótulo de cada obra—. Con la
 * constante, agregar o sacar un bloque arriba no puede dejar la mitad de la pestaña renumerada y la
 * otra mitad no.
 */
export const SECCION_OBRAS = 2

/**
 * EL RÓTULO DEL CIERRE DEL CUADRO DE OBRAS — exportado por lo mismo que `ROTULO_TOTAL_ANO`: lo busca
 * quien LEE la pestaña publicada, y dos textos tipeados de los dos lados divergen sin dar error.
 */
// ═══ EL CIERRE DICE «⇒ TOTAL» Y NADA MÁS (07/09/2026) ═══
//
// Decía «⇒ TOTAL — 10 OBRAS», y eso AFIRMABA una población que sólo tienen tres de sus seis columnas:
// «Contratado» suma las 5 obras que declaran contrato en Cobranzas y «Costo proyectado» las 6 que
// tienen explosión de gastos cargada. Un cierre que promete diez y suma cinco es un número que miente
// despacio. Cuántas obras hay se lee sin ayuda: las filas están numeradas 2.1 … 2.10.
export const ROTULO_TOTAL_OBRAS = '⇒ TOTAL'

// ACÁ VIVÍAN `SECCION_COSTO = 4` Y `SECCION_MATERIALES = 5`. Los dos cuadros salieron el 07/09/2026
// por decisión del dueño («Dos cuadros: el año y las obras»): el costo pasó a ser una COLUMNA del
// cuadro de obras y los materiales previstos se mudaron a `public.obra_egreso_proyectado`, que es de
// donde los lee el Libro de Movimientos. Ver el encabezado de `seccionElAno`.

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
/** COBRADO: el importe que entró, con IVA. */
const cobrado = (cob, cliente, extra = {}) => `=${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)}`

/** RESTA COBRAR: lo facturado/proyectado que todavía no entró, con IVA. Sale del ESTADO, no de una
 *  columna de saldo — la col M no es un saldo (ver el encabezado). */
const restaCobrar = (cob, cliente, extra = {}) =>
  `=${sumaCobranzas(cob, 'total', cliente, extra, `"<>${NO_VENTA}"`)}-(${sumaCobranzas(cob, 'total', cliente, extra, `"${COBRADO}"`)})`

/**
 * EL GLIFO DE "ACÁ NO HAY NADA QUE DECIR", y por qué no puede ser una celda en blanco.
 *
 * Un blanco es indistinguible de una fórmula que se rompió en silencio —el defecto que
 * `columnasDesparejas` existe para cazar— así que toda celda cuyo vacío sea LEGÍTIMO tiene que
 * decirlo con un carácter. Vive una sola vez porque el control lo mira: si una columna publicara dos
 * glifos distintos para el mismo "no hay dato", el que se olvidara de actualizarse volvería a contar
 * como defecto.
 */
export const GUION = '—'

/**
 * LO QUE SE PUBLICA CUANDO NO HAY CONTRATO. No es un cero y no es una celda en blanco.
 *
 * Un 0 afirmaría que el contrato vale cero. El guion dice lo único cierto: esta obra no declara
 * contrato en ninguna de sus filas de Cobranzas.
 */
export const SIN_CONTRATO = GUION

/**
 * LO QUE SE PUBLICA CUANDO LA OBRA NO TIENE EXPLOSIÓN DE COSTO CARGADA (07/09/2026).
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA, Y ERA MÍO ═══
 *
 * Las tres obras de MESSINA que entraron hoy no tienen archivo de costo en Drive. Se las dejó
 * publicando `#N/A` a propósito —«un dato que falta se ve; uno inventado, no»— y la idea era
 * correcta pero el vehículo estaba mal: el escritor de esta pestaña VERIFICA que no queden celdas en
 * error, así que las veinte `#N/A` lo hicieron abortar y declarar la pestaña ROTA. El dueño la vio
 * rota en el archivo.
 *
 * El guion hace exactamente el mismo trabajo sin romper nada, y ya es el idioma de esta pestaña para
 * lo mismo: `SIN_CONTRATO` publica un guion cuando una obra no declara contrato. Un 0 diría que la
 * obra no cuesta nada; el guion dice que no se sabe.
 */
export const SIN_COSTO = GUION

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
 * LA FÓRMULA NO ES AMBIGUA: con contrato la D lleva el número leído de la Orden de Compra; sin
 * contrato lleva el texto `—`. Por eso el control relee con `render: 'FORMULA'`.
 *
 * 07/09/2026: la columna «Saldo contrato» salió con el rediseño de dos cuadros —era la magnitud
 * intermedia entre el contrato y el cobro, y el dueño se quedó con las puntas—. El control se achica
 * a lo que sigue existiendo: que la D publique el contrato de esa obra, o el guion. Nada intermedio.
 *
 * @param {{clave:string, fProt:number, contrato:number|null}[]} bloques
 * @param {string[][]} publicadoFormula la relectura de la pestaña con render FORMULA
 * @returns {string[]} un motivo por obra mal publicada; vacío si están todas bien
 */
export function contratoMalPublicado(bloques = [], publicadoFormula = []) {
  const malas = []
  for (const b of bloques) {
    // La D lleva el contrato: un NUMERO leido de la ORDEN DE COMPRA de Cobranzas, o el guion.
    const enD = String(publicadoFormula[b.fProt - 1]?.[3] ?? '').trim()
    if (b.contrato) {
      if (Number(enD) !== Number(b.contrato)) {
        malas.push(`${b.clave}: contrato $${b.contrato.toLocaleString('es-AR')} y la D quedo "${enD}"`)
      }
    } else if (enD !== SIN_CONTRATO) {
      malas.push(`${b.clave}: sin contrato declarado y la D quedo "${enD}" en vez de "${SIN_CONTRATO}"`)
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
 * LO VENCIDO DEL AÑO ENTERO: la MISMA definición que `vencido`, sin el filtro de cliente.
 *
 * NO ES LA SUMA DE LAS OBRAS Y NO PUEDE SERLO. Las obras declaradas son un subconjunto de Cobranzas
 * —MESSINA factura trabajos fuera de sus obras—, así que sumar las filas de abajo publicaría un
 * vencido menor que el real y bajaría solo cada vez que una obra sale de la lista. Sale de la fuente.
 */
const vencidoDelAno = (cob) => `=${enPesos(cob, 'total',
  `${abierto(cob, 'estado')};"<>${COBRADO}";${abierto(cob, 'estado')};"<>${NO_VENTA}"`
  + `${enElAno(cob, 'fechaCobro')}${critVencido(abierto(cob, 'fechaEmision'), PLAZO_COBRO_DIAS)}`)}`

/**
 * LA PRÓXIMA FECHA DE COBRO pendiente.
 *
 * `MINIFS` devuelve 0 cuando no hay ninguna pendiente, y un 0 en una celda con formato de fecha se
 * dibuja "30/12/1899". Por eso el 0 se mapea a una fecha imposible (`LEJOS`) ANTES del MIN, y cuando
 * el MIN queda en esa fecha imposible la celda publica el GUION: una obra sin cobranzas pendientes no
 * tiene próxima fecha, y eso es un guion, no un error — y tampoco un blanco (ver el cierre).
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
  // ═══ SIN NADA PENDIENTE VA EL GUION, NO EL BLANCO (24/08) ═══
  //
  // Esta fórmula ya declaraba arriba que una obra sin cobranzas pendientes "no tiene próxima fecha, y
  // eso es un guion, no un error" — y publicaba un BLANCO. San Francisco 3.4 cobró todo el 21/08, su
  // celda I salió vacía y `columnasDesparejas` la contó como fórmula rota: el timer del Flujo de Caja
  // terminó en FAILURE con la pestaña ya publicada y sana. El control no estaba de más — no puede
  // distinguir un vacío legítimo de uno roto, y no debe: el que sabe cuál es cuál es esta fórmula, y
  // lo dice acá. Después del guion, una I vacía vuelve a significar UNA sola cosa: se rompió algo.
  return `=IF(${min}>=${LEJOS};"${GUION}";TEXT(${min};"dd/mm")&" · "&${forma})`
}

/** Mismo constructor de grilla que el anexo de CAJA: push devuelve la fila 1-based, y toda celda
 *  vacía sale con el centinela VACIO ("es mía y va vacía") para que la fusión la limpie. */
function hoja() {
  const filas = []
  const especies = []
  const h = {
    filas,
    tipeadas: [],
    /** Fila → el texto que la celda MUESTRA, cuando la celda es una fórmula que arma un rótulo.
     *  `anchoColumnaA` mide píxeles de texto: sin esto mediría la fórmula y daría una columna de
     *  900px por un rótulo de 60 caracteres. */
    rotulos: [],
    /** Las filas que son ENCABEZADO DE COLUMNA. El formateador las necesita y hasta el 07/09/2026 las
     *  reconocía por una expresión regular sobre el texto de su columna A — que es anclar el formato
     *  en el rótulo de una fila: el día que el encabezado del año dejó la A vacía, la fila se dibujó
     *  como plata. Se declaran donde se escriben. */
    encabezados: [],
    /** Fila → la ESPECIE declarada de cada celda (o `null`). Es lo que decide su `numberFormat`:
     *  ver el porqué entero en `obras-especies.mjs`. Se declara acá, donde se escribe el valor, y no
     *  en una lista de rangos del escritor — dos lugares que dicen lo mismo sobre la misma celda
     *  divergen apenas alguien agrega una columna, y divergieron. */
    especies,
    get n() { return filas.length },
    /**
     * @param {any[]} c los valores de la fila
     * @param {(string|null)[]} [esp] la especie de cada celda, del vocabulario de `obras-especies`
     */
    push(c = [], esp = []) {
      const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
      while (r.length < ANCHO_OBRAS) r.push(VACIO)
      r.length = ANCHO_OBRAS
      // UNA ESPECIE QUE NO EXISTE ES UN ERROR DE PROGRAMA, NO UN FORMATO FEO: se rompe acá, al armar
      // la grilla, y no seis semanas después mirando un importe crudo en la pestaña del dueño.
      for (const e of esp) {
        if (e && !ESPECIES[e]) throw new Error(`especie desconocida "${e}" en la fila ${filas.length + 1} de ${PESTANA_OBRAS}`)
      }
      filas.push(r)
      especies.push(Array.from({ length: ANCHO_OBRAS }, (_, i) => esp[i] ?? null))
      return filas.length
    },
  }
  return h
}

/**
 * CUADRO 1 — EL AÑO. UNA LÍNEA, CUATRO NÚMEROS.
 *
 * ═══ ACÁ VIVÍAN DOS CUADROS Y EL DUEÑO LOS SACÓ (07/09/2026) ═══
 *
 * Textual: *"la pestaña obras no es world class, es inusable y espantosa"*, y antes *"realmente no se
 * entiende nada"*. Se le ofreció el rediseño y eligió: **"Dos cuadros: el año y las obras"**, con las
 * bajas nombradas una por una — el cuadro de cobranzas por tramo (1), el cuadro por CLIENTE (2), el
 * cuadro de costo separado (4) y el de materiales previstos (5).
 *
 * Lo que había era una pestaña de 68 filas con CINCO cuadros que contestaban cinco preguntas
 * distintas, tres de ellas sobre las mismas obras con columnas que cambiaban de significado entre
 * cuadro y cuadro. Cada uno estaba bien argumentado por separado; juntos eran ilegibles. La pestaña
 * pasa a 19 filas.
 *
 * ═══ QUÉ SE PERDIÓ, DICHO EN VOZ ALTA ═══
 *
 * · LA ANTIGÜEDAD DE LA CARTERA (los cinco tramos de vencimiento). Queda el importe vencido total.
 *   Desde cuándo está vencido cada peso ya no se ve acá — se ve en Cobranzas, que es su fuente.
 * · LA VENTA POR CLIENTE. El año se lee entero o por obra; el corte intermedio salió.
 * · EL COSTO REAL IMPUTADO POR COMPRAS y su fila «SIN IMPUTAR». Con el cuadro 4 se va el control que
 *   probaba que obras + sin imputar = lo que Compras le cargó a esos clientes. La columna que queda
 *   es el costo PROYECTADO (la explosión del dueño), que es lo que decide al cotizar la próxima.
 * · LOS MATERIALES PREVISTOS ÍTEM POR ÍTEM. Esa lista alimentaba el Cash Flow; su fuente se mudó a
 *   `public.obra_egreso_proyectado` ANTES de sacar el cuadro, no después. Ver el libro.
 *
 * ═══ EL AÑO SALE DE COBRANZAS ENTERA, NO DE LA SUMA DE LAS OBRAS ═══
 *
 * Las obras declaradas son un SUBCONJUNTO de lo que se factura: MESSINA vende trabajos fuera de sus
 * obras. Si este cuadro sumara las filas de abajo, el número grande se movería cada vez que una obra
 * entra o sale de la lista y nadie se enteraría. Sale de la fuente, y el escritor verifica que las
 * obras quepan adentro — que es el control que atrapa el doble conteo.
 */
function seccionElAno(h, refs) {
  const { cob } = refs
  // EL TÍTULO LLEVA LA FECHA VIVA: sin el día al lado, el lector no sabe si mira la foto de hoy o la
  // de la última corrida del generador. `TODAY()` la mantiene sola.
  // ═══ EL TIPO DE CAMBIO VIAJA EN EL TÍTULO DEL BLOQUE, NO EN UNA LÍNEA DE PROSA (07/09/2026) ═══
  //
  // Vivía en el subtítulo de la fila 2, y el dueño VACIÓ esa celda: su regla de oro es «minimalismo
  // extremo, sin aclaraciones ni explicaciones de nada», y un subtítulo es una explicación. La guarda
  // respeta ese borrado y no lo vuelve a escribir — pero el TC no es una explicación, es el DATO con
  // el que están valuadas las columnas. Un importe en pesos que contiene dólares convertidos sin
  // declarar a qué cambio es un número sin criterio, que es la regla de oro 2.
  //
  // Va como FÓRMULA sobre el rango con nombre de CAJA: escrito como texto queda viejo al día
  // siguiente y nadie se entera.
  const fTitulo = h.push([`=${quote(`1 · EL AÑO ${ANO} · AL `)}&TEXT(TODAY();"dd/mm/yyyy")`
    + `&IFERROR(${quote('  ·  USD ')}&TEXT(${RANGO_TC};"#.##0,00");"")`], ['rotulo'])
  h.rotulos.push({ fila: fTitulo, texto: `1 · EL AÑO ${ANO} · AL 00/00/0000  ·  USD 0.000,00` })
  // LOS CUATRO NÚMEROS SE ALINEAN CON LAS COLUMNAS DEL CUADRO DE ABAJO: la D es el compromiso, la E
  // lo que ya entró, la F lo que falta y la G la alarma. La misma gramática arriba y abajo es la
  // mitad de por qué esto se lee de un vistazo y los cinco cuadros no se leían.
  h.encabezados.push(h.push(['', '', '', 'Vendido (neto)', 'Cobrado (total)', 'Por cobrar', `${ALERTA} Vencido`],
    ENCABEZADO))
  const f = h.n + 1
  // COBRANZAS ENTERA, sin filtrar por cliente: una fila con la columna de cliente vacía entra igual.
  const todo = (campo, estado) => enPesos(cob, campo, `${abierto(cob, 'estado')};"${estado}"`
    + `${enElAno(cob, campo === 'neto' ? 'fechaVenta' : 'fechaCobro')}`)
  h.push([ROTULO_TOTAL_ANO, '', '',
    `=${todo('neto', `<>${NO_VENTA}`)}`,
    `=${todo('total', COBRADO)}`,
    // LOS PARÉNTESIS NO SON DE ESTILO: desde que la suma vale `todo − dólares + dólares×TC`, un
    // `A-B` sin agrupar restaría sólo el primer término de B y sumaría los otros dos.
    `=(${todo('total', `<>${NO_VENTA}`)})-(${todo('total', COBRADO)})`,
    vencidoDelAno(cob)],
  ['rotulo', null, null, 'monedaTotal', 'monedaTotal', 'monedaTotal', 'alertaTotal'])
  h.push([])
  return { fAno: f }
}

/**
 * UNA OBRA: UNA SOLA FILA, NUEVE COLUMNAS.
 *
 * ═══ ACÁ VIVÍAN DOS FILAS POR OBRA, EN DOS CUADROS DISTINTOS (07/09/2026) ═══
 *
 * El cuadro 3 contestaba "¿cómo viene el contrato?" y el 4 "¿cómo viene el gasto?", cada uno con su
 * propia fila para la misma obra y con la misma columna significando cosas distintas en cada uno. El
 * dueño eligió una sola fila por obra. Entró lo que decide y salió lo intermedio:
 *
 *   · INICIO y FIN pasan a ser COLUMNAS. Vivían pegadas al final del rótulo desde el 13/08 —cuando
 *     no había lugar—, y ahí no se pueden comparar entre obras: hay que leer sesenta caracteres para
 *     encontrar una fecha. La columna A baja de ~70 a ~40 caracteres, que es la otra mitad de por
 *     qué esto se lee y lo anterior no.
 *   · «Certificado» y «% cert.» SALEN. Son la magnitud intermedia entre el contrato y el cobro: el
 *     dueño ya ve lo contratado (D), lo que entró (E) y lo que falta (F). Se conserva la fórmula
 *     (`formulaCertificado`) porque la usa el cálculo de hitos, pero no se publica.
 *   · «Comprado (real)» SALE con el cuadro 4. Lo que queda es el COSTO PROYECTADO —la explosión que
 *     el dueño cargó— porque es lo que decide al cotizar la próxima. El comprado real medía sólo
 *     materiales: el 87% del costo es mano de obra y NO está en Compras, así que publicado al lado
 *     del contratado se leía como un margen enorme que no existe.
 *
 * LA GRAMÁTICA DE COLUMNA ES LA MISMA QUE LA DEL CUADRO DEL AÑO: `D` el compromiso, `E` lo que ya se
 * movió, `F` lo que falta, `G` la alarma. Arriba y abajo dicen lo mismo en el mismo lugar.
 */
function bloqueObra(h, refs, o, idx, unica = false) {
  const { cob } = refs
  // La definición de "se puede proyectar" vive en obras-datos.mjs, no acá: repetirla como
  // `o.inicio && o.fin` es la segunda versión del mismo concepto esperando a divergir.
  const proyectable = esProyectable(o)
  const fProt = h.n + 1
  const dela = { needle: o.ventaTexto, unica }
  const rot = rotuloDeObra(o, idx)
  h.rotulos.push({ fila: fProt, texto: rot.texto })
  // UNA OBRA SIN COSTO CARGADO NO PUBLICA UNA FÓRMULA QUE NO PUEDE RESOLVER.
  // `formulaCostoProyectado` devuelve `NA()` cuando la réplica no tiene filas para la obra —a
  // propósito, para que el hueco se vea—, y el escritor de esta pestaña ABORTA si queda una celda en
  // error. El 07/09 se publicaron 20 `#N/A` por esto exacto. El guion dice lo mismo sin romper.
  const sinCosto = Boolean(o.sinCosto)
  const rotuloObra = o.obra ?? o.clave
  h.push([rot.celda,
    // LAS FECHAS VAN COMO SERIAL Y NO COMO TEXTO: un "05/08" crudo lo auto-parsea Sheets y a veces
    // muestra 46239. Sin fecha va el guion, con especie `texto`, y NO una fecha inventada.
    o.inicio ? serialISO(o.inicio) : SIN_CONTRATO,
    o.fin ? serialISO(o.fin) : SIN_CONTRATO,
    o.contrato ?? SIN_CONTRATO,
    cobrado(cob, o.cliente, dela), restaCobrar(cob, o.cliente, dela),
    vencido(cob, o.cliente, dela),
    // ═══ EL `NA()` DE LA RÉPLICA NO PUEDE LLEGAR A LA CELDA (07/09/2026) ═══
    //
    // `formulaCostoProyectado` devuelve `NA()` cuando `_OBRAS_RAW` no tiene filas para la obra —a
    // propósito, para que el hueco se vea— y el escritor de esta pestaña ABORTA con una sola celda en
    // error. El 07/09 se publicaron 20 `#N/A` por esto exacto y el dueño avisó que la pestaña quedó
    // rota. El `sinCosto` de arriba cubre las obras que YA se sabe que no tienen costo cargado; esto
    // cubre el otro caso, el que nadie declaró: la réplica no se pudo escribir, o se escribió con la
    // obra con otro nombre. El hueco se sigue viendo —con el guion, que es el idioma de esta pestaña
    // para un dato que falta— y la pestaña se publica.
    sinCosto ? SIN_COSTO : `=IFNA(${formulaCostoProyectado(rotuloObra).slice(1)};"${SIN_COSTO}")`,
    sinCosto ? SIN_COSTO : `=IFNA(${formulaCostoPorTipo(rotuloObra, TIPO.mo).slice(1)};"${SIN_COSTO}")`,
    sinCosto ? SIN_COSTO : `=IFNA(${formulaCostoPorTipo(rotuloObra, TIPO.material).slice(1)};"${SIN_COSTO}")`,
    proximoCobro(cob, o.cliente, dela)],
  ['rotulo', o.inicio ? 'fecha' : 'texto', o.fin ? 'fecha' : 'texto', 'monedaTotal', 'monedaTotal',
    'monedaTotal', 'alertaTotal', 'monedaTotal', 'moneda', 'moneda', 'rotulo'])
  return { clave: o.clave, fProt, proyectable, contrato: o.contrato ?? null, sinCosto }
}

export const SIN_FECHA_PREVISTA = 'sin fecha'

/**
 * LOS ÍTEMS DEL CUADRO 5 COMO LOS DECLARA `obras-datos.mjs` — LA SEMILLA, YA EN FORMA DE CELDA.
 *
 * Es la ÚNICA definición de cómo se dibuja un ítem previsto, y por eso vive acá y no en la fusión:
 * el que siembra un ítem nuevo tiene que producir exactamente la misma fila que produciría este
 * generador solo. Dos renderizados del mismo ítem se desincronizan sin dar error, y la diferencia
 * aparecería como un ítem "distinto" que nunca vuelve a emparejar.
 *
 * LA ESPECIE DE LA D ES PARTE DEL DATO: una fecha única va como SERIAL con especie `fecha` (Sheets
 * la muestra DD/MM); varias cuotas van como TEXTO con «·», que el parser de Sheets no puede
 * convertir a fecha a escondidas — un «24/08» crudo se auto-parseaba a serial y mostraba 46258.
 *
 * @param {Array} obras las de `obras-datos.mjs`
 * @returns {Array<{rotulo:string, familia:string, proveedor:string, fecha:number|string,
 *   especieFecha:'fecha'|'texto', previsto:number, nota:string, origen:'semilla'}>}
 */
export function itemsSemilla(obras = []) {
  const items = []
  for (const o of obras) {
    for (const e of (o.egresos ?? [])) {
      const multi = Array.isArray(e.cuotas) && e.cuotas.length > 0
      const fecha = multi
        ? e.cuotas.map((c) => `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`).join(' · ')
        : (e.fechaEstimada ? serialISO(e.fechaEstimada) : SIN_FECHA_PREVISTA)
      items.push({
        rotulo: `${o.obra ?? o.clave} — ${e.concepto}`,
        familia: e.familia ?? '',
        proveedor: e.proveedor ?? 'sin proveedor',
        fecha,
        especieFecha: multi || !e.fechaEstimada ? 'texto' : 'fecha',
        previsto: e.monto,
        nota: e.nota ?? '',
        origen: 'semilla',
      })
    }
  }
  return items
}

/**
 * LA GRILLA COMPLETA DE `OBRAS` — DOS CUADROS Y NADA MÁS.
 *
 * @param {object} ctx `obras` (defecto: OBRAS_FUTURAS de obras-datos.mjs, inyectable en los tests),
 *   `refs` (defecto: REFS_OBRAS; el escritor pasa las resueltas por rótulo).
 * @returns {{filas:Array, especies:Array, protagonistas:number[], totales:number[], bloques:Array,
 *   fAno:number, fTotObras:number|null}} `bloques` expone la anatomía de cada obra para que la
 *   verificación mire la estructura y no el texto de una fila.
 */
export function grillaObras(ctx = {}) {
  const refs = { ...REFS_OBRAS, ...ctx.refs }
  const obras = ctx.obras ?? []
  const h = hoja()

  h.push([PESTANA_OBRAS], ['rotulo'])
  // ═══ LA FILA 2 DECLARA PROCEDENCIA; NO ES DONDE SE ESCRIBEN LOS CRITERIOS (06/09/2026) ═══
  //
  // Acá vivían 450 caracteres con las seis definiciones de la pestaña. El dueño, 05/09: «minimalismo
  // extremo y no tenga aclaraciones ni explicaciones de nada», y el contrato le da a la fila 2 un
  // tope de 120 caracteres justamente para que no vuelva a ser el lugar donde se explica la pestaña.
  //
  // LOS CRITERIOS, QUE SIGUEN VIGENTES Y AHORA VIVEN ACÁ:
  //   · la venta va al NETO y es devengada; las cobranzas al TOTAL neto de retenciones y percibidas;
  //   · «vencido» es a los `PLAZO_COBRO_DIAS` días de la fecha de emisión (el número vive una sola
  //     vez, en `cobranzas-vencido.mjs`);
  //   · el contrato se lee de la ORDEN DE COMPRA de Cobranzas — por eso no es un número mágico;
  //   · el COSTO es PROYECTADO: la explosión de gastos que cargó el dueño, mano de obra incluida.
  //     No es lo comprado. La mano de obra se paga por Jornales y nunca aparece en Compras.
  //
  // EL TIPO DE CAMBIO SE QUEDA, y no por excepción: no es un criterio, es el DATO con el que están
  // valuadas las columnas en dólares. Va como fórmula sobre el rango con nombre de CAJA porque
  // escrito como texto queda viejo al día siguiente y nadie se entera.
  h.push([`=${quote('Cobranzas y costo proyectado · USD a ')}&`
    + `IFERROR(TEXT(${RANGO_TC};"$ #.##0,00");"(sin tipo de cambio)")&${quote(' · al ')}&TEXT(TODAY();"dd/mm/yyyy")`], ['rotulo'])
  h.push([])

  const ano = seccionElAno(h, refs)

  h.push([`${SECCION_OBRAS} · OBRAS`], ['rotulo'])
  // EL ▲ VA EN EL ENCABEZADO Y NO EN CADA CELDA: marca de una sola vez cuál es la columna de alarma.
  // LAS DOS COLUMNAS DEL DESGLOSE LLEVAN EL PUNTO MEDIO ADELANTE: es la notación de subtotal del
  // estándar —una partida que cuelga de la de arriba— y ahorra repetir «Costo» tres veces.
  h.encabezados.push(h.push(['Obra', 'Inicio', 'Fin', 'Contratado', 'Cobrado', 'Por cobrar',
    `${ALERTA} Vencido`, 'Costo proyectado', '· mano de obra', '· materiales', 'Próx. cobro'],
  ENCABEZADO))
  // Cuántas obras declaradas tiene cada cliente: es lo que habilita la regla del dueño de `tramos`.
  const porCliente = obras.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  // ═══ LAS OBRAS SE ORDENAN POR FECHA DE INICIO, NO POR CLIENTE (07/09/2026) ═══
  //
  // Un cuadro se ordena por la magnitud que decide (ISO 24896 «Notation for business reporting», la
  // versión ISO de IBCS publicada el 11/06/2026). Acá la magnitud es el TIEMPO: la pestaña contesta
  // qué obras hay de acá a fin de año, y agrupadas por cliente el ojo tiene que reconstruir el
  // calendario a mano. En orden de inicio la columna Fin queda casi monótona y se ve de un vistazo
  // qué está por cerrar y qué recién arranca.
  //
  // ES ADEMÁS LA MISMA LECTURA QUE LA APP: el módulo Obras de app.ecsas.com.ar lista estas mismas
  // diez obras por fecha de inicio. Dos órdenes distintos para la misma cartera hacen dudar de si son
  // la misma lista — que es justo lo que la REALIDAD ÚNICA existe para evitar.
  //
  // SIN FECHA VA AL FINAL, no al principio: una obra sin inicio no es la más vieja, es la que le falta
  // un dato, y ordenarla primero la disfrazaría de la más urgente.
  const enElTiempo = [...obras].sort((a, b) => (a.inicio ?? '9999').localeCompare(b.inicio ?? '9999'))
  const bloques = enElTiempo.map((o, i) => bloqueObra(h, refs, o, i + 1, porCliente.get(o.cliente) === 1))
  const suma = (col, filas) => `=${filas.map((f) => `${col}${f}`).join('+')}`
  const filasObra = bloques.map((b) => b.fProt)
  const fTotObras = bloques.length ? h.n + 1 : null
  if (fTotObras) {
    // EL CIERRE CITA SÓLO LAS FILAS QUE PUBLICAN UN NÚMERO. Las otras publican el guion "—", y una
    // suma que ignora texto depende de una conducta de Sheets que no puedo VERIFICAR desde acá sin
    // escribir en el archivo. Citando sólo las filas con número, el resultado es el mismo en Sheets y
    // en el evaluador en frío, y el test puede afirmarlo.
    const conContrato = bloques.filter((b) => b.contrato).map((b) => b.fProt)
    const conCosto = bloques.filter((b) => !b.sinCosto).map((b) => b.fProt)
    h.push([ROTULO_TOTAL_OBRAS, '', '',
      conContrato.length ? suma('D', conContrato) : SIN_CONTRATO,
      suma('E', filasObra), suma('F', filasObra), suma('G', filasObra),
      conCosto.length ? suma('H', conCosto) : SIN_COSTO,
      conCosto.length ? suma('I', conCosto) : SIN_COSTO,
      conCosto.length ? suma('J', conCosto) : SIN_COSTO, ''],
    ['rotulo', null, null, 'monedaTotal', 'monedaTotal', 'monedaTotal', 'alertaTotal', 'monedaTotal',
      'monedaTotal', 'monedaTotal', 'rotulo'])
  }

  return {
    filas: h.filas,
    /** LA ESPECIE DECLARADA de cada celda, tal como la escribió quien la escribió — sin resolver.
     *  El auditor la usa para nombrar la celda que publica un valor sin decir qué es. */
    especiesDeclaradas: h.especies,
    /** LA MATRIZ COMPLETA, sin agujeros: de acá sale el `numberFormat` de las nueve columnas en todas
     *  las filas. Que no tenga agujeros es la mitad de la cura — un formato que nadie repone en cada
     *  corrida es estado que sobrevive, y así seis celdas de `Vencido` quedaron en TEXTO. */
    especies: matrizDeEspecies(h.filas.length, h.especies, ANCHO_OBRAS),
    tipeadas: h.tipeadas,
    /** Las filas de encabezado de columna, declaradas por quien las escribe. */
    encabezados: h.encabezados,
    /** Fila → texto visible, para las celdas cuyo contenido es una fórmula que arma un rótulo. */
    rotulos: h.rotulos,
    protagonistas: filasObra,
    totales: [ano.fAno, fTotObras].filter(Boolean),
    /** La fila del cuadro del año. El escritor la usa para el control de doble conteo: las obras son
     *  un subconjunto de Cobranzas, así que NUNCA pueden sumar más que el año. */
    fAno: ano.fAno,
    /** El cierre del cuadro de obras. */
    fTotObras,
    bloques,
  }
}

/**
 * EL RÓTULO DE UNA OBRA: QUIÉN ES, Y SI YA PASÓ SU FECHA DE FIN.
 *
 * ═══ LAS FECHAS SALIERON DEL RÓTULO Y SON COLUMNAS (07/09/2026) ═══
 *
 * Entraron acá el 13/08 —*"necesito q la pestaña obras me marque bien claro… las fechas de inicio y
 * fin de obra"*— porque no había columnas libres: las nueve estaban ocupadas y dos columnas de fecha
 * costaban 276px. Con el rediseño de dos cuadros sobran, así que las fechas van donde se pueden
 * COMPARAR entre obras, que es una columna. El rótulo queda en ~40 caracteres.
 *
 * ═══ EL ⚠ SE QUEDA ACÁ, Y SIGUE SIENDO UNA FÓRMULA VIVA ═══
 *
 * La marca de "esta obra ya pasó su fecha de fin" se calcula con `TODAY()` DENTRO del Sheet. Tipeada
 * en la corrida, la obra que vence mañana quedaría sin marcar hasta que alguien se acuerde de correr
 * el generador — justo el día que la marca sirve. Va en la A y no en la celda de Fin porque esa
 * celda es un SERIAL con formato de fecha: un `IF()` que le concatena un glifo la vuelve texto y deja
 * de ser una fecha comparable.
 *
 * NO SE MARCA "ATRASADA": se marca que PASÓ EL FIN. La grilla no sabe si la obra terminó —el avance
 * físico no está en ninguna fuente que esta pestaña lea— y afirmar un atraso sin medirlo sería
 * presentar una inferencia como un hecho. Lo que el glifo dice es verificable: la fecha ya pasó.
 *
 * @returns {{texto:string, celda:string}} `texto` es lo que se VE (lo necesita `anchoColumnaA`, que
 *   mide píxeles: midiendo la fórmula daría una columna de 900px); `celda` es lo que se escribe.
 */
export function rotuloDeObra(o, idx, seccion = SECCION_OBRAS) {
  const base = `${seccion}.${idx} · ${o.cliente} — ${o.obra}`
  // SIN FECHAS NO SE INVENTA NINGUNA. El aviso es texto plano: no hay ninguna fecha con la que armar
  // un TODAY(), y una fórmula que no puede fallar no debe existir.
  if (!esProyectable(o)) {
    const avisa = `${base}   ${ALERTA} sin fechas — no se proyecta`
    return { texto: avisa, celda: avisa }
  }
  return {
    texto: `${base} ${ALERTA}`,
    celda: `=${quote(base)}&IF(TODAY()>${serialISO(o.fin)};" ${ALERTA}";"")`,
  }
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
