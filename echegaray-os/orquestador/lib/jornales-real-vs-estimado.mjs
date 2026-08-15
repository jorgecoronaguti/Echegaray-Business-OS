// LA QUINCENA ESTIMADA CONTRA LA QUINCENA REAL — Y EL REAL SALE DEL BANCO, NO DE LA PLANILLA.
//
// ═══ EL PEDIDO (03/08, textual, y nunca se había ejecutado) ═══
//
// *"el valor q me mostras de la quincena es el estimado, quiero ese y el real"*.
//
// El cuadro de pago publica UN número por nómina. Ese número sale de JORNALES: horas × $/hora, más la
// columna BANCO cuando alguien la cargó. Es la planilla contándose a sí misma. Mientras la única
// fuente fue la planilla, "estimado" y "real" no se podían distinguir: eran la misma celda leída dos
// veces, y por eso el pedido quedó cuatro meses sin respuesta que no fuera circular.
//
// ═══ POR QUÉ AHORA SÍ SE PUEDE ═══
//
// Porque hay una SEGUNDA fuente que no depende de la planilla: el extracto del Santander, ya
// importado a `banco_movimientos` y replicado en `_BANCO_RAW`. Un control no se valida contra la
// misma información que produce — así que el REAL de este módulo es siempre el banco, y la planilla
// nunca puede confirmarse sola.
//
// ═══ LO QUE EL BANCO PRUEBA, MEDIDO EL 14/08/2026 ═══
//
// Catorce movimientos de $260.000 EXACTOS: trece "Acreditacion en cta pago de haber - 260814507" y
// uno "Pago de haberes por cci". Total $3.640.000.
//
// ESO NO ES UNA LIQUIDACIÓN, Y LA DIFERENCIA ES VERIFICABLE. Los lotes del 17/07 y del 31/07 traen
// importes TODOS DISTINTOS entre sí ($217.100, $252.350, $240.000, $1.365.843,84…): ésa es la
// liquidación individual, una transferencia por persona por su neto. Un lote donde catorce personas
// cobran el mismo peso redondo es un PAGO UNIFORME — la forma del 50% acordado— y presentarlo como la
// liquidación final haría creer que la quincena está cerrada cuando falta la otra mitad. Por eso la
// forma del lote se mide (`formaDelLote`) y se publica al lado del número.
//
// ═══ EL EFECTIVO NO TIENE FUENTE, Y SE DICE EN VEZ DE ESTIMARLO ═══
//
// El acuerdo es 50% banco y 50% efectivo. La mitad bancaria la prueba el extracto; la de billetes,
// nada. Se revisaron las tres candidatas antes de declararlo:
//
//   · `_CAJA_ANEXO` / el conteo de efectivo: es un SALDO contado, no un registro de pagos. No puede
//     atribuir una salida a jornales ni a ninguna otra cosa.
//   · la columna «Total recibo» de JORNALES (Z): **verificada celda por celda el 15/08, es
//     `=V*W − Y − X`**, o sea TOTAL − ADELANTO − BANCO. Un RESIDUO ARITMÉTICO de la misma planilla.
//     Publicarla como "el real en efectivo" sería exactamente validar el control con la información
//     que el control produce: daría siempre cero de diferencia y no probaría nada.
//   · el adelanto (Y): sí es un dato tipeado, pero es plata entregada DURANTE la quincena, no el pago
//     del cierre. Mide otra cosa.
//
// Entonces el efectivo va sin número y con el motivo escrito. Un "—" declarado vale más que un
// importe que parece medido y es una resta.
//
// NÚCLEO PURO: entran fechas ISO y números, salen números y fórmulas es-AR. No lee Google, no toca la
// base, no mira el reloj.

import { VENTANA_BANCO_DIAS, NATURALEZA_SUELDOS, RANGO_VENTANA, aFecha, iso } from './jornales-fecha-pago.mjs'

const DIA = 86400000
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
/**
 * Centavos CON SIGNO, y el signo importa. El extracto trae los pagos en negativo y podría traer una
 * REVERSA en positivo: sumando magnitudes, una reversa se sumaría en vez de restarse y el real
 * quedaría por encima de lo que salió de la cuenta. Se trabaja en enteros porque comparar dos
 * importes "iguales" con floats es cómo $260.000,00 deja de ser igual a $260.000,00.
 */
