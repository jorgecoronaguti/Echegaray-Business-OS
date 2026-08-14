// EL CALENDARIO DE PAGO DE LA NÓMINA — LAS TRES POBLACIONES EN UNA SOLA GRILLA QUINCENAL.
//
// POR QUÉ EXISTE (13/08). El dueño, sobre el cuadro 1.3: *"el cuadro 1.3 esta mal porque dice
// quincena y hasta en la primera fila q sale aparecen la misma fecha, no se determinar cuanto es lo q
// proyectado que voy a pagar en las quincena de obreros, mes de administracion y oficina … necesito
// saber cuanto seria el total de todo lo q resta pagar quincena por quincena si cubrimos el 100% de
// lo q indica el convenio"*.
//
// Eran tres defectos distintos, no uno:
//
// ═══ 1. LA FILA DEGENERADA ═══
//
// La proyección arranca el día siguiente al último con horas cargadas. Cuando ese día cae el 15 o el
// último del mes, el "tramo que falta" mide UN día: `Quincena 15/08 · Hasta 15/08 · Días — ·
// Proyectado —`. Es lo que el dueño vio. Y no es un error de formato: un tramo de un sábado no tiene
// días laborables, así que la fila existe para decir cero. Una fila que informa cero ocupa el primer
// renglón del cuadro —el más leído— y hace dudar de las diez de abajo.
//
// Se resuelve en `quincenasPendientes` (jornales-pestana.mjs) descartando los tramos sin un solo día
// laborable, con `diasLaborables` de acá. No se maquilla la fila: no se emite.
//
// ═══ 2. LOS DÍAS SE CONTABAN DE LUNES A VIERNES, Y LA OBRA TRABAJA HASTA EL SÁBADO ═══
//
// La proyección usaba `NETWORKDAYS(desde;hasta)`. Medido contra las quincenas REALES de 2026 —la
// columna "Días hábiles" del registro, que es `COUNTA` de los días que la planilla escribe—:
//
//   registro 187 días · NETWORKDAYS (lun-vie) 159 · lun-SÁBADO 189
//
// O sea que la proyección venía **15% por debajo** por contar mal el calendario, en 12 de las 15
// quincenas exactamente un día o dos menos. Y no daba ningún error: daba un número plausible.
// (Las tres que no coinciden con lun-sáb son feriados y paros, que ningún calendario del Sheet sabe.)
//
// Peor: las horas por persona y día se MIDEN dividiendo por los días del REGISTRO, que son lun-sáb.
// Multiplicar esa medición por días lun-vie es mezclar dos calendarios en un mismo producto.
//
// ═══ 3. LAS TRES NÓMINAS NO SE PODÍAN SUMAR ═══
//
// Obra iba quincena por quincena, oficina y dirección mes por mes, en tres bloques distintos, y en
// ninguna parte se podía leer "el 01/09 salen $X". El calendario las junta: cada mes de oficina y de
// dirección cae en la quincena que lo PAGA, por su fecha de caja. Las ventanas son contiguas y
// disjuntas por construcción —la de una fila termina donde empieza la de la siguiente, la primera no
// tiene piso y la última no tiene techo— así que ningún peso puede quedar afuera ni contarse dos
// veces. El control lo mide contra el total de cada bloque, que es el otro camino.
//
// LO QUE ESTE MÓDULO NO DECIDE: de dónde sale cada importe. La proyección de obra la arma el motor
// salarial, la de oficina y dirección sus propios bloques. Acá sólo vive la GRILLA del calendario.

// UNA SOLA DEFINICIÓN DE "DÍA DE OBRA". `diasHabilesObra` ya existía —la usa el reparto de la demanda
// de las obras vendidas— y dice lunes a sábado con su razonamiento escrito. Escribir acá una segunda
// función idéntica es exactamente cómo aparecen dos calendarios que se separan seis meses después.
// Las dos apuntan a lunes–viernes desde el 13/08, por criterio del dueño: antes la demanda repartía
// por lun-sáb y el convenio proyectaba por lun-vie, y el `MAX(convenio; demanda)` comparaba dos cosas
// medidas distinto. El defecto era el desacuerdo, no el día.
import { diasHabilesObra } from './jornales-demanda-obras.mjs'
import { ALERTA } from './glifos.mjs'

/**
 * EL ENCABEZADO DEL CALENDARIO ES EL CONTRATO — la letra de cada columna sale de acá, nunca a mano.
 *
 * OCHO COLUMNAS, COMO EL RESTO DE LOS CUADROS DE LA PESTAÑA. El auditor de patrón admite UN solo
 * ancho más el registro del final: un cuadro de nueve dejaría la pestaña con tres anchos y ése es
 * exactamente el defecto que el dueño llama "descuadrado". Lo que se sacó para que entrara —"Días
 * hábiles", "Personas", "Horas por persona" y "Σ $/hora"— es andamiaje: personas y horas repiten
 * doce veces el mismo número (está en 1.1 y arriba del cuadro), la Σ $/hora del mes ya está en 1.2
 * columna F, y los días se recalculan de las dos fechas de la propia fila.
 */
