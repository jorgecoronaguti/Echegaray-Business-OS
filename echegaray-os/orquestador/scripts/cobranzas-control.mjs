#!/usr/bin/env node
// Detector permanente de cobros duplicados o sin fecha, adentro de la pestaña Cobranzas.
//
// "Revisá el tema cobranzas, no puede haber nada ni duplicado ni fuera de consideración" — y al
// auditarla aparecieron dos casos por $20.500.876, todos en julio:
//   · Filas 50 y 54: MISMO ID (47), mismo cliente, mismo monto ($16.200.000), misma fecha de cobro
//     (17/7), las dos "Cobrado" y en efectivo. Sólo cambia cómo está escrito el concepto.
//   · Filas 55 y 56: la misma factura de MESSINAS por $4.300.876. La 55 tiene número de comprobante
//     y está "Facturado"; la 56 no tiene comprobante y quedó "Proyectado". La proyección no se borró
//     cuando se facturó de verdad.
// En un mes en que las cobranzas Civil dan $105,8M, $20,5M de fantasma no es un detalle.
//
// NO BORRA NADA. El dueño fue explícito: "mucho cuidado con romper o perder información". Marcar y
// avisar es reversible; borrar una fila que resultó ser un cobro real, no. La decisión de cuál de
// las dos filas sobra es de quien conoce el cobro.
//
// LO QUE SÍ HACE: deja el detector escrito y vivo, así el próximo duplicado se ve el día que se
// carga y no seis meses después. Es la diferencia entre auditar una vez y tener un control.
//
// DÓNDE LO PONE, Y POR QUÉ IMPORTA: el bloque va a la DERECHA (columnas Y en adelante), no abajo.
// El cash flow suma Cobranzas!$5:$200; un bloque de control con números puesto en la fila 70 se
// sumaría a sí mismo como si fuera un cobro. Ya pasó una vez en esta planilla.
//
//   node orquestador/scripts/cobranzas-control.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { ECHEQS_TERCEROS, CORTE as BANCO_CORTE } from '../lib/banco-santander.mjs'
import { MARCA_ENDOSADO } from '../lib/cash-flow-lineas.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { esIndistinguible, plataEnJuego, esCobroYaRevisado } from '../lib/cobranzas-duplicado.mjs'
// Lo que el dueño ya revisó no vuelve a marcarse con ⚠. Ver lib/decisiones-hallazgos.mjs.
import { CONTROLES, decisionesDe, rotuloDecision } from '../lib/decisiones-hallazgos.mjs'
import { ALERTA, ALERTA_HEREDADA, variantesDeMarca } from '../lib/glifos.mjs'
// EL CRUCE CONTRA EL EXTRACTO VIVO. El núcleo es puro y se testea sin Google; acá sólo se lee y se
// escribe. `leerCobro` es el MISMO lector que usa el cuadre: dos lectores de Cobranzas se
// desincronizan, y el que se olvide de leer hasta BB deja de ver el endoso sin dar un error.
import { leerCobro } from '../lib/cobranzas-en-cashflow.mjs'
import { esCobrado } from '../lib/cobranzas-repaso.mjs'
import { cruzarConElBanco, textoDeRespaldo, desmiente, MARCA_SIN_RESPALDO } from '../lib/cobranzas-respaldo-banco.mjs'
import { corteDelExtracto } from '../lib/libro-respaldo-banco.mjs'
import { RANGO_BANCO } from '../lib/cobranzas-cuadre-vivo.mjs'
import { leerTipoCambio } from '../lib/tipo-cambio.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cobranzas'
const DRY = process.argv.includes('--dry')

// Los rangos de datos, iguales a los que usa el cash flow.
const F0 = 5, F1 = 200
const G = `$G$${F0}:$G$${F1}`   // Obra / Cliente
const M = `$M$${F0}:$M$${F1}`   // TOTAL a cobrar, neto de retenciones (=J+K-L)
const Q = `$Q$${F0}:$Q$${F1}`   // Fecha de cobro
const O = `$O$${F0}:$O$${F1}`   // Estado