const cent = (v) => Math.round(num(v) * 100)

/**
 * EL UMBRAL DEL AVISO — MEDIDO CONTRA LA PRÁCTICA REAL, NO ELEGIDO POR GUSTO.
 *
 * ═══ POR QUÉ 2% ═══
 *
 * La transferencia de cada persona se REDONDEA a un número lindo: el 14/08 los catorce salieron a
 * $260.000 clavados, no a su 50% exacto al peso. Ese redondeo es la única fuente de ruido legítima
 * entre estimado y real, y tiene tamaño acotado: redondeando cada transferencia al $10.000 más
 * cercano, el error máximo por persona es $5.000 y el peor caso sobre catorce personas es $70.000
 * contra un lote de $3,64M — 1,9%. O sea que 2% es exactamente el piso de ruido del redondeo, no un
 * número redondo simpático.
 *
 * Y del otro lado: la desviación que SÍ hay que ver es que falte una persona en el lote, que vale
 * $260.000 = 7,1% del lote. Queda tres veces y media por encima del umbral. La medición del 15/08
 * —$800 sobre $3.639.200, 0,022%— queda noventa veces por debajo. El umbral separa los dos casos con
 * margen de sobra por los dos lados.
 *
 * ═══ POR QUÉ ADEMÁS UN PISO EN PESOS ═══
 *
 * Con sólo el 2% relativo, una quincena chica dispara por nada: dos personas, $500.000 de lote, y
 * $10.000 de redondeo ya son 2%. El piso absoluto apaga ese falso positivo. $50.000 es diez veces el
 * error de redondeo de una persona: por debajo de eso, la diferencia no puede ser otra cosa.
 */
export const UMBRAL_RELATIVO = 0.02
export const UMBRAL_ABSOLUTO = 50000

/**
 * QUÉ FRACCIÓN DEL LOTE TIENE QUE COMPARTIR IMPORTE PARA LLAMARLO UNIFORME.
 *
 * Cuatro quintos, y no "todos iguales": el lote real trae un movimiento por un canal distinto
 * ("Pago de haberes por cci") y podría traer una persona con un importe propio sin dejar de ser el
 * pago uniforme del resto. Exigir el 100% haría que un solo caso especial reclasifique el lote entero
 * como liquidación individual, que es la lectura opuesta.
 *
 * Se escribe como fracción de enteros porque la fórmula del Sheet la usa igual (`n*5>=total*4`): un
 * literal decimal escrito por API viaja en el locale es_AR, donde la coma SEPARA ARGUMENTOS.
 */
export const UNIFORME_NUM = 4
export const UNIFORME_DEN = 5

/** El último día HÁBIL menor o igual a `fecha`, en ISO. PURO. No contempla feriados — igual que
 *  `WORKDAY()` sin lista, que es la contraparte de esto en la fórmula: si difirieran, habría dos
 *  verdades sobre qué pago es de esta quincena. */
export function ultimoDiaHabil(fecha) {
  const d = aFecha(fecha)
  if (!d) return null
  const out = new Date(d)
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() - 1)
  return iso(out)
}

/**
 * NÚCLEO PURO: LA VENTANA EN QUE UN PAGO DEL BANCO PERTENECE A ESTA QUINCENA — POR PERÍODO.
 *
 * ═══ POR QUÉ NO ALCANZA "EL ÚLTIMO PAGO" (pedido del dueño, punto 3) ═══
 *
 * Una quincena se paga después de cerrar, así que emparejar por "el pago más reciente" le regala a la
 * quincena en curso el lote de la anterior, y el que mira no puede ver a qué período corresponde cada
 * peso. La ventana se DERIVA del período: arranca en el cierre y termina donde el desfase razonable.
 *
 * ═══ POR QUÉ EL BORDE DE ABAJO ES EL ÚLTIMO DÍA HÁBIL Y NO EL CIERRE ═══
 *
 * Medido: la quincena cierra el sábado 15/08/2026 y el lote salió el VIERNES 14/08. No es una
 * anticipación caprichosa — es que el banco no acredita un sábado. Con el borde clavado en `hasta` el
 * lote entero quedaba afuera y el cuadro habría publicado "real $0" con $3.640.000 en la cuenta.
 * Y con un borde de "hasta − N días" fijo se colaba el pago suelto del 13/08 ($239.790,94), que NO es
 * de esta quincena: el día hábil lo deja afuera solo, sin ninguna regla extra.
 *
 * LAS VENTANAS NO SE SOLAPAN, y eso es lo que permite que un pago tenga un solo dueño: una quincena
 * dura como mínimo trece días y la ventana mide diez más dos de anticipación como mucho.
 *
 * @param {{hasta:string|Date, ventanaDias?:number}} q
 * @returns {{desde:string, hasta:string}|null}
 */