export const COLS_CALENDARIO = [
  // "Período" y no "Quincena": la primera fila puede ser LO QUE QUEDA de la quincena en curso, y
  // rotularla "Quincena" es lo que hacía que el dueño leyera una quincena de un día. El rótulo dice
  // lo que la fila es.
  // «Efectivo» y no «Efectivo (obra)» desde el 14/08: la columna dejó de ser sólo de obra. El dueño
  // ordenó que oficina se abra por canal igual que obreros, y su fuente (`_J_OFICINA`) trae las mismas
  // tres columnas BANCO/ADELANTO/TOTAL RECIBO que la de obra.
  //
  // ═══ ENTRA «Banco» Y SALE «TOTAL» — LAS DOS MITADES, NO UNA (14/08) ═══
  //
  // El pedido era *"jornales con la proyección de sueldos 50 y 50"* y el cuadro publicaba UNA mitad.
  // El dueño ve cuántos billetes hay que juntar y no cuánto se transfiere, que son los dos números con
  // los que opera el pago. El ancho es 8 y no se negocia —dos anchos de grilla en el mismo tab es el
  // defecto que el auditor de patrón rechaza y el dueño lee como "descuadrado"—, así que para que
  // entre una tiene que salir otra.
  //
  // SALE «TOTAL», Y POR EL CRITERIO QUE ESTA PESTAÑA YA APLICÓ DOS VECES. El cuadro del año perdió
  // «Falta pagar» y «Total año» con este argumento escrito: *"son sumas de las otras dos y ninguna
  // decide nada"*. Acá es más fuerte todavía, porque el TOTAL no es una suma cualquiera: con dirección
  // entera al banco (ver `DIRECCION_POR_BANCO`), «Banco» + «Efectivo» ES el total de la fila, por
  // construcción y al peso. La columna que se va no se pierde: queda publicada dos veces, como la
  // suma de las tres nóminas de la izquierda y como la de las dos mitades de la derecha.
  //
  // Y EL ORDEN IMPORTA: las tres poblaciones primero —de dónde sale la plata— y los dos canales al
  // final —por dónde sale—. Es el mismo orden del cuadro de pago del hero, que termina en «Por banco»
  // y «En efectivo». Un mismo significado, siempre en el mismo lugar del renglón.
  'Período', 'Hasta', 'Se paga el', 'Obreros', 'Oficina', 'Dirección', 'Banco', 'Efectivo',
]

/** La letra A1 de una columna del calendario, buscada por su rótulo. Falla RUIDOSA. */
export function colCalendario(rotulo, cols = COLS_CALENDARIO) {
  const i = cols.indexOf(rotulo)
  if (i < 0) throw new Error(`colCalendario: el calendario de Jornales no tiene la columna "${rotulo}"`)
  return String.fromCharCode(65 + i)
}

/**
 * LA JORNADA DE OBRA VA DE LUNES A VIERNES — criterio del dueño (13/08), no del dato observado.
 *
 * `NETWORKDAYS.INTL` toma una máscara de siete caracteres, lunes a domingo, con 1 = no laborable.
 * "0000011" = sábado y domingo. Se escribe con la máscara explícita, y no `NETWORKDAYS` a secas, para
 * que el criterio quede DECLARADO en un lugar: el día que la semana de obra cambie se cambia acá y se
 * mueven las dos puntas —la fórmula del Sheet y el reparto de la demanda— juntas.
 *
 * NO CONTEMPLA FERIADOS. El Sheet no tiene calendario de feriados y ninguna otra pestaña lo tiene:
 * inventarlo acá sería una fuente nueva sin dueño. El sesgo va hacia arriba (proyecta de más).
 */
export const MASCARA_FIN_DE_SEMANA = '"0000011"'

/** La expresión de días laborables entre dos celdas de fecha, en el mismo criterio que la obra. */
export const expresionDias = (celdaDesde, celdaHasta) =>
  `NETWORKDAYS.INTL(${celdaDesde};${celdaHasta};${MASCARA_FIN_DE_SEMANA})`

/**
 * LA LÍNEA QUE DECLARA LO QUE LA PROYECCIÓN NO VE.
 *
 * El dueño ordenó proyectar lunes a viernes. Las quincenas cerradas TIENEN días cargados que no son
 * lunes a viernes —sábados de horas extra— y esa plata sale igual. No se estima acá: estimarla sería
 * volver a convertir una observación en un supuesto de cálculo, que es el error que se acaba de
 * corregir. Se declara, y el que quiera el número lo saca de la planilla.
 */
// EL SÍMBOLO ⊘ ES "NO ENTRA ACÁ", Y SE USA SIEMPRE IGUAL EN ESTA PESTAÑA (13/08). El párrafo de 167
// caracteres decía tres cosas; sólo una era información que el cuadro no tiene: que los sábados
// quedan afuera de la proyección. Que "aparecen en el registro cuando se cargan" ya lo dice la
// sección 5 con su nombre, y "salen de la caja" es lo que hace todo lo demás de la pestaña.
export const LINEA_SABADOS = '⊘ No incluye sábados ni horas extra'