// La ÚNICA definición de "dos cobros que no se pueden distinguir". Se comparte con el control de
// efectivo de CAJA: dos definiciones del mismo concepto es lo que la regla de fuente única prohíbe.
const INDIST = esIndistinguible(PESTAÑA, F0, F1)
const PLATA = plataEnJuego(PESTAÑA, F0, F1)
// LO QUE DISTINGUE UN COBRO DE OTRO cuando el cliente, el monto y la fecha coinciden.
// Se agregaron el 20/07 porque el detector marcó como duplicadas las filas 39 y 40 —dos cobros de
// $10.000.000 a LA ESTRELLA el mismo día— y el dueño avisó que son DOS CONCEPTOS DISTINTOS. Tenía
// razón: yo miraba tres columnas de una planilla que tiene diez. Un cobro se identifica por su
// comprobante, su orden de compra o su concepto; si alguno difiere, son cobros distintos y punto.
const E = `$E$${F0}:$E$${F1}`   // N° Comprobante
const H = `$H$${F0}:$H$${F1}`   // Orden de compra
const I = `$I$${F0}:$I$${F1}`   // Concepto
// DÓNDE VAN LAS COLUMNAS, Y POR QUÉ ESTÁS LEYENDO ESTO. La primera versión de este script escribió
// en X y Z:AB porque las vi vacías en las filas de abajo. NO estaban vacías: X, Y, Z y AA son el
// desglose de retenciones de las facturas de ARCOR, y la columna L es su SUMA — así que al pisarlas
// cambió el TOTAL Bruto de 9 filas. Pisé $2.487.910 de retenciones reales y los rótulos de X, Z y
// AA. Los importes se pudieron reconstruir contra la réplica de Supabase; los rótulos no.
// Por eso ahora el bloque va a BA en adelante, verificado vacío en toda la altura de la pestaña, y
// el script CHEQUEA que esté vacío antes de escribir. Mirar unas filas y suponer no alcanza.
const C_VALOR = 53              // BB: qué dice el BANCO de ese valor (endosado, en custodia, cobrado)
const C_FLAG = 52               // BA: la marca por fila
const C_CTRL = 54               // BC: el bloque de control

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ANCHO DE LAS CINCO COLUMNAS, DECLARADO ACÁ Y EN NINGÚN OTRO LADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ ESTÁ ESCRITO (15/08). Este script escribe CINCO columnas y hasta hoy declaraba el ancho de
// TRES: BA, BC y BD. La BB —los veredictos del banco, la columna con las frases más largas del
// bloque— y la BE —las notas— se quedaban con el ancho que les hubiera dejado el layout anterior o
// una persona. Resultado medido por `auditar-pantalla`: 17 de los 21 textos cortados del bloque
// estaban justamente en esas dos columnas sin dueño.
//
// Y NO ES QUE FALTARA PONERLES UN NÚMERO: es que el ancho de una columna es de la COLUMNA ENTERA, así
// que o lo decide UNO y los demás lo leen, o gana el último que corre. `reparar-textos.mjs` ensancha
// por su cuenta cualquier columna cuyo texto no entre y que no esté gobernada, y corre DESPUÉS que
// este generador: mientras el texto no entre, los dos se van a disputar la misma propiedad en cada
// pasada. La forma de apagar esa disputa no es prohibirle al otro que escriba — es que el texto
// entre, y para eso el ancho y la redacción tienen que decidirse juntos, que es lo que pasa acá.
//
// CADA NÚMERO SALE DEL PEOR TEXTO QUE ESTE SCRIPT PUBLICA EN ESA COLUMNA, medido en caracteres contra
// su cuerpo tipográfico (≈ 0,57 px por punto y por carácter, el mismo factor que usa el detector).
export const ANCHOS_CONTROL = Object.freeze({
  // BA · la marca por fila, cuerpo 9 ⇒ 64 caracteres. Las marcas se acortaron para entrar acá: son
  // por fila y se repiten, y ninguna instrucción de tres renglones mejora por estar cien veces.
  [C_FLAG]: 330,
  // BB · el veredicto del banco, cuerpo 9 ⇒ 97 caracteres. Era 317px con cuerpo 11 (50 caracteres) y
  // el veredicto más largo medía 222: no se leía ni el nombre del defecto. El cuerpo baja a 9 para
  // igualar a su hermana BA —las dos son anotación al costado de la fila, no dato— y con eso el mismo
  // texto necesita un tercio menos de ancho.
  [C_VALOR]: 500,
  // BC · el rótulo de cada línea del control, cuerpo 11 ⇒ 78 caracteres. El más largo mide 76 ("Filas
  // que no se pueden distinguir (mismo cliente, monto y día, SIN concepto)"): entra sin acortarlo, y
  // acortarlo habría sido tirar la definición de qué cuenta esa línea.
  [C_CTRL]: 490,
  // BD · el número. Doce caracteres es el peor caso ("$300.588.858").
  [C_CTRL + 1]: 140,
  // BE · la nota que explica cada línea, cuerpo 9. Su propio ancho son 330px, pero DERRAMA sobre las
  // columnas vacías de la derecha (ver `wrapStrategy` más abajo), así que el espacio real de lectura
  // son 528px ⇒ 102 caracteres. Las cuatro notas que pasaban de eso se acortaron: 227 caracteres no
  // los arregla ningún ancho razonable.
  [C_CTRL + 2]: 330,
})

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// La columna del veredicto del banco, como rango: de ahí sale el contador de sin-respaldo. La letra
// se DERIVA de `C_VALOR` —la misma constante con la que se escribe— porque una letra tipeada acá
// seguiría apuntando a BB el día que la columna se mueva, y el contador daría $0 sin dar un error.
const VB = `$${letra(C_VALOR)}$${F0}:$${letra(C_VALOR)}$${F1}`
/** El comienzo EXACTO de la marca de "cobrado sin respaldo". La fórmula compara contra esto y el
 *  escritor lo produce: escrito dos veces, el contador da 0 el día que se mejore la redacción. */
export const MARCA_ALERTA_RESPALDO = `${ALERTA} ${MARCA_SIN_RESPALDO}`