export function ventanaDePago({ hasta, ventanaDias = VENTANA_BANCO_DIAS } = {}) {
  const cierre = aFecha(hasta)
  if (!cierre) return null
  const fin = new Date(cierre.getTime() + Math.max(0, num(ventanaDias)) * DIA)
  return { desde: ultimoDiaHabil(cierre), hasta: iso(fin) }
}

/**
 * NÚCLEO PURO: la FORMA de un lote de pagos — uniforme (pago a cuenta) o individual (liquidación).
 *
 * El importe más repetido y cuántos movimientos lo comparten. Con todos distintos, `modo` queda en
 * null y `uniforme` en false: es la liquidación persona por persona.
 *
 * @param {Array<number|{importe:number}>} pagos
 * @returns {{movimientos:number, modo:number|null, repetidos:number, uniforme:boolean}}
 */
export function formaDelLote(pagos = []) {
  const imp = (pagos ?? []).map((p) => cent(typeof p === 'object' && p !== null ? p.importe : p))
  const n = imp.length
  if (!n) return { movimientos: 0, modo: null, repetidos: 0, uniforme: false }
  const cuenta = new Map()
  for (const c of imp) cuenta.set(c, (cuenta.get(c) ?? 0) + 1)
  // Ante empate manda el importe MAYOR, no el que llegó primero: con el orden de la lista, el mismo
  // conjunto de pagos daría dos respuestas distintas según cómo lo devolvió la base.
  let modo = null
  let repetidos = 0
  for (const [c, k] of cuenta) if (k > repetidos || (k === repetidos && c > modo)) { modo = c; repetidos = k }
  return {
    movimientos: n,
    modo: modo == null ? null : modo / 100,
    repetidos,
    uniforme: repetidos > 1 && repetidos * UNIFORME_DEN >= n * UNIFORME_NUM,
  }
}

/**
 * NÚCLEO PURO: lo que el banco pagó DE ESTA QUINCENA, con su forma y su fecha.
 *
 * Los importes del extracto son negativos (salen de la cuenta) y acá se devuelven en positivo: el
 * cuadro compara contra un estimado positivo, y una resta de signos cruzados es cómo una diferencia
 * de $800 se publica como $7.280.000.
 *
 * @param {{pagos:Array, hasta:string|Date, ventanaDias?:number}} e
 * @returns {{total:number, movimientos:number, fecha:string|null, uniforme:boolean, modo:number|null, ventana:object|null}}
 */
export function realDelPeriodo({ pagos = [], hasta, ventanaDias = VENTANA_BANCO_DIAS } = {}) {
  const v = ventanaDePago({ hasta, ventanaDias })
  const vacío = { total: 0, movimientos: 0, fecha: null, uniforme: false, modo: null, ventana: v }
  if (!v) return vacío
  const dentro = (pagos ?? []).filter((p) => {
    const f = iso(aFecha(p?.fecha))
    return f && f >= v.desde && f <= v.hasta
  })
  if (!dentro.length) return vacío
  const forma = formaDelLote(dentro)
  return {
    // ABS del TOTAL, no de cada fila: así una reversa (que llega en positivo) resta como corresponde.
    total: Math.abs(dentro.reduce((a, p) => a + cent(p.importe), 0)) / 100,
    movimientos: forma.movimientos,
    fecha: dentro.map((p) => iso(aFecha(p.fecha))).sort()[0],
    uniforme: forma.uniforme,
    modo: forma.modo,
    ventana: v,
  }
}