/**
 * El MISMO criterio que `expresionDias` escribe en la pestaña, en JavaScript: sirve para decidir
 * ANTES de emitir la fila si el tramo tiene algo que proyectar. Sin esto, la única forma de saber que
 * una fila vale cero es abrir el Sheet y mirarla — que es como llegó a producción.
 *
 * Se re-exporta, no se reimplementa: dos funciones idénticas en dos archivos es cómo aparece el
 * tercer calendario.
 */
export { diasHabilesObra as diasLaborables }

/**
 * NÚCLEO PURO: la ventana de fechas de caja que le toca a una fila del calendario.
 *
 * CONTIGUAS Y DISJUNTAS POR CONSTRUCCIÓN. Cada fila se queda con las fechas de pago que van desde SU
 * fecha (inclusive) hasta la de la fila siguiente (exclusive). La primera no tiene piso —así nada
 * vencido o anterior al primer tramo queda afuera— y la última no tiene techo —así nada de diciembre
 * se pierde—. Es la única forma de repartir doce meses en diez quincenas sin que un criterio de
 * redondeo deje o duplique un mes, y el control de abajo lo demuestra contra el total del bloque.
 *
 * @param {{rangoImporte:string, rangoFecha:string, celdaDesde:string|null, celdaHasta:string|null}} d
 * @returns {string} la fórmula SUMIFS completa
 */
export function formulaVentana({ rangoImporte, rangoFecha, celdaDesde, celdaHasta }) {
  const crit = []
  if (celdaDesde) crit.push(`${rangoFecha};">="&${celdaDesde}`)
  if (celdaHasta) crit.push(`${rangoFecha};"<"&${celdaHasta}`)
  // Sin ningún criterio la fila se llevaría el bloque entero: eso sólo puede pasar con UNA sola fila
  // de calendario, y en ese caso llevarse todo es exactamente lo correcto.
  return `=SUMIFS(${rangoImporte}${crit.length ? ';' + crit.join(';') : ''})`
}

/**
 * QUÉ CUENTA COMO HISTORIA SUFICIENTE PARA PROYECTAR EL CANAL DE PAGO.
 *
 * Seis quincenas pagadas ≈ tres meses: exactamente la muestra que ANTES era toda la ventana. Bajar
 * de ahí no es "un promedio del año con pocos datos", es el promedio de otra cosa — y el 02/01, con
 * el registro del año nuevo vacío, es justamente cuando una división plausible haría más daño.
 * Debajo del piso la pestaña no proyecta el efectivo y lo dice: mismo trato que `MIN_MESES` en
 * Estructura y Recurrentes.
 */
export const MIN_QUINCENAS_SHARE = 6