// Marca de cada fila.
//
// EL ID YA NO ES UNA SEÑAL, Y ESO ES UN ARREGLO, NO UNA PÉRDIDA (21/07). La columna A es
// `=IF(C51="";"";ROW()-4)`: se autonumera y no puede repetirse. Los "IDs repetidos" que este control
// marcaba eran dos celdas donde alguien había pegado "47" encima de la fórmula. Reparadas ésas, un
// detector por ID da cero para siempre — incluso sobre el duplicado real de $16.200.000 de San
// Francisco, que sigue ahí. Por eso la señal pasó a ser la IDENTIDAD DURA del cobro (cliente, monto,
// forma, estado y fecha), definida una sola vez en lib/cobranzas-duplicado.mjs.
//
// Una cuota legítima NO cae acá: comparte cliente y monto pero cobra en fechas distintas.

/** Un texto, listo para entrar en una fórmula: las comillas de adentro se duplican. */
const txt = (s) => `"${String(s).replace(/"/g, '""')}"`
/** NÚCLEO PURO: una cascada de IF a partir de pares [condición, texto]. La primera que se cumple gana. */
const anidar = (pares, ultimo = '""') => pares.reduceRight((acc, [c, t]) => `IF(${c};${t};${acc})`, ultimo)

/**
 * LA MARCA DE CADA FILA, CON LO QUE EL DUEÑO YA REVISÓ ADELANTE DE TODO.
 *
 * ═══ POR QUÉ LAS DECISIONES VAN PRIMERAS (13/08) ═══
 *
 * El dueño ya dijo dos veces —el 20/07 y el 13/08— que la fila 39 (LA ESTRELLA, $10.000.000) NO es un
 * duplicado, y la marca volvía en cada corrida. Un aviso siempre rojo se ignora, y el que se ignora
 * después es el duplicado real de San Francisco que sigue vivo en la misma columna.
 *
 * La liberación es una condición MÁS de esta misma fórmula y va antes que las demás para ganarles.
 * No se libera "el control": se libera esa fila con ese cliente y ese importe (ver
 * `esCobroYaRevisado`). Y no desaparece: la celda pasa a decir quién lo revisó, cuándo y su palabra
 * textual, sin `⚠`.
 *
 * @param {Array} liberadas las decisiones vigentes del dueño para este control
 */
/**
 * LAS CUATRO MARCAS DE FILA, EN UN SOLO LUGAR — y por qué son cortas.
 *
 * ═══ LO QUE DECÍAN ANTES, Y POR QUÉ NO SERVÍA (15/08) ═══
 *
 * La marca de duplicado medía 170 caracteres y la columna que la lleva entra 64: en la pantalla se
 * leía "▲ Otro cobro con el MISMO cliente, monto, forma, estad" y se cortaba ahí, con la instrucción
 * —la parte que decía qué hacer— del lado invisible. Una marca por fila no puede ser un párrafo: se
 * repite en cada fila marcada y no hay ancho que la contenga sin desarmar el bloque.
 *
 * QUÉ SE PERDIÓ Y DÓNDE ESTÁ AHORA: la instrucción no se tiró, se mudó a la NOTA de la línea del
 * control que cuenta esas mismas filas (columna BE). Ahí está una vez, con lugar para decirla entera,
 * en vez de cien veces cortada. La marca dice QUÉ pasa; la nota dice qué hacer.
 *
 * Y ESTÁN ACÁ, JUNTAS, PORQUE EL GUARD LAS NECESITA: la lista de "esto lo escribí yo" se deriva de
 * esta constante en vez de repetir los textos. Copiadas, se desincronizan el día que se mejora una
 * redacción — y este script no reconocería su propia marca, la contaría como texto del dueño y se
 * negaría a escribir.
 */
export const MARCAS_FILA = Object.freeze({
  indistinguible: `${ALERTA} Otro cobro igual en cliente, monto, forma, estado y día`,
  igualEnTodo: `${ALERTA} Igual en TODO — revisá si se cargó dos veces`,
  sinConcepto: 'Sin concepto: no se distingue de su par — completalo',
  proyeccionGemela: `${ALERTA} Proyección con gemela ya facturada — dar de baja una`,
})

export function marcaPorFila(liberadas = []) {
  return `=ARRAYFORMULA(IF(${M}=0;"";${anidar([
    ...liberadas.map((d) => [esCobroYaRevisado(d.forma, PESTAÑA, F0, F1), txt(rotuloDecision(d))]),
    [INDIST, txt(MARCAS_FILA.indistinguible)],
    [`COUNTIFS(${G};${G};${M};${M};${Q};${Q};${E};${E};${H};${H};${I};${I})>1`, txt(MARCAS_FILA.igualEnTodo)],
    [`(COUNTIFS(${G};${G};${M};${M};${Q};${Q})>1)*(${E}="")*(${H}="")*(${I}="")>0`, txt(MARCAS_FILA.sinConcepto)],
    [`(${O}="Proyectado")*(COUNTIFS(${G};${G};${M};${M})>1)>0`, txt(MARCAS_FILA.proyeccionGemela)],
  ])}))`
}

const flagPorFila = marcaPorFila(decisionesDe(CONTROLES.cobroDuplicado))

/** La firma que identifica el bloque como escrito por el OS. Permite rehacerlo sin pisar nada ajeno. */
const FIRMA = 'CONTROL DE COBRANZAS'

