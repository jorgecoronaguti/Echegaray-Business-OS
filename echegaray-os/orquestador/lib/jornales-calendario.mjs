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

import { RANGO_MESES_BASE } from './motor-salarial.mjs'
// UNA SOLA DEFINICIÓN DE "DÍA DE OBRA". `diasHabilesObra` ya existía —la usa el reparto de la demanda
// de las obras vendidas— y dice lunes a sábado con su razonamiento escrito. Escribir acá una segunda
// función idéntica es exactamente cómo aparecen dos calendarios que se separan seis meses después.
// Las dos apuntan a lunes–viernes desde el 13/08, por criterio del dueño: antes la demanda repartía
// por lun-sáb y el convenio proyectaba por lun-vie, y el `MAX(convenio; demanda)` comparaba dos cosas
// medidas distinto. El defecto era el desacuerdo, no el día.
import { diasHabilesObra } from './jornales-demanda-obras.mjs'

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
  'Período', 'Hasta', 'Se paga el', 'Obreros', 'Oficina', 'Dirección', 'TOTAL', 'Efectivo (obra)',
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
 * salió por transferencia se cuenta como efectivo. Queda dicho en la prosa del cuadro.
 *
 * LA VENTANA ES LA MISMA QUE LA DE LAS HORAS. `JORNALES_MESES_BASE`, el parámetro que el dueño puede
 * mover: "reciente" se define una sola vez en la pestaña, no una por cuadro.
 *
 * @param {{banco:string, total:string, hasta:string}} col letras del registro
 * @param {number} f0 primera fila del registro
 * @param {number} f1 última fila del registro
 * @returns {string} la fórmula de la fracción que sale en efectivo (0..1)
 */
export function formulaShareEfectivo({ banco, total, hasta }, f0, f1) {
  const rg = (c) => `$${c}$${f0}:$${c}$${f1}`
  const ventana = `(${rg(hasta)}<=TODAY())*(${rg(hasta)}>=EDATE(TODAY();-${RANGO_MESES_BASE}))*(N(${rg(total)})>0)`
  // Sin una sola quincena cerrada en la ventana el cociente es 0/0: el IFERROR devuelve 1 = "todo en
  // efectivo". Es el default conservador y NO es silencioso — la misma ventana vacía ya hace gritar a
  // la celda de horas por persona, tres filas más arriba.
  return `=IFERROR(1-SUMPRODUCT(${ventana}*N(${rg(banco)}))/SUMPRODUCT(${ventana}*N(${rg(total)}));1)`
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
    + `"⚠ el calendario no cierra: oficina $"&TEXT(${dif};"#,##0")&" · dirección $"&TEXT(${difD};"#,##0")`
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
    + `"   · ⚠ "&(${menos})&" persona(s) menos que el plantel base — hasta $"`
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