/**
 * ⚠ SIN CONSUMIDOR DESDE EL 14/08 — NO LA USES SIN LEER ESTO PRIMERO.
 *
 * Esta función y las cuatro que la acompañan (`formulaGlosaShareEfectivo`, `shareEfectivoAnual`,
 * `formulaAcuerdoDeclarado`, `formulaAcuerdoMensual`, `acuerdoDeclarado`, `acuerdoMensual`) medían el
 * canal de pago REAL sobre el histórico y publicaban la brecha contra el acuerdo. El dueño las sacó de
 * la pestaña: *"te he dicho q el acuerdo es 50 y 50 todas las quincenas y asi y todo no se entiende
 * nada"*. El 50/50 es la REGLA de pago (ver `lib/jornales-reparto-pago.mjs`), no una métrica a auditar,
 * y publicar el porcentaje medido al lado del acuerdo daba dos números para el mismo canal.
 *
 * Se conservan con sus tests porque la MEDICIÓN sigue siendo verdadera y sirve para contestar "¿cuánto
 * de lo que pagamos pasó de verdad por el banco?" — una pregunta de control interno, de otra pestaña y
 * de otro día. Volver a enchufarlas al cuadro que decide el pago es reponer el defecto.
 *
 * NÚCLEO PURO: qué proporción de la quincena de obra sale en EFECTIVO, medida sobre el registro.
 *
 * ═══ POR QUÉ SE MIDE Y NO SE SUPONE ═══
 *
 * El dueño: *"tal como viene indicando el sheet jornales q una parte va por recibo de sueldo y la
 * otra en efectivo"*. La planilla JORNALES lo trae por persona en tres columnas —BANCO, ADELANTO,
 * TOTAL RECIBO— que suman el total de la quincena, y el registro de esta pestaña las replica.
 *
 * La partición es la MISMA que `lib/caja-posterior-al-corte.mjs` ya usa para bajar las dos
 * disponibilidades: BANCO es la transferencia del lote de haberes (el pago bancarizado del recibo de
 * sueldo) y ADELANTO + TOTAL RECIBO son los billetes que salen del cajón. Una sola definición para
 * las dos pestañas — si acá se inventara otra, CAJA y Jornales dirían cosas distintas del mismo peso.
 *
 * SE MIDE COMO "TODO LO QUE NO SE PROBÓ QUE SALIÓ POR BANCO". El registro tiene quincenas donde los
 * tres canales no cierran contra el TOTAL (hoy faltan $1.259.700 sin canal declarado): tomar
 * `(adelanto+recibo)/total` haría que banco% + efectivo% < 100% y la pestaña dejaría plata sin
 * clasificar. Para planificar billetes el lado seguro es el otro: lo que el registro NO prueba que
 * salió por transferencia se cuenta como efectivo.
 *
 * ═══ LA VENTANA ES EL AÑO, Y SÓLO LAS QUINCENAS PAGADAS (13/08) ═══
 *
 * El dueño: *"el adelanto es algo q no se puede proyectar asi como está, se tiene q hacer un calculo
 * promedio del año y con ese % armarlo proyectado"*. Tenía razón por dos motivos distintos:
 *
 * 1. **Tres meses no son el año.** La ventana era `EDATE(TODAY();-JORNALES_MESES_BASE)` = las últimas
 *    seis quincenas, prestada del cuadro de HORAS. Para las horas eso está bien —el ritmo de trabajo
 *    de enero no dice nada del de agosto— pero el CANAL DE PAGO no es un ritmo: es una política de
 *    tesorería que se decide quincena a quincena según haya o no saldo en el banco. Medido sobre el
 *    registro vivo: 76,19% en la ventana de 3 meses contra 84,19% en el año. Ocho puntos, $8,7M sobre
 *    la proyección a diciembre, que se movían solos según qué seis quincenas cayeran adentro.
 *
 * 2. **Una quincena a medio pagar arrastraba el porcentaje.** El filtro era `hasta<=TODAY()`, o sea
 *    "la quincena ya terminó de trabajarse". Pero entre que termina y que se paga pasan dos o tres
 *    días, y en esos días la fila tiene TOTAL cargado y BANCO en cero: entra a la cuenta como si
 *    hubiera salido 100% en billetes. Con el registro de hoy eso mueve el share de 84,19% a 84,78%
 *    según el día en que se mire la pestaña — sin un solo error y sin que nadie toque nada.
 *
 *    Por eso la condición es `Pagado el` con fecha, no `hasta<=TODAY()`: el canal de pago recién es
 *    un HECHO cuando la plata salió. Es la misma columna con la que el registro pasa una quincena a
 *    REAL y con la que CAJA descarga la obligación.
 *
 * ES UNA RAZÓN DE IMPORTES, NO UN PROMEDIO DE PORCENTAJES. `Σefectivo/Σtotal`, no `AVERAGE(share)`:
 * promediar porcentajes le da el mismo peso a una quincena de $4,8M que a una de $10,1M, y en este
 * registro las chicas son las de enero —las que salieron casi enteras en billetes—. El sesgo sería
 * de más de dos puntos hacia arriba.
 *
 * @param {{banco:string, total:string, hasta:string, pagado:string}} col letras del registro
 * @param {number} f0 primera fila del registro
 * @param {number} f1 última fila del registro
 * @returns {string} la fórmula de la fracción que sale en efectivo (0..1), vacía sin base suficiente
 */
export function formulaShareEfectivo({ banco, total, hasta, pagado }, f0, f1) {
  const v = ventanaAnualPagada({ total, hasta, pagado }, f0, f1)
  const rg = `$${banco}$${f0}:$${banco}$${f1}`
  // SIN IFERROR A PROPÓSITO. El anterior devolvía 1 = "todo en efectivo" ante un 0/0, que es un
  // número plausible fabricado por una guarda. Acá, o hay ≥ MIN quincenas pagadas —y entonces
  // ΣTOTAL>0 por construcción, porque `total>0` es una de las condiciones— o no se proyecta nada.
  return `=IF(SUMPRODUCT(${v})<${MIN_QUINCENAS_SHARE};"";`
    + `1-SUMPRODUCT(${v}*N(${rg}))/SUMPRODUCT(${v}*N($${total}$${f0}:$${total}$${f1})))`
}

/**
 * NÚCLEO PURO: QUÉ PROPORCIÓN DE LA QUINCENA SALE COMO ADELANTO — PONDERADA, NO PROMEDIADA.
 *
 * ═══ LA ORDEN, REPETIDA DOS VECES (14/08) ═══
 *
 * *"te pedi q los 'adelantos' de los obreros se proyectaran en base a un porcentaje ponderado"*. Y
 * antes: *"el adelanto es algo q no se puede proyectar asi como está, se tiene q hacer un calculo
 * promedio del año y con ese % armarlo proyectado"*.
 *
 * Lo que había era el share de EFECTIVO —adelanto + resto contra recibo, juntos— y el adelanto no
 * tenía proyección propia en ninguna parte. Son dos cosas distintas para tesorería: el efectivo es
 * cuánto billete hay que juntar para el día de pago; el ADELANTO es plata que sale ANTES, a lo largo
 * de la quincena, y por eso tiene su propio ritmo de caja.
 *
 * ES UNA RAZÓN DE IMPORTES: `Σadelanto / Σtotal`, nunca `AVERAGE(adelanto_i/total_i)`. Medido sobre las
 * 14 quincenas pagadas de 2026: el ponderado da 13,73% ($15.794.784 sobre $115.054.273) y el promedio
 * simple de porcentajes da bastante más, porque las quincenas chicas —enero, las que salieron casi
 * enteras en billetes— pesan lo mismo que las de $10M. Sobre la proyección a diciembre esa diferencia
 * es plata que se junta o no se junta.
 *
 * MISMA VENTANA Y MISMO PISO QUE EL SHARE DE EFECTIVO: el año calendario, sólo quincenas PAGADAS, y sin
 * `MIN_QUINCENAS_SHARE` no se proyecta. Dos definiciones de "la base sobre la que se mide un canal de
 * pago" en la misma pestaña es cómo aparecen dos porcentajes que no suman con el total.
 *
 * @param {{adelanto:string, total:string, hasta:string, pagado:string}} col letras del registro
 */