export function bloque() {
  // La UNIDAD se declara, no se adivina del rótulo. Antes se infería con una regex sobre el texto
  // de la etiqueta y al renombrar dos filas el 21/07 los conteos pasaron a mostrarse como "$4" y
  // "$2". Un formato que depende de cómo está redactado un rótulo se rompe cada vez que se mejora
  // la redacción, y en silencio.
  const L = (t, f = '', nota = '', unidad = 'moneda') => [t, f, nota, unidad]
  return [
    L(FIRMA),
    L('Se recalcula solo. Si algo da distinto de cero, es trabajo pendiente, no un error del control.'),
    L(''),
    L('Total bruto cargado', `=SUM(${M})`, 'Todo lo que hay en la pestaña.'),
    L('Lo que toma el Cash Flow', `=SUMPRODUCT((${G}<>"")*IF(ISNUMBER(${M});${M};0))`, 'Tiene que ser el mismo número: si no, hay cobros que el cash flow no está viendo.'),
    L('⇒ Diferencia (tiene que ser $0)', `=$${letra(C_CTRL + 1)}$4-$${letra(C_CTRL + 1)}$5`, ''),
    L(''),
    L('Cobros sin fecha de cobro', `=SUMPRODUCT((${G}<>"")*(${Q}="")*IF(ISNUMBER(${M});${M};0))`, 'Están cargados pero no caen en ninguna semana del cash flow.'),
    L('Cobros sin cliente', `=SUMPRODUCT((${G}="")*IF(ISNUMBER(${M});${M};0))`, 'El cash flow los clasifica por unidad de negocio; sin cliente no se sabe de qué obra son.'),
    L(''),
    L(`${ALERTA} POSIBLES DUPLICADOS`),
    // ═══ LAS NOTAS ENTRAN EN SU COLUMNA, Y ESO CAMBIÓ LO QUE DICEN (15/08) ═══
    //
    // La columna de notas lee 102 caracteres. Cuatro de éstas medían 108, 132, 148 y 227: se dibujaban
    // cortadas justo donde empezaba lo que había que hacer. No se arreglan con ancho —227 caracteres
    // pedirían 1.294px— así que se acortaron, y lo que se sacó de cada una está dicho abajo.
    //
    // La marca de la fila se cita por su LETRA DERIVADA, no tipeada: la nota decía "ver la marca en la
    // columna X" y la marca vive en la BA desde que el bloque se mudó. Un puntero a una columna que
    // no es no manda a ningún lado y nadie se entera, porque no da error.
    L('Cobros indistinguibles entre sí (mismo cliente, monto, forma, estado y día)', `=SUMPRODUCT((${INDIST})*(${M}<>0))`, `Cobros distintos ⇒ escribí conceptos distintos. El mismo dos veces ⇒ dá de baja uno. Marca en ${letra(C_FLAG)}.`, 'cantidad'),
    L('Proyecciones con gemela ya facturada', `=SUMPRODUCT((${O}="Proyectado")*(COUNTIFS(${G};${G};${M};${M})>1)*(${M}<>0))`, 'La proyección quedó viva después de emitir la factura. Es el caso de MESSINAS filas 55/56.', 'cantidad'),
    L('Filas idénticas en TODO (cliente, monto, fecha, comprobante, OC y concepto)', `=SUMPRODUCT((COUNTIFS(${G};${G};${M};${M};${Q};${Q};${E};${E};${H};${H};${I};${I})>1)*(${M}<>0))`, 'Esto sí amerita revisar si se cargó dos veces. Una cuota legítima NO cae acá: cobra en otra fecha.', 'cantidad'),
    // Se sacó "NO son duplicados: son cobros a los que": el resto ya lo dice, y era la parte cortada.
    L('Filas que no se pueden distinguir (mismo cliente, monto y día, SIN concepto)', `=SUMPRODUCT((COUNTIFS(${G};${G};${M};${M};${Q};${Q})>1)*(${E}="")*(${H}="")*(${I}="")*(${M}<>0))`, 'No son duplicados: les falta el dato que los diferencia. Completá el concepto, no borres filas.', 'cantidad'),
    // Se sacó la explicación del control de CAJA —que ya vive en la pestaña CAJA— y quedó lo que esta
    // línea necesita para no leerse como un hecho: que es una ESTIMACIÓN y quién puede resolverla.
    L('Plata en juego si esos cobros fueran duplicados', `=${PLATA}`, 'ESTIMACIÓN: de cada par sobraría uno. Cuál sobra lo dice el control de efectivo de CAJA.'),
    L(''),
    L(''),
    // ═══ DEVENGADO DISFRAZADO DE PERCIBIDO ═══
    // El Flujo va por PERCIBIDO. Un "Cobrado" que el extracto no respalda está sumando en INGRESOS
    // REALES, o sea como plata que ya está en la cuenta. NO descuadra ningún cuadre —los dos lados lo
    // cuentan igual— así que ningún control de cuadratura lo iba a encontrar nunca: sólo se ve
    // preguntándole al banco. El contador sale de la columna BB por FÓRMULA, no de un número pegado
    // por el script: se recalcula solo cuando el cruce vuelve a correr.
    L(`${ALERTA} Cobrado que el extracto NO confirma`,
      `=SUMPRODUCT((LEFT(${VB};${MARCA_ALERTA_RESPALDO.length})=${txt(MARCA_ALERTA_RESPALDO)})*IF(ISNUMBER(${M});${M};0))`,
      // Se sacó "hasta saberlo, es devengado, no caja": es la conclusión que el rótulo ya declara.
      'El Cash Flow lo cuenta como ingreso REAL. O falta el movimiento del banco, o el cobro no entró.'),
    L('Facturado y todavía no cobrado', `=SUMPRODUCT((${O}="Facturado")*IF(ISNUMBER(${M});${M};0))`, 'Plata emitida que la empresa está financiando.'),
    L('Proyectado (todavía ni facturado)', `=SUMPRODUCT((${O}="Proyectado")*IF(ISNUMBER(${M});${M};0))`, 'ESTIMACIÓN. Si una proyección ya se facturó, hay que darla de baja o queda contada dos veces.'),
  ]
}