/**
 * NÚCLEO PURO: cada pago del banco a la quincena cuyo PERÍODO lo explica; el resto, a la vista.
 *
 * UN PAGO SE CONSUME UNA SOLA VEZ. Si dos ventanas lo alcanzaran, se lo lleva la quincena de cierre
 * más cercano: repartir el mismo peso entre dos quincenas es la forma exacta de dar por pagada dos
 * veces la misma plata, que es el defecto que este repo ya pagó con la proyección de jornales.
 *
 * LO QUE NO ENTRA EN NINGUNA VENTANA NO SE FUERZA. El pago suelto del 13/08 ($239.790,94, una sola
 * persona a mitad de quincena) queda huérfano y se declara: puede ser una liquidación final, un SAC o
 * un adelanto, y este módulo no puede decidirlo. Imputarlo "porque tiene que ser de alguien" es cómo
 * un control deja de ser un control.
 *
 * @param {{quincenas:Array<{desde?:string,hasta:string}>, pagos:Array, ventanaDias?:number}} e
 */
export function emparejarPorPeriodo({ quincenas = [], pagos = [], ventanaDias = VENTANA_BANCO_DIAS } = {}) {
  const qs = (quincenas ?? []).map((q) => ({
    desde: iso(aFecha(q?.desde)) ?? null,
    hasta: iso(aFecha(q?.hasta)),
    ventana: ventanaDePago({ hasta: q?.hasta, ventanaDias }),
    pagos: [],
  }))
  const huerfanos = []
  for (const p of pagos ?? []) {
    const f = iso(aFecha(p?.fecha))
    const q = f ? mejorPorPeriodo(qs, f) : null
    if (!q) { huerfanos.push({ ...p, fecha: f }); continue }
    q.pagos.push({ ...p, fecha: f })
  }
  return {
    quincenas: qs.map((q) => ({
      desde: q.desde,
      hasta: q.hasta,
      ventana: q.ventana,
      ...formaDelLote(q.pagos),
        total: Math.abs(q.pagos.reduce((a, p) => a + cent(p.importe), 0)) / 100,
      pagos: q.pagos,
    })),
    huerfanos,
  }
}

/** La quincena cuya ventana contiene la fecha y cuyo cierre está más cerca. PURA. */
function mejorPorPeriodo(qs, f) {
  let mejor = null
  let dist = Infinity
  for (const q of qs) {
    if (!q.ventana || f < q.ventana.desde || f > q.ventana.hasta) continue
    const d = Math.abs(Date.parse(`${f}T00:00:00Z`) - Date.parse(`${q.hasta}T00:00:00Z`))
    if (d < dist) { mejor = q; dist = d }
  }
  return mejor
}

/**
 * NÚCLEO PURO: la variancia entre lo que el cuadro publica y lo que el banco pagó.
 *
 * `diferencia = real − estimado`, en ese orden y no al revés: es la notación de variancia estándar
 * (AC − PL), donde positivo significa "salió MÁS de lo que decía el cuadro". Invertirla haría que el
 * signo del renglón dijera lo contrario de lo que dice el mismo signo en el resto del libro.
 *
 * `supera` es null —no false— cuando no hay con qué comparar: "no hay evidencia" y "está dentro del
 * umbral" son dos cosas distintas y confundirlas enciende o apaga el aviso por la razón equivocada.
 *
 * @param {{estimado:number, real:number|null, movimientos?:number}} e
 */
export function contrastar({ estimado, real, movimientos = null } = {}) {
  const est = num(estimado)
  const hayReal = real != null && Number.isFinite(Number(real)) && (movimientos == null || movimientos > 0)
  if (!hayReal || !est) return { estimado: est, real: hayReal ? num(real) : null, diferencia: null, delta: null, umbral: null, supera: null }
  const r = num(real)
  const diferencia = Math.round((r - est) * 100) / 100
  const umbral = Math.max(Math.abs(est) * UMBRAL_RELATIVO, UMBRAL_ABSOLUTO)
  return { estimado: est, real: r, diferencia, delta: diferencia / est, umbral, supera: Math.abs(diferencia) > umbral }
}

// ── LAS FÓRMULAS DE LA PESTAÑA ───────────────────────────────────────────────────────────────────
//
// Todo lo de acá abajo devuelve fórmulas es-AR (separador `;`, NUNCA `,`) que leen `_BANCO_RAW` con
// RANGO ABIERTO. El techo fijo es el modo de falla que este libro ya pagó tres veces: el extracto
// crece con cada importación y un `$A$4:$A$400` deja de ver los lotes nuevos SIN dar error.
//
// LOS PATRONES DE `TEXT()` VAN EN FORMATO US (`#,##0`, `0.0%`) aunque los argumentos vayan en locale:
// son dos gramáticas distintas en la misma fórmula y mezclarlas deja la celda en #ERROR.