export function formulaShareAdelanto({ adelanto, total, hasta, pagado }, f0, f1) {
  const v = ventanaAnualPagada({ total, hasta, pagado }, f0, f1)
  const rg = (c) => `$${c}$${f0}:$${c}$${f1}`
  // SIN IFERROR, por lo mismo que el share de efectivo: o hay base suficiente —y entonces ΣTOTAL>0 por
  // construcción— o no se proyecta. Un 0/0 atrapado devolvería un número plausible fabricado.
  return `=IF(SUMPRODUCT(${v})<${MIN_QUINCENAS_SHARE};"";`
    + `SUMPRODUCT(${v}*N(${rg(adelanto)}))/SUMPRODUCT(${v}*N(${rg(total)})))`
}

/**
 * EL MISMO CRITERIO EN JAVASCRIPT — para poder AFIRMAR el porcentaje sin leer la celda que lo calcula.
 * @param {Array<{hasta:Date, pagado:Date|null, adelanto:number, total:number}>} filas
 */
export function shareAdelantoAnual(filas = [], hoy = new Date()) {
  const enero = new Date(hoy.getFullYear(), 0, 1)
  const base = (filas ?? []).filter((f) => f.hasta >= enero && f.hasta <= hoy
    && f.pagado instanceof Date && Number(f.total) > 0)
  const adelanto = base.reduce((a, f) => a + Number(f.adelanto || 0), 0)
  const total = base.reduce((a, f) => a + Number(f.total || 0), 0)
  return {
    quincenas: base.length,
    adelanto,
    total,
    share: base.length < MIN_QUINCENAS_SHARE ? null : adelanto / total,
  }
}

/**
 * NÚCLEO PURO: el rótulo que declara sobre qué se midió el share — o por qué no se pudo.
 *
 * DOS DATOS Y NINGUNA EXPLICACIÓN. El dueño rechazó esta pestaña por "muchas palabras y frases y
 * explicaciones que nadie lee". Lo único que la celda de al lado no dice es CUÁNTAS quincenas
 * entraron y de qué período: eso cabe en cuatro palabras y un número.
 */
export function formulaGlosaShareEfectivo({ total, hasta, pagado }, f0, f1) {
  const n = `SUMPRODUCT(${ventanaAnualPagada({ total, hasta, pagado }, f0, f1)})`
  return `=IF(${n}<${MIN_QUINCENAS_SHARE};"⊘ sin base — "&${n}&" de ${MIN_QUINCENAS_SHARE} quincenas";`
    + `${n}&" quincenas pagadas del año")`
}

/**
 * La condición "quincena PAGADA del año en curso, con plata", como producto de factores 0/1.
 *
 * Se arma una sola vez y se repite dentro de la fórmula en vez de nombrarla con LET: un rango dentro
 * de un LET pierde la expansión y devuelve #NAME? o un escalar — ya pasó en este libro.
 *
 * QUÉ ES "EL AÑO": el año calendario en curso, `DATE(YEAR(TODAY());1;1)`, y no doce meses móviles.
 * El registro de esta pestaña ES el del año (su total se llama "Total pagado en el año"): una
 * ventana móvil de doce meses prometería una historia que el rango no contiene, y en enero daría
 * exactamente el mismo resultado que el año calendario con un criterio más difícil de auditar.
 */
function ventanaAnualPagada({ total, hasta, pagado }, f0, f1) {
  const rg = (c) => `$${c}$${f0}:$${c}$${f1}`
  return `(${rg(hasta)}>=DATE(YEAR(TODAY());1;1))*(${rg(hasta)}<=TODAY())`
    + `*(N(${rg(pagado)})>0)*(N(${rg(total)})>0)`
}

/**
 * EL MISMO CRITERIO, EN JAVASCRIPT: lo que la fórmula de arriba escribe en el Sheet, calculable.
 *
 * No es un duplicado decorativo. La fórmula es un string: un test sobre ella prueba que dice lo que
 * quisimos escribir, nunca que el número sale bien. Esta función se corre contra las quincenas
 * reales del registro y es lo que permite afirmar "84,19%" con evidencia, no con una lectura de la
 * pestaña que se calculó sola. Si las dos se separan, el defecto es de la transcripción.
 *
 * @param {Array<{hasta:Date, pagado:Date|null, banco:number, total:number}>} filas
 * @param {Date} hoy
 * @returns {{quincenas:number, banco:number, total:number, share:number|null}} share null = sin base
 */