/**
 * QUÉ PASÓ DESPUÉS CON CADA VALOR, según el banco.
 *
 * POR QUÉ (21/07). El dueño: "tenés que cruzar datos, no esperar que yo te diga". Tenía razón: yo
 * había detectado que dos echeq de $10.000.000 estaban ENDOSADOS a Alumetal y lo dejé anotado como
 * "pendiente de tu decisión", mientras el cuadro seguía esperando esos $20.000.000 como ingreso de
 * agosto. Detectar un error y no corregirlo es casi peor que no detectarlo.
 *
 * Cobranzas registra que el echeq se cobró, y es cierto. Lo que no puede saber es qué se hizo
 * después con el valor: eso sólo lo sabe el banco. La marca va al lado de la fila y el cash flow la
 * usa para NO contar como ingreso futuro algo que ya se entregó.
 *
 * EL CRUCE ES POR FECHA DE PAGO + IMPORTE, que es lo único que comparten las dos fuentes: el número
 * de echeq del banco (90020100) no está en ninguna columna de Cobranzas.
 *
 * ═══ LA SEGUNDA FUENTE, Y POR QUÉ HACÍA FALTA (15/08/2026) ═══
 *
 * `ECHEQS_TERCEROS` son OCHO echeqs transcriptos a mano, de un solo emisor, con corte al 22/07. Sirve
 * para lo que fue hecha —decir qué valor se ENDOSÓ, que el extracto no distingue— y no sirve para
 * negar un cobro: "no está en mi lista de ocho" se escribía como "el banco no tiene un echeq con esta
 * fecha e importe". Con esa frase quedaron marcadas cuatro filas de LA ESTRELLA por $50.000.000.
 *
 * Ahora las dos fuentes trabajan juntas, cada una en lo suyo:
 *   · la lista dice qué se endosó o está en custodia (la marca que el Libro necesita para excluirlo);
 *   · `_BANCO_RAW` —el extracto vivo, que se actualiza con cada importación— dice si la plata entró.
 *
 * Y el corte del encabezado se DERIVA del extracto leído, no se tipea: un corte escrito a mano se
 * queda viejo sin gritar, que es lo que pasó durante 23 días.
 */
async function marcarValoresSegunBanco(google) {
  // La grilla, no los valores: la fecha tiene que venir como SERIAL. Leída como texto formateado, un
  // "5/8/2026" hay que volver a parsearlo y ahí es donde se rompe el día que el locale cambie.
  const [grid, extracto, tc] = await Promise.all([
    google.readSheetGrid(ID, `${PESTAÑA}!A${F0}:BC${F1}`),
    // UNFORMATTED_VALUE: ver la nota de `cobranzas-cuadre-vivo`. Con el valor formateado, el extracto
    // entra ilegible y ninguna fila se juzga.
    google.readSheetValues(ID, RANGO_BANCO, { render: 'UNFORMATTED_VALUE' }),
    leerTipoCambio(google, ID).catch(() => ({ tc: null })),
  ])
  const cobros = []
  grid.filas.forEach((f, i) => { const c = leerCobro(f, i + F0, { tipoCambio: tc.tc }); if (c) cobros.push(c) })
  const porFila = new Map(cruzarConElBanco(cobros, extracto, { esCobrado }).veredictos.map((v) => [v.cobro.fila, v]))
  const corte = corteDelExtracto(extracto)
  const corteISO = corte ? new Date(Date.UTC(1899, 11, 30) + corte * 86400000).toISOString().slice(0, 10) : BANCO_CORTE

  const clave = (f, m) => `${f}|${Math.round(m)}`
  const lista = new Map()
  for (const e of ECHEQS_TERCEROS) {
    const [a, mm, d] = e.pago.split('-').map(Number)
    lista.set(clave(`${d}/${mm}/${a}`, e.importe), e)
  }
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F0}:Q${F1}`)
  const marcas = []
  let endosados = 0
  let sinRespaldo = 0
  for (let i = 0; i < F1 - F0 + 1; i++) {
    const f = v[i] ?? []
    const forma = String(f?.[13] ?? '').trim()
    const fecha = String(f?.[16] ?? '').trim()
    const monto = parseMonto(f?.[12])
    // LA LISTA PRIMERO, Y SÓLO PARA LO QUE SÓLO ELLA SABE. Un endoso no se puede leer del extracto:
    // el valor entró y salió sin pasar por la cuenta. Perder esta marca haría que el Libro volviera a
    // emitir $20.000.000 de ingreso que no existen (ver `libro-endosos.mjs`).
    const e = /eche?q/i.test(forma) && fecha && monto ? lista.get(clave(fecha, monto)) : null
    if (e?.estado === 'endosado') {
      endosados++
      marcas.push([`${MARCA_ENDOSADO} a ${e.beneficiario} · echeq ${e.numero} — se entregó, NO va a entrar a la cuenta`])
      continue
    }
    if (e?.estado === 'custodia') { marcas.push([`EN CUSTODIA · echeq ${e.numero} — sigue siendo de la empresa`]); continue }
    // Y para todo lo demás manda el extracto: es la fuente que se actualiza sola y que cubre a todos
    // los clientes, no a uno.
    const r = porFila.get(F0 + i)
    if (!r) { marcas.push(['']); continue }
    if (desmiente(r)) sinRespaldo++
    marcas.push([textoDeRespaldo(r, { alerta: ALERTA, fechaCorte: corteISO })])
  }
  const col = letra(C_VALOR)
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!${col}4`, values: [[`Qué dice el banco de este valor · al ${corteISO}`]] },
    { range: `${PESTAÑA}!${col}${F0}:${col}${F1}`, values: marcas },
  ])
  console.log(`  valores marcados según el banco (extracto al ${corteISO}): ${endosados} endosados`
    + ` · ${sinRespaldo} cobrados que el extracto no confirma`)
}