const RAW = "'_BANCO_RAW'"
const FECHA = `${RAW}!$A$4:$A`
const IMPORTE = `${RAW}!$C$4:$C`
const NAT = `${RAW}!$F$4:$F`

/** Los dos bordes de la ventana, como expresiones del Sheet. `celdaHasta` es el cierre de la quincena. */
export function expresionVentana(celdaHasta) {
  return {
    // `WORKDAY(x+1;-1)` = el último día hábil menor o igual a x. Es el mismo criterio que
    // `ultimoDiaHabil`, y tiene que serlo: si el JS y la fórmula difirieran, habría dos verdades sobre
    // qué pago es de esta quincena y el test verde no probaría lo que publica la celda.
    desde: `WORKDAY(${celdaHasta}+1;-1)`,
    hasta: `${celdaHasta}+${RANGO_VENTANA}`,
  }
}

/** Los criterios de SUMIFS/COUNTIFS de la ventana. Uno solo, para que no puedan desalinearse. */
const criterios = (celdaHasta) => {
  const v = expresionVentana(celdaHasta)
  return `${NAT};"${NATURALEZA_SUELDOS}";${FECHA};">="&${v.desde};${FECHA};"<="&${v.hasta}`
}

/** Lo que el banco pagó de esta quincena. En POSITIVO: el extracto los trae negativos. */
export const formulaRealBanco = (celdaHasta) =>
  `=IF(N(${celdaHasta})=0;"";ABS(SUMIFS(${IMPORTE};${criterios(celdaHasta)})))`

/** Cuántos movimientos componen ese real. Es lo que distingue un lote de un pago suelto. */
export const formulaMovimientos = (celdaHasta) =>
  `=IF(N(${celdaHasta})=0;"";COUNTIFS(${criterios(celdaHasta)}))`

/** La fecha del lote: la PRIMERA del período, no la última importación. */
export function formulaFechaDelLote(celdaHasta) {
  const v = expresionVentana(celdaHasta)
  return `=IFERROR(MIN(FILTER(${FECHA};${NAT}="${NATURALEZA_SUELDOS}";${FECHA}>=${v.desde};${FECHA}<=${v.hasta}));"")`
}

/**
 * DE DÓNDE SALE EL REAL, Y QUÉ FORMA TIENE EL LOTE — la línea que impide leer un pago a cuenta como
 * una liquidación.
 *
 * `n*5>=total*4` y no `n/total>=0,8`: el literal decimal viaja en locale es_AR y ahí la coma parte la
 * fórmula en dos argumentos. Misma regla, en enteros. Y `MODE` sobre un lote de importes TODOS
 * distintos devuelve #N/A, que `IFERROR` convierte en 0 y hace que la cuenta del modo dé cero: el
 * caso "liquidación individual" se resuelve solo, sin una rama extra.
 *
 * @param {{celdaHasta:string, celdaMovs:string}} p
 */
export function formulaOrigenDelReal({ celdaHasta, celdaMovs }) {
  const v = expresionVentana(celdaHasta)
  const modo = `IFERROR(MODE(FILTER(${IMPORTE};${NAT}="${NATURALEZA_SUELDOS}";${FECHA}>=${v.desde};${FECHA}<=${v.hasta}));0)`
  const nModo = `COUNTIFS(${criterios(celdaHasta)};${IMPORTE};${modo})`
  const n = `N(${celdaMovs})`
  return `=IF(${n}=0;"sin movimientos de haberes en la ventana de pago — el extracto todavía no los muestra";`
    + `IF(${nModo}*${UNIFORME_DEN}>=${n}*${UNIFORME_NUM};`
    + `"extracto · "&${n}&" movimientos iguales de "&TEXT(ABS(${modo});"$#,##0")&" — pago uniforme, la forma del 50% acordado; NO es la liquidación individual";`
    + `"extracto · "&${n}&" movimientos de importes distintos — liquidación individual, persona por persona"))`
}

/** El total de la quincena INFERIDO del acuerdo: el banco por dos. `*2`, entero, sin coma. */
export const formulaTotalInferido = (celdaRealBanco) =>
  `=IF(N(${celdaRealBanco})=0;"";${celdaRealBanco}*2)`