export function shareEfectivoAnual(filas, hoy = new Date()) {
  const enero = new Date(hoy.getFullYear(), 0, 1)
  const base = (filas ?? []).filter((f) => f.hasta >= enero && f.hasta <= hoy
    // LA CONDICIÓN QUE HACE ESTABLE AL PORCENTAJE: sin fecha de pago el canal todavía no es un hecho.
    && f.pagado instanceof Date && Number(f.total) > 0)
  const banco = base.reduce((a, f) => a + Number(f.banco || 0), 0)
  const total = base.reduce((a, f) => a + Number(f.total || 0), 0)
  return {
    quincenas: base.length,
    banco,
    total,
    share: base.length < MIN_QUINCENAS_SHARE ? null : 1 - banco / total,
  }
}

/**
 * NÚCLEO PURO: LO QUE EL ACUERDO DICE CONTRA LO QUE LA PLANILLA REGISTRA — la contradicción, medida.
 *
 * ═══ POR QUÉ ESTA LÍNEA (14/08) ═══
 *
 * El dueño: *"el acuerdo es el mismo 50% por banco (recibo de sueldo), 50% efectivo"*. Medido sobre
 * las quincenas pagadas de 2026: **15,8% por banco**, $18.191.908 de $115.054.273, y **9 de 15
 * quincenas con la columna Banco en cero**.
 *
 * O el acuerdo no se está cumpliendo, o la columna Banco está sub-cargada. Las dos cosas son
 * información que él necesita para decidir, y ninguna se arregla escribiendo un 50% en la pestaña:
 * fabricar el número que el acuerdo promete convertiría el control en decoración. La pestaña sigue
 * midiendo LO REAL —el share de arriba no se toca— y esta línea pone al lado la distancia contra lo
 * declarado, en pesos y en quincenas.
 *
 * `ΣTOTAL/2` y no `0,5*ΣTOTAL`: un literal decimal escrito por API viaja en el locale del archivo
 * (es_AR, coma decimal) y es una fuente de #ERROR que no hace falta correr. El patrón de `TEXT` sí va
 * en US (`#,##0`), que es la otra mitad de la misma regla.
 *
 * ═══ LA GLOSA MIDE 43 CARACTERES Y NO 78 (14/08, defecto visto en el PDF) ═══
 *
 * La primera versión decía «acuerdo 50% · faltan $39.335.228 por banco · 8 de 14 quincenas con banco
 * en $0»: 78 caracteres en la columna C, y `auditarPatron` lo cazó en vivo como `nota-en-el-medio`
 * (el tope es `LARGO_NOTA` = 60). No es cosmético — en el PDF el texto se derramaba sobre las
 * columnas de la derecha y corría los encabezados «Dirección» y «TOTAL» del calendario.
 *
 * Lo que se fue es lo que YA dice el rótulo de la columna A («Por banco — contra el acuerdo 50/50
 * declarado») y la palabra «quincenas», que la fila entera está contando. Queda el dato accionable:
 * cuántos pesos faltan y cuántos períodos no tienen un peso por banco.
 *
 * @param {{banco:string, total:string, hasta:string, pagado:string}} cols letras del registro
 * @param {number} f0 primera fila del registro · @param {number} f1 última
 * @param {number} fShare fila del share de efectivo, del que esta línea deriva la fracción por banco
 */
export function formulaAcuerdoDeclarado({ banco, total, hasta, pagado }, f0, f1, fShare) {
  const rg = (c) => `$${c}$${f0}:$${c}$${f1}`
  return brechaContraElAcuerdo({
    v: ventanaAnualPagada({ total, hasta, pagado }, f0, f1),
    rgBanco: rg(banco), rgTotal: rg(total), fShare, sinBase: 'sin quincenas pagadas',
  })
}

/**
 * NÚCLEO PURO: LA MISMA BRECHA, PARA UN BLOQUE MENSUAL (Oficina).
 *
 * ═══ POR QUÉ NO SE COPIA LA DE ARRIBA (14/08) ═══
 *
 * El dueño: *"quiero q la tabla de 'oficina' sea igual que la de 'obreros' dado q el acuerdo es el
 * mismo 50% por banco (recibo de sueldo), 50% efectivo"*. El acuerdo es el mismo, así que el CONTROL
 * tiene que ser el mismo — no uno parecido escrito al lado. Las dos líneas comparten el cuerpo
 * (`brechaContraElAcuerdo`) y difieren sólo en la ventana, que es lo único que de verdad cambia:
 *
 *   · obra    → quincenas del año con fecha en «Pagado el» (el canal recién es un hecho cuando salió);
 *   · oficina → meses con «Pagado» cargado, que es la MISMA ventana con la que se mide su share de
 *     efectivo dos filas más arriba. Dos ventanas distintas para el mismo canal darían dos porcentajes
 *     que no cierran entre sí en la misma pestaña.
 *
 * Oficina no tiene columna «Pagado el»: su bloque es mensual y lo que la planilla registra como salido
 * es su «Pagado». Exigirle una marca de pago que no existe dejaría la ventana vacía y el control mudo.
 *
 * @param {{banco:string, pagado:string}} cols letras del bloque mensual
 * @param {number} r0 primer mes · @param {number} r1 último mes
 * @param {number} fShare fila del share de efectivo del bloque
 */