/**
 * El rótulo de la columna M dice "TOTAL Bruto" y la fórmula es =J+K-L: neto + IVA MENOS retenciones.
 * O sea, lo que efectivamente entra a la cuenta. Bruto sería J+K.
 *
 * POR QUÉ IMPORTA Y NO ES COSMÉTICO: es la columna que el cash flow usa como ingreso. Quien lee
 * "bruto" asume que todavía hay que descontarle retenciones y presupuesta de menos dos veces la
 * misma plata. Un rótulo equivocado en la columna que decide es un error de datos, no de redacción.
 *
 * SE VERIFICA ANTES DE RENOMBRAR. Se lee la fórmula real de la primera fila: sólo si de verdad es
 * J+K-L se corrige el rótulo. Renombrar por lo que yo creo que hace la columna sería exactamente el
 * error que este cambio arregla.
 */
async function corregirRotuloTotal(google) {
  const CORRECTO = 'TOTAL a cobrar (neto de retenciones)'
  const g = await google.readSheetGrid(ID, `${PESTAÑA}!M4:M${F0}`)
  const rotulo = String(g.filas?.[0]?.[0]?.valor ?? '').trim()
  const formula = String(g.filas?.[1]?.[0]?.formula ?? '')
  if (rotulo === CORRECTO) return
  if (!/^=J\d+\+K\d+-L\d+$/.test(formula)) {
    console.log(`  ⚠ no toco el rótulo de M: esperaba =J+K-L y encontré "${formula || '(sin fórmula)'}"`)
    return
  }
  // ═══ REGLA 0 — SI EL DUEÑO YA LO REBAUTIZÓ, GANA ÉL ═══
  // Éste es el único punto del script que reescribe un RÓTULO que una persona podría haber
  // redactado. El resto escribe en una zona propia firmada, y se niega a salir de ahí.
  const { grid: g4, respetadas: r4, ediciones: e4, candidatos: c4 } = await conEdicionesRespetadas(ID, PESTAÑA, [[CORRECTO]], [[rotulo]])
  for (const r of r4) console.log(`  ✋ respeto tu rótulo ("${String(r.suyo).slice(0, 44)}") en vez de "${String(r.mio).slice(0, 44)}"`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!M4`, values: g4 }])
  await guardarRegistro(ID, PESTAÑA, g4, e4, [[rotulo]], c4).catch((e) => console.warn(`  ⚠ registro de rótulos: ${e.message}`))
  console.log(`  rótulo de M corregido: "${rotulo}" → "${CORRECTO}" (la fórmula es ${formula}: descuenta retenciones)`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // EL CANDADO TAMBIÉN ACÁ (24/07). Este control escribe en su zona propia de "Cobranzas", pero es un
  // escritor por rango suelto (no pasa por escribirPreservando), así que el candado no lo cubría solo:
  // en la corrida reactivada tocó Cobranzas aunque estaba bajo candado. Si el dueño tomó la pestaña, no
  // se la toca —ni la zona de control— hasta que la devuelva.
  const { estaBloqueada } = await import('../lib/pestana-bloqueada.mjs')
  if (await estaBloqueada({}, ID, PESTAÑA).catch(() => false)) {
    console.log(`🔒 "${PESTAÑA}" está bajo tu control (candado): no la toco.`)
    return
  }
  const b = bloque()
  console.log(`${PESTAÑA}: marca por fila en ${letra(C_FLAG)}, control en ${letra(C_CTRL)}1:${letra(C_CTRL + 2)}${b.length}`)
  if (DRY) { for (const f of b) console.log('  ', f[0], '|', String(f[1]).slice(0, 50)); return }

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)

  // Nunca más escribir sobre una columna sin haber mirado TODA su altura.
  //
  // Pero el control se rehace todos los días, así que la zona va a tener contenido: el MÍO. Se
  // distingue por la firma que este mismo script deja. Si está la firma, es nuestro y se pisa; si
  // hay algo que no reconozco, me niego. Un guard que también bloquea la reejecución no protege
  // nada — sólo obliga a desactivarlo, que es peor.
  const zona = await google.readSheetValues(ID, `${PESTAÑA}!${letra(C_FLAG)}1:${letra(C_CTRL + 2)}${F1}`)
  const firma = String(zona?.[0]?.[C_CTRL - C_FLAG] ?? '').trim()

  // UN GUARD QUE NO SABE RECONOCER SU PROPIO DESTROZO NO PROTEGE: BLOQUEA.
  //
  // El 21/07 una escritura falló DESPUÉS del borrado y BC1 quedó vacío, con la columna BB todavía
  // escrita por este mismo script. El guard vio "BB ocupada, sin firma en BC1" y se negó a
  // reescribir — o sea, se negó a reparar lo que él mismo acababa de dejar a medias, y la única
  // salida era desactivarlo. Por eso ahora reconoce TODAS las marcas que deja, no sólo una: si lo
  // único ocupado son celdas con texto que este script escribe, la zona es suya.
  // Todo lo que este script puede llegar a escribir en la zona. Se reconoce POR CONTENIDO, no por
  // posición: aprobar por posición equivale a apagar el guard, porque la zona entera es posición
  // suya. Cualquier cosa que no empiece con uno de estos prefijos es del dueño y no se toca.
  // Todo lo que este script puede llegar a escribir en la zona. Se reconoce POR CONTENIDO, no por
  // posición: aprobar por posición equivale a apagar el guard, porque la zona entera es posición
  // suya. Cualquier cosa que no salga de esta lista es del dueño y no se toca.
  //
  // LA LISTA SE DERIVA DEL PROPIO BLOQUE, no se escribe a mano: una lista de rótulos copiados se
  // desincroniza el día que se mejora una redacción, y en silencio. Es el mismo defecto que hizo
  // que los conteos se mostraran como "$4" — el formato se decidía leyendo el rótulo con una regex.
  //
  // Y LLEVA LAS DOS ALERTAS. Esta lista decide si la zona es del OS o del dueño: con sólo el glifo
  // nuevo, las nueve celdas ya publicadas con `⚠` pasaban a contarse como texto ajeno, `esMio` daba
  // falso y el control dejaba de escribirse — sin un solo error, que es como se rompen estas cosas.
  const MIAS = [
    FIRMA, ...variantesDeMarca(`${ALERTA} Control automático`), 'Qué dice el banco de este valor',
    ALERTA, ALERTA_HEREDADA, 'COBRADO ·', 'EN CUSTODIA ·', MARCA_ENDOSADO,
    // Los veredictos del cruce contra el extracto que NO empiezan con el glifo de alerta. Sin ellos,
    // la zona pasaría a contarse como texto ajeno y el control dejaría de escribirse — sin un solo
    // error, que es como se rompen estas cosas.
    'sin juzgar:', 'cobro que no pasa por la cuenta', 'no pasa por la cuenta',
    ...b.flatMap(([rot, , nota]) => [rot, nota]).filter((t) => String(t ?? '').trim()),
    // Y LAS MARCAS DE FILA, DERIVADAS DE SU CONSTANTE. Dos de las cuatro no empiezan con el glifo de
    // alerta —son informativas, no alarmas— así que sin esto la columna BA entera contaba como texto
    // del dueño en cuanto la firma de BC1 se perdiera, y el guard bloquearía en vez de proteger.
    ...Object.values(MARCAS_FILA),
  ]
  const ajeno = []
  zona.forEach((f) => (f || []).forEach((c, j) => {
    const t = String(c ?? '').trim()
    if (!t || MIAS.some((m) => t.startsWith(m))) return
    ajeno.push(letra(C_FLAG + j))
  }))
  // Con la firma alcanza. Sin ella —porque una escritura anterior falló a mitad de camino— sirve
  // que todo lo que haya sea texto propio: así el script puede reparar su propio destrozo.
  const esMio = firma === FIRMA || ajeno.length === 0
  if (!esMio) {
    throw new Error(`me niego a escribir: las columnas ${[...new Set(ajeno)].join(', ')} tienen contenido que no reconozco (esperaba la firma "${FIRMA}" en ${letra(C_CTRL)}1). Elegí otra zona antes de pisar datos del dueño.`)
  }
  {
    await google.clearValues(ID, `${PESTAÑA}!${letra(C_FLAG)}1:${letra(C_CTRL + 2)}${F1}`)
  }

  await corregirRotuloTotal(google)
  await marcarValoresSegunBanco(google)

  // REGLA 0 — NO APLICA EN ESTE BLOQUE, Y ESTÁ DECIDIDO: respetar: false.
  // Todo lo de abajo cae en la zona propia del control, marcada con FIRMA en su encabezado, y el
  // script ABORTA más arriba si encuentra ahí contenido que no reconoce. Esa negativa protege
  // mejor que respetar: no se discute qué texto gana, directamente no se escribe sobre lo ajeno.
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!${letra(C_FLAG)}4:${letra(C_FLAG)}4`, values: [[`${ALERTA} Control automático`]] },
    { range: `${PESTAÑA}!${letra(C_FLAG)}${F0}`, values: [[flagPorFila]] },
    // SÓLO las tres primeras columnas: la cuarta es la UNIDAD, que gobierna el formato y no se
    // escribe. Mandar cuatro contra un rango de tres hace fallar el batch ENTERO — y como el
    // borrado ya ocurrió, la pestaña queda sin el bloque. Pasó el 21/07.
    { range: `${PESTAÑA}!${letra(C_CTRL)}1:${letra(C_CTRL + 2)}${b.length}`, values: b.map((f) => f.slice(0, 3)) },
  ])

  const sheetId = hoja.sheetId
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

  // El formato de la columna de importes va celda por celda, con updateCells, NO con repeatCell.
  // Con repeatCell sobre el rango entero, seis celdas quedaban sin formato y otras sí — no
  // contiguas, así que no era un rango mal calculado. No encontré la causa; lo que sí es cierto es
  // que mandando valor y formato juntos en la misma celda funciona siempre. Preferí una escritura
  // que anda a seguir gastando en entender por qué la otra no.
  const MONEDA = { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' }
  const CANTIDAD = { numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT' }
  const celdas = b.map(([, formula, , unidad]) => ({
    values: [{
      ...(formula ? { userEnteredValue: { formulaValue: formula } } : {}),
      userEnteredFormat: unidad === 'cantidad' ? CANTIDAD : MONEDA,
    }],
  }))
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: { range: rg(0, b.length, C_CTRL + 1, C_CTRL + 2), rows: celdas, fields: 'userEnteredValue,userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: rg(3, 4, C_FLAG, C_FLAG + 1), cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(4, F1, C_FLAG, C_FLAG + 1), cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 0.7, green: 0.3, blue: 0.1 } }, numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.numberFormat' } },
    { repeatCell: { range: rg(0, 1, C_CTRL, C_CTRL + 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(10, 11, C_CTRL, C_CTRL + 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } } }, fields: 'userEnteredFormat.textFormat' } },
    // EL VEREDICTO DEL BANCO, CON EL MISMO CUERPO QUE LA MARCA DE AL LADO. Las dos son anotación al
    // costado de la fila; la BB venía en 11 —el cuerpo del dato— y por eso una frase de 86 caracteres
    // pedía 539px. En 9 pide 441 y entra en su columna declarada.
    { repeatCell: { range: rg(4, F1, C_VALOR, C_VALOR + 1), cell: { userEnteredFormat: { textFormat: { fontSize: 9 }, numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.textFormat.fontSize,userEnteredFormat.numberFormat' } },
    // ═══ LA NOTA DERRAMA, NO SE RECORTA (15/08) ═══
    //
    // Estaba en CLIP, y CLIP significa "cortá lo que sobre" aunque a la derecha no haya nada que
    // tapar. La BE es la última columna que este bloque escribe: de la BF en adelante la pestaña está
    // vacía, así que derramar suma 198px de lectura sin invadir un solo dato. Es la misma decisión
    // que ya tomó "Jornales por Quincena" para toda su grilla — derramar no es invadir: el texto sólo
    // se extiende sobre celdas VACÍAS, y donde hay algo al lado se recorta igual que antes.
    { repeatCell: { range: rg(0, b.length, C_CTRL + 2, C_CTRL + 3), cell: { userEnteredFormat: { textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat' } },
    // LOS CINCO ANCHOS, DE LA ÚNICA DECLARACIÓN QUE HAY. Antes eran tres tipeados acá y dos sin dueño.
    ...Object.entries(ANCHOS_CONTROL).map(([col, px]) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: Number(col), endIndex: Number(col) + 1 },
        properties: { pixelSize: px }, fields: 'pixelSize',
      },
    })),
  ])

  const v = await google.readSheetValues(ID, `${PESTAÑA}!${letra(C_CTRL)}1:${letra(C_CTRL + 1)}${b.length}`)
  console.log('\nCONTROL:')
  for (const f of v) if (f?.[0] && f?.[1] !== undefined) console.log(`  ${String(f[0]).slice(0, 42).padEnd(44)}${String(f[1] ?? '').padStart(16)}`)
  const marcas = await google.readSheetValues(ID, `${PESTAÑA}!A${F0}:${letra(C_FLAG)}${F1}`)
  console.log('\nFILAS MARCADAS:')
  marcas.forEach((f, i) => { if (f?.[C_FLAG]) console.log(`  fila ${i + F0} | ${String(f[6] ?? '').slice(0, 26).padEnd(28)} ${String(f[12] ?? '').padStart(14)}  ${f[C_FLAG]}`) })
}

// ═══ SÓLO CUANDO SE LO INVOCA COMO COMANDO (13/08) ═══
//
// Sin esta guarda bastaba un `import` para que este archivo escribiera el Sheet REAL. Lo pagué hoy:
// al probar desde el nodo la función pura `marcaPorFila` —que este mismo archivo exporta— el módulo
// corrió `main()` entero contra la planilla viva, desde un worktree, sin que nadie lo pidiera. La
// escritura cayó en la zona propia del control (BA/BB y BC:BE, con su firma y su guard), así que no
// tocó dato del dueño; pero el modo de falla es el que el repo ya tiene documentado en
// `impuestos-pestana.mjs`, y este archivo era el único de los tres controles que no lo tenía.
//
// Un módulo se importa; un comando se ejecuta. Desde que este archivo exporta algo, la diferencia
// dejó de ser teórica.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