/** Real − Estimado. Vacío mientras falte cualquiera de los dos: un cero ahí se leería como "cierra". */
export const formulaDiferencia = (est, real) =>
  `=IF(OR(N(${est})=0;N(${real})=0);"";${real}-${est})`

/** La misma diferencia en porcentaje del estimado. */
export const formulaDelta = (est, dif) =>
  `=IF(OR(N(${est})=0;NOT(ISNUMBER(${dif})));"";${dif}/${est})`

/**
 * EL AVISO: se enciende sólo cuando la diferencia pasa el umbral, y sólo si hay con qué comparar.
 *
 * `N(est)/50` es el 2% escrito sin coma decimal (ver UMBRAL_RELATIVO). El piso en pesos va como
 * literal entero por la misma razón. Se mide sobre la fila del BANCO —la única con prueba— y no sobre
 * el total, que es una inferencia: un aviso disparado por una inferencia no es un control.
 *
 * @param {{movs:string, est:string, dif:string, delta:string}} c referencias A1 de la fila del banco
 */
export function formulaAvisoUmbral({ movs, est, dif, delta }) {
  const umbral = `MAX(N(${est})/50;${UMBRAL_ABSOLUTO})`
  return `=IF(OR(N(${movs})=0;N(${est})=0);"";IF(ABS(N(${dif}))<=${umbral};"";`
    + `"▲ El banco pagó "&TEXT(${dif};"$#,##0")&" ("&TEXT(${delta};"0.0%")&") contra lo estimado — arriba del umbral (2% o $50.000)"))`
}

/**
 * El subtítulo del bloque: el PERÍODO al que corresponde el pago, por fórmula y desde el registro.
 *
 * SALE DEL REGISTRO Y NO DE LA CORRIDA: la pestaña se lee días después de escribirse y una fecha de
 * JavaScript estampada envejece muda. Y la glosa se queda en 47 caracteres a propósito — la columna A
 * de esta pestaña tiene tope de 60 y su test lo mide (ver `glosasLargas`).
 */
export const formulaSubtituloContraste = (fReg) =>
  `="Quincena "&TEXT($A$${fReg};"d/m")&"→"&TEXT($B$${fReg};"d/m")`
  + `&" · el real sale del extracto, no de la planilla"`

/**
 * LAS OCHO COLUMNAS DEL CUADRO, DECLARADAS UNA SOLA VEZ.
 *
 * Ocho, como el resto del hero: dos anchos de grilla en la misma pestaña es el defecto que
 * `auditarPatron` marca y el dueño ve corrido. El orden es el del payroll register que ya usa el
 * cuadro de arriba —identificación primero, números después— y la prosa va ÚLTIMA porque un texto
 * largo en el medio desparrama la fila.
 *
 * «Concepto» y no «Canal»: `ES_ENCABEZADO` reconoce la fila de rótulos por su primera palabra, y un
 * encabezado que no reconoce deja el cuadro fuera de la medición de ancho.
 */
export const COLS_CONTRASTE = ['Concepto', 'Cuándo', 'Movimientos', 'Estimado', 'Real', 'Diferencia', 'Δ %', 'De dónde sale el real']

/** La letra A1 de una columna del cuadro, buscada por su rótulo. Falla ruidosa, nunca un default. */
export function colContraste(rotulo, cols = COLS_CONTRASTE) {
  const i = cols.indexOf(rotulo)
  if (i < 0) throw new Error(`colContraste: el cuadro no tiene la columna "${rotulo}"`)
  return String.fromCharCode(65 + i)
}

/**
 * POR QUÉ EL EFECTIVO VA SIN NÚMERO — el texto que va en la celda, escrito una sola vez.
 *
 * Es un LÍMITE DECLARADO, no un pendiente: mientras nadie registre la entrega de billetes, el real en
 * efectivo no existe como dato. El día que exista una planilla de sobres firmados, esta constante se
 * reemplaza por su fórmula y el cuadro deja de tener un hueco.
 */
export const EFECTIVO_SIN_FUENTE = 'sin fuente: «Total recibo» de JORNALES es TOTAL−ADELANTO−BANCO, un residuo de la misma planilla'

/** Ídem para el total: es una INFERENCIA del acuerdo y el cuadro lo dice en la celda, no en una nota. */
export const TOTAL_INFERIDO = 'INFERIDO del acuerdo 50/50 — banco × 2. No es un hecho: la mitad en efectivo no está probada'