export function formulaAcuerdoMensual({ banco, pagado }, r0, r1, fShare) {
  const rg = (c) => `$${c}$${r0}:$${c}$${r1}`
  return brechaContraElAcuerdo({
    v: `--(N(${rg(pagado)})>0)`, rgBanco: rg(banco), rgTotal: rg(pagado), fShare, sinBase: 'sin meses pagados',
  })
}

/**
 * El cuerpo compartido: la fracción por banco y la distancia contra el 50% declarado.
 *
 * NO SE FABRICA EL 50%. La celda de la izquierda publica LO REAL —derivado del share de efectivo, para
 * que la pestaña no tenga dos números para el mismo canal— y la glosa publica la distancia. Escribir
 * el 50% que el acuerdo promete convertiría el control en decoración.
 *
 * Los períodos SIN un peso por banco van al lado del importe: es lo que distingue "se paga poco por
 * banco" de "hay períodos enteros sin registrar el canal", que son dos problemas distintos y se
 * arreglan distinto. Sin ese número el porcentaje no se puede accionar.
 */
function brechaContraElAcuerdo({ v, rgBanco, rgTotal, fShare, sinBase }) {
  const sBanco = `SUMPRODUCT(${v}*N(${rgBanco}))`
  const sTotal = `SUMPRODUCT(${v}*N(${rgTotal}))`
  const enCero = `SUMPRODUCT(${v}*(N(${rgBanco})=0))`
  const n = `SUMPRODUCT(${v})`
  return {
    valor: `=IF($B$${fShare}="";"";1-$B$${fShare})`,
    glosa: `=IF($B$${fShare}="";"⊘ sin base para medir el canal";`
      + `IF(${sTotal}=0;"⊘ ${sinBase}";`
      + `"faltan $"&TEXT(MAX(0;${sTotal}/2-${sBanco});"#,##0")&" por banco · "`
      + `&${enCero}&" de "&${n}&" en $0"))`,
  }
}

/**
 * EL MISMO CRITERIO EN JAVASCRIPT, para poder afirmar el número sin leer la celda que él produce.
 *
 * @param {Array<{hasta:Date, pagado:Date|null, banco:number, total:number}>} filas
 * @returns {{porBanco:number|null, faltaParaElAcuerdo:number, enCero:number, quincenas:number}}
 */
export function acuerdoDeclarado(filas, hoy = new Date(), acuerdo = 0.5) {
  const { quincenas, banco, total, share } = shareEfectivoAnual(filas, hoy)
  const enero = new Date(hoy.getFullYear(), 0, 1)
  const base = (filas ?? []).filter((f) => f.hasta >= enero && f.hasta <= hoy
    && f.pagado instanceof Date && Number(f.total) > 0)
  return {
    porBanco: share === null ? null : 1 - share,
    faltaParaElAcuerdo: Math.max(0, total * acuerdo - banco),
    enCero: base.filter((f) => !(Number(f.banco) > 0)).length,
    quincenas,
  }
}

/**
 * EL MISMO CRITERIO PARA EL BLOQUE MENSUAL, EN JAVASCRIPT.
 *
 * Existe por la misma razón que su gemelo de arriba: la fórmula es un string y un test sobre ella
 * prueba que dice lo que quisimos escribir, nunca que el número sale bien. Con esto la aritmética del
 * control se prueba con números, sin leer la celda que ella misma produce.
 *
 * SIN PISO DE PERÍODOS. El de obra exige `MIN_QUINCENAS_SHARE` porque proyecta caja con ese
 * porcentaje; éste sólo publica una brecha ya ocurrida, y un mes pagado ya es una brecha real.
 *
 * @param {Array<{pagado:number, banco:number}>} meses los meses del bloque, en cualquier orden
 * @returns {{porBanco:number|null, faltaParaElAcuerdo:number, enCero:number, meses:number}}
 */
export function acuerdoMensual(meses = [], acuerdo = 0.5) {
  const base = (meses ?? []).filter((m) => Number(m.pagado) > 0)
  const banco = base.reduce((a, m) => a + Number(m.banco || 0), 0)
  const total = base.reduce((a, m) => a + Number(m.pagado || 0), 0)
  return {
    porBanco: total > 0 ? banco / total : null,
    faltaParaElAcuerdo: Math.max(0, total * acuerdo - banco),
    enCero: base.filter((m) => !(Number(m.banco) > 0)).length,
    meses: base.length,
  }
}

/**
 * NÚCLEO PURO: la línea de control del calendario contra los bloques que lo alimentan.
 *
 * UN CONTROL NUNCA SE VALIDA CONTRA LA MISMA INFORMACIÓN QUE PRODUCE. La columna Oficina del
 * calendario sale de repartir el bloque de Oficina en ventanas de fecha; su total tiene que dar
 * exactamente el total del bloque, que se calcula por el otro camino (`SUM` de la columna). Si una
 * ventana se solapa, deja un hueco o el bloque cambia de fecha de pago, estos dos números se separan
 * y la línea lo dice con el importe.
 *
 * @param {{oficina:string, direccion:string, totalOficina:string, totalDireccion:string}} celdas
 * @returns {string}
 */
export function formulaControlCalendario({ oficina, direccion, totalOficina, totalDireccion }) {
  const dif = `ROUND(${oficina}-${totalOficina};0)`
  const difD = `ROUND(${direccion}-${totalDireccion};0)`
  return `=IF(AND(${dif}=0;${difD}=0);"✓ oficina y dirección cierran contra sus bloques (2 y 3)";`
    + `"${ALERTA} el calendario no cierra: oficina $"&TEXT(${dif};"#,##0")&" · dirección $"&TEXT(${difD};"#,##0")`
    + `&" — alguna fecha de caja quedó fuera de las ventanas")`
}

/**
 * NÚCLEO PURO: la baja que la planilla todavía no registró.
 *
 * ═══ EL CASO QUE LO TRAJO (13/08) ═══
 *
 * A NAVARRO MATIAS JESUS se le pagó su LIQUIDACIÓN FINAL el 13/08 ($239.790,94, confirmado por el
 * dueño). Se fue. Pero el plantel base de la proyección es la última quincena CERRADA —16/07–31/07,
 * donde Navarro todavía figura con $5.500/hora— así que **todas las quincenas de acá a diciembre lo
 * siguen pagando**.
 *
 * La evidencia de que es exactamente él, medida en el registro: Σ $/hora del plantel base $85.900,
 * Σ $/hora de la quincena en curso $80.400. La diferencia son $5.500 — el jornal de Navarro, al peso.
 * Sobre la proyección de obra eso es un 6,4% de más.
 *
 * ═══ POR QUÉ ESTO ES UN CONTROL Y NO UNA CORRECCIÓN AUTOMÁTICA ═══
 *
 * El OS **no puede distinguir una baja de una ausencia**. Una persona que no aparece en el bloque de
 * la quincena en curso puede haberse ido, estar de licencia o no haber sido cargada todavía. Sacarla
 * sola de la proyección sería inventar una baja — y la baja de verdad se registra en IERIC y en ARCA,
 * que el OS no lee. La fuente es la planilla del dueño: mientras él no la saque de ahí, la proyección
 * la cuenta, y esta línea le dice cuánto le está costando no haberlo hecho.
 *
 * El importe es exacto donde la proyección es lineal en la Σ $/hora, y es un TECHO donde la demanda
 * de obras manda por el MAX. Por eso dice "hasta".
 *
 * @param {{personasBase:string, sigmaBase:string, personasCurso:string, sigmaCurso:string, totalObra:string}} c
 * @returns {string}
 */
export function formulaBajaNoRegistrada({ personasBase, sigmaBase, personasCurso, sigmaCurso, totalObra }) {
  const menos = `N(${personasBase})-N(${personasCurso})`
  const exceso = `(1-N(${sigmaCurso})/N(${sigmaBase}))*N(${totalObra})`
  // EL AVISO DICE EL NÚMERO, NO EL MANUAL (13/08). Medía 240 caracteres y terminaba explicando por qué
  // el OS no da de baja a nadie — que es lo que está escrito arriba, en este mismo archivo, para quien
  // mantiene el generador. Al que abre la pestaña le sirven las dos cifras: cuántos y cuánto. Qué
  // hacer con eso ("sacalas de la planilla JORNALES") es la única acción posible y el dueño la conoce.
  return `=IF(OR(N(${sigmaBase})=0;${menos}<=0);"";`
    // EL PREFIJO DEL SUB-ÍTEM VA ADENTRO DE LA FÓRMULA: la fila es un sub-ítem de 1.1 cuando habla y
    // una fila vacía cuando no, y la gramática de la pestaña se respeta en los dos casos.
    + `"   · ${ALERTA} "&(${menos})&" persona(s) menos que el plantel base — hasta $"`
    + `&TEXT(${exceso};"#,##0")&" de más a diciembre")`
}

// ═══ LO QUE EL BANCO PAGÓ Y NINGUNA NÓMINA EXPLICA: NO VIVE ACÁ (13/08) ═══
//
// Escribí una `formulaHaberesDelBanco` que comparaba, en una celda, el total de "Sueldos" del extracto
// contra el banco declarado por el registro y por Oficina. La retiré el mismo día: `lib/haberes-
// conciliacion.mjs` ya contesta esa pregunta, empareja PAGO POR PAGO —no en agregado— y declara la
// misma limitación (el lote no dice a quién le paga). Dos definiciones del mismo concepto dan dos
// números para una sola pregunta, y el mío era el más grueso.
//
// La pestaña no lo recalcula: lo NOMBRA, para que quien vea un pago de haberes que el registro no
// explica —una liquidación final, un SAC— sepa dónde está la respuesta. Un concepto vive en un solo
// lugar y se referencia.
// MISMO ⊘ QUE LOS SÁBADOS: lo que la pestaña NO cubre se marca siempre con el mismo símbolo, y el
// nombre de la capacidad que sí lo contesta alcanza para ir a buscarla.
export const LINEA_HABERES_SIN_QUINCENA = '⊘ Liquidación final o SAC — ver conciliar-haberes'
