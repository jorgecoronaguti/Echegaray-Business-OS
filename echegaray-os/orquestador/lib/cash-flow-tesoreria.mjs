// LAS TRES PREGUNTAS QUE UN CUADRO DE CAJA TIENE QUE CONTESTAR Y ÉSTOS NO CONTESTABAN.
//
// Los dos cash flow mostraban el movimiento del efectivo con la estructura que pide la norma, pero
// callaban lo que un director hace con eso. La skill de tesorería nombra las preguntas una por una:
//
//   · "¿Cuál es la peor semana del forecast, y qué la explica?"  → el cuadro tenía 53 columnas y
//     había que recorrerlas a ojo. Ahora la nombra, con su fecha y con el rubro que la produce.
//   · "Cobertura de obligaciones: (caja + cobranzas comprometidas) / obligaciones de los próximos
//     30-60-90 días"  → no existía en ninguna pestaña.
//   · "Concentración de cobranza: % de la cobranza que depende de un solo cliente. Alta
//     concentración = el riesgo de caja no es financiero, es comercial."  → tampoco existía, y hoy
//     tres clientes concentran el 87% de lo pendiente. Eso no es una tensión de tesorería: es una
//     exposición comercial que la tesorería sólo padece.
//   · "¿Qué diferencia hay entre lo que el forecast decía y lo que realmente pasó — y qué supuesto
//     falló?" → el contraste explícito, que la skill declara como gap confirmado de Echegaray.
//
// TODO SALE POR FÓRMULA, DE LAS MISMAS FUENTES QUE YA USA EL CUADRO. Ni un número escrito por el
// generador: un indicador de riesgo pegado a mano envejece sin avisar, y es justamente el que se
// mira cuando hay que decidir rápido.
//
// EL CONTRASTE NO NECESITA UNA FOTO GUARDADA, Y ESO IMPORTA. La forma habitual de comparar
// "proyectado contra real" es archivar el forecast de la semana pasada y compararlo. Acá no hace
// falta: Cobranzas ya guarda las DOS fechas de cada cobro —la comprometida (columna P) y la real de
// cobro (columna Q)—. Comparar la plata que vencía en una semana contra la que efectivamente entró
// esa semana es un contraste entre dos HECHOS registrados, no entre un hecho y una foto de una
// opinión vieja. Del lado del egreso ese contraste NO se puede hacer y se dice: Compras tiene una
// sola fecha de pago, así que no existe registro de "cuándo se había prometido pagar".

import { FIN_COB, COL_VALOR_BANCO, MARCA_ENDOSADO } from './cash-flow-lineas.mjs'

/** Las columnas de Cobranzas que mira este archivo. Una sola definición, como el resto del cuadro. */
const COB = { cliente: 'G', monto: 'M', estado: 'O', vence: 'P', cobro: 'Q' }
const r = (c) => `Cobranzas!$${c}$5:$${c}$${FIN_COB}`
/** El monto tratando el no-número como 0: hay celdas con "-" y con moneda extranjera sin convertir. */
const monto = () => `IF(ISNUMBER(${r(COB.monto)});${r(COB.monto)};0)`
/** Un valor endosado no va a entrar a la cuenta: mismo filtro que usan las líneas de ingreso. */
const noEndosado = () => `(LEFT(Cobranzas!${COL_VALOR_BANCO}&"";${MARCA_ENDOSADO.length})<>"${MARCA_ENDOSADO}")`
const enVentana = (col, desde, hasta) => `(ISNUMBER(${r(col)}))*(${r(col)}>=${desde})*(${r(col)}<${hasta})`

// ── QUERY sobre Cobranzas: es la fórmula MÁS SIMPLE para agrupar por cliente ───────────────────────
// El checklist de clase mundial prefiere SUMIFS antes que QUERY, y con razón. Pero acá hace falta
// "agrupar por cliente y quedarse con los tres mayores", y con SUMIFS eso sale como un LARGE(UNIQUE(
// ARRAYFORMULA(SUMIFS(...)))) repetido tres veces: más largo, más frágil y menos legible que la
// consulta. La regla es "la fórmula más simple que resuelve", no "SUMIFS siempre".
const Q_RANGO = `Cobranzas!$${COB.cliente}$5:$${COB.vence}$${FIN_COB}`
// G=Col1 … M=Col7 … O=Col9, P=Col10. Si cambia el orden de columnas de Cobranzas esto se rompe FUERTE
// (da otro número, no un error), y por eso vive acá al lado del mapa COB y no repartido en el cuadro.
const Q_PEND = "lower(Col9)<>'cobrado' and lower(Col9)<>'endosado' and Col1 is not null"
const Q_LABEL = "label sum(Col7) ''"
const queryClientes = (where, limite) => `QUERY(${Q_RANGO};"select Col1,sum(Col7) where ${where} group by Col1 order by sum(Col7) desc${limite ? ` limit ${limite}` : ''} ${Q_LABEL}";0)`

/**
 * NÚCLEO PURO: el bloque de decisión que va debajo del efectivo al cierre.
 *
 * @param {object} p
 * @param {'semanal'|'mensual'} p.periodo
 * @param {number} p.fila0 fila (1-based) donde arranca el bloque
 * @param {string} p.colN letra de la ÚLTIMA columna de período
 * @param {number} p.filaCab fila del encabezado de períodos
 * @param {number} p.filaCierre fila del efectivo al cierre
 * @param {number[]} p.filasEgreso filas de subtotal de cada categoría de egreso
 * @param {number[]} p.filasIngreso filas de subtotal de cada categoría de ingreso
 * @param {string|null} p.refCaja referencia al total de disponibilidades (rango con nombre)
 * @returns {{filas:Array<Array<string>>, formatos:{moneda:number[],porcentaje:number[],fecha:number[],texto:number[],entero:number[]}, titulo:number}}
 */
export function bloqueDecision({ periodo, fila0, colN, filaCab, filaCierre, filasEgreso, filasIngreso, refCaja }) {
  const U = periodo === 'semanal' ? 'semana' : 'mes'
  const Us = periodo === 'semanal' ? 'Semanas' : 'Meses'
  const filas = []
  const push = (a, b = '', c = '') => { filas.push([a, b, c]); return fila0 + filas.length - 1 }
  const rango = (f) => `$B$${f}:${colN}$${f}`
  const cierres = rango(filaCierre)

  // 55 caracteres en una columna de 340px: entran 54, y el auditor de pantalla lo marcaba cortado por
  // UNO. "de cliente" no agrega nada que las filas de abajo no digan con su propio rótulo.
  const fTit = push('LO QUE ESTE CUADRO DECIDE — riesgo de caja y cliente')
  // La peor columna se identifica por su FECHA, no por su número de columna: así el resto del bloque
  // la vuelve a encontrar aunque la grilla cambie de ancho, y de paso se lee.
  const fPeor = push(`Peor ${U} del horizonte`, `=IFERROR(INDEX(${rango(filaCab)};1;MATCH(MIN(${cierres});${cierres};0));"")`)
  const col = `MATCH($B$${fPeor};${rango(filaCab)};0)`
  push(`· efectivo al cierre de ${periodo === 'semanal' ? 'esa semana' : 'ese mes'}`, `=IFERROR(MIN(${cierres});"")`)
  // Qué la explica: la CATEGORÍA de egreso más grande de esa columna. Se usa la categoría y no la
  // línea suelta porque es el nivel en el que se decide (se difiere un pago a proveedores, no "la
  // factura 47"), y porque son seis celdas contra veintitrés.
  const val = (f) => `IFERROR(INDEX(${rango(f)};1;${col});0)`
  // La fila se conoce ANTES de escribirla porque la celda C se refiere a la celda B de su propia
  // fila: `fila0 + filas.length` es la que va a ocupar el push de abajo.
  const fRubro = fila0 + filas.length
  push('· el egreso que más la explica',
    `=IFERROR(MAX(${filasEgreso.map(val).join(';')});"")`,
    `=IFERROR(IFS(${filasEgreso.map((f) => `${val(f)}=$B$${fRubro};$A$${f}`).join(';')});"")`)
  push(`${Us} del horizonte con la caja en negativo`, `=COUNTIF(${cierres};"<0")`)

  // ── COBERTURA DE OBLIGACIONES ───────────────────────────────────────────────────────────────────
  // (caja de hoy + cobros previstos en la ventana) / (pagos previstos en la ventana). Menor que 1 =
  // la ventana no se cubre sola y hay que salir a buscar la diferencia.
  const finCol = periodo === 'semanal' ? `(${rango(filaCab)}+7)` : `ARRAYFORMULA(EOMONTH(${rango(filaCab)};0)+1)`
  const suma = (fs) => fs.map(rango).join('+')
  const dentro = (d) => `(${finCol}>TODAY())*(${rango(filaCab)}<TODAY()+${d})`
  const caja = refCaja ? `IFERROR(N(${refCaja});0)` : '0'
  const cobertura = (d) => `=IFERROR((${caja}+SUMPRODUCT(${dentro(d)}*(${suma(filasIngreso)})))/SUMPRODUCT(${dentro(d)}*(${suma(filasEgreso)}));"")`
  const fCob30 = push('Cobertura de obligaciones a 30 días', cobertura(30))
  push('Cobertura de obligaciones a 60 días', cobertura(60))
  push('Cobertura de obligaciones a 90 días', cobertura(90))

  // ── CONCENTRACIÓN DE COBRANZA ───────────────────────────────────────────────────────────────────
  const fPend = push('Cobranza pendiente de cobro (todas las obras)',
    `=IFERROR(SUM(INDEX(${queryClientes(Q_PEND)};0;2));0)`)
  const top1 = `INDEX(${queryClientes(Q_PEND, 1)};1;2)`
  push('· el mayor cliente concentra', `=IFERROR(${top1}/$B$${fPend};"")`,
    `=IFERROR(INDEX(${queryClientes(Q_PEND, 1)};1;1);"")`)
  push('· los tres mayores concentran', `=IFERROR(SUM(INDEX(${queryClientes(Q_PEND, 3)};0;2))/$B$${fPend};"")`)
  const fVenc = push('· ya venció y sigue sin cobrarse',
    `=IFERROR(SUM(INDEX(${queryClientes(`${Q_PEND} and Col10 < date '"&TEXT(TODAY();"yyyy-mm-dd")&"'`)};0;2));0)`)

  return {
    filas,
    titulo: fTit,
    formatos: {
      fecha: [fPeor],
      moneda: [fPeor + 1, fRubro, fPend, fVenc],
      entero: [fRubro + 1],
      porcentaje: [fCob30, fCob30 + 1, fCob30 + 2, fVenc - 2, fVenc - 1],
      texto: [fTit],
    },
  }
}

/**
 * NÚCLEO PURO: el contraste "lo esperado contra lo que ocurrió", sobre períodos YA CERRADOS.
 *
 * TIENE SU PROPIO ENCABEZADO DE FECHAS Y NO REUSA EL DEL CUADRO. El cuadro semanal ahora mira 13
 * semanas hacia adelante: adentro de esa ventana no hay ni un período cerrado, así que un contraste
 * pintado sobre esas columnas saldría vacío entero. Y mezclarlo con la grilla principal violaría la
 * regla de no mezclar ventanas de tiempo incompatibles. Es otro tiempo: lleva su propio encabezado y
 * lo dice en el título.
 *
 * @param {object} p
 * @param {number} p.fila0 · @param {Date[]} p.periodos fechas de inicio de los períodos cerrados
 * @param {'semanal'|'mensual'} p.periodo
 * @param {(d:Date)=>string} p.fechaAR
 * @returns {{filas:Array<Array<string>>, titulo:number, filaCab:number, formatos:object}}
 */
export function bloqueContraste({ fila0, periodos, periodo, fechaAR }) {
  const filas = []
  const push = (celdas) => { filas.push(celdas); return fila0 + filas.length - 1 }
  const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
  const desde = (i) => `${letra(i + 1)}$${fila0 + 1}`
  const hasta = (i) => (periodo === 'semanal' ? `${letra(i + 1)}$${fila0 + 1}+7` : `EOMONTH(${letra(i + 1)}$${fila0 + 1};0)+1`)
  const cols = periodos.map((_, i) => i)

  const fTit = push([`LO ESPERADO CONTRA LO QUE OCURRIÓ — ${periodo === 'semanal' ? 'las 4 semanas' : 'los meses'} ya cerradas`])
  const fCab = push(['Período cerrado', ...periodos.map(fechaAR)])
  // Lo que VENCÍA: la fecha comprometida con el cliente (columna P de Cobranzas), sin importar si
  // después entró o no. Es el supuesto que el forecast estaba usando.
  const fEsp = push(['Cobranzas que vencían en el período (comprometido)',
    ...cols.map((i) => `=SUMPRODUCT(${enVentana(COB.vence, desde(i), hasta(i))}*(LOWER(${r(COB.estado)})<>"endosado")*${noEndosado()}*${monto()})`)])
  // Lo que OCURRIÓ: la fecha real de cobro (columna Q) con el estado en "Cobrado". Es el hecho.
  const fReal = push(['Cobranzas efectivamente cobradas en el período',
    ...cols.map((i) => `=SUMPRODUCT(${enVentana(COB.cobro, desde(i), hasta(i))}*(LOWER(${r(COB.estado)})="cobrado")*${noEndosado()}*${monto()})`)])
  const fDesv = push(['⇒ Desvío: lo que se esperaba y no entró', ...cols.map((i) => `=${letra(i + 1)}${fEsp}-${letra(i + 1)}${fReal}`)])
  // Y de lo que vencía en ese período, cuánto SIGUE sin cobrarse hoy. El desvío de arriba se puede
  // deber a que el cobro entró una semana más tarde (un atraso que ya se resolvió); esto es la parte
  // que todavía no se resolvió, y es la que hay que ir a reclamar.
  const fHoy = push(['De lo que vencía, hoy sigue sin cobrarse (VENCIDO)',
    ...cols.map((i) => `=SUMPRODUCT(${enVentana(COB.vence, desde(i), hasta(i))}*(LOWER(${r(COB.estado)})<>"cobrado")*(LOWER(${r(COB.estado)})<>"endosado")*${noEndosado()}*${monto()})`)])

  return { filas, titulo: fTit, filaCab: fCab, ancho: periodos.length + 1, formatos: { fecha: [fCab], moneda: [fEsp, fReal, fDesv, fHoy] } }
}

/**
 * NÚCLEO PURO: la composición del flujo del horizonte por naturaleza del dato, con su control.
 *
 * "Nunca se suman dos categorías distintas en la misma columna sin distinguirlas" (skill de
 * tesorería). El cuerpo del cuadro sí las suma —una línea de materiales trae lo ya facturado y lo
 * que falta cargar— y no puede no hacerlo: es el flujo. Lo que sí se puede es DECIR de qué está
 * hecho ese total, y probarlo: las cuatro cajas tienen que dar exactamente la variación neta. Si no
 * da, alguna línea quedó sin clasificar o su parte real no cuadra con su total, y el cuadro lo grita
 * en vez de promediar el error.
 *
 * @param {object} p
 * @param {number} p.fila0 · @param {string} p.colTotal letra de la columna del total
 * @param {number} p.filaVariacion
 * @param {Array<{fila:number,signo:number,real:string|null}>} p.partes una por línea que suma al flujo:
 *   `real` es la expresión de su parte con comprobante en la ventana entera, o null si no proyecta.
 * @param {number[]} p.filasEsperado filas de las líneas de cobranza esperada
 * @param {number[]} p.filasModelo filas de las líneas que modela el OS
 * @returns {{filas:Array<Array<string>>, titulo:number, formatos:object}}
 */
export function bloqueNaturaleza({ fila0, colTotal, filaVariacion, partes, filasEsperado, filasModelo }) {
  const filas = []
  const push = (a, b = '') => { filas.push([a, b]); return fila0 + filas.length - 1 }
  const signo = (s) => (s > 0 ? '+' : '-')
  const T = (f) => `${colTotal}${f}`
  // Con comprobante: las líneas que NO proyectan entran enteras (su total ES un documento cargado);
  // las que proyectan entran sólo por su parte real, que se vuelve a calcular sobre la ventana
  // completa del horizonte con la MISMA expresión que usa cada columna.
  const conComprobante = partes.map((p) => `${signo(p.signo)}${p.real === null ? T(p.fila) : `(${p.real})`}`).join('')
  // Lo proyectado es lo que le falta a cada línea para llegar a su total: total − parte real. Las que
  // no proyectan aportan cero y por eso no aparecen acá.
  const proyectado = partes.filter((p) => p.real !== null).map((p) => `${signo(p.signo)}(${T(p.fila)}-(${p.real}))`).join('')

  const fTit = push('COMPOSICIÓN DEL FLUJO — de qué está hecho el total')
  const fA = push('Con comprobante cargado (pagado o comprometido)', `=${conComprobante}`)
  const fB = push('Esperado de clientes, todavía sin cobrar (proyectado)', filasEsperado.length ? `=${filasEsperado.map((f) => `+${T(f)}`).join('')}` : '=0')
  const fC = push('Sin comprobante: lo que falta cargar del mes (proyectado)', proyectado ? `=${proyectado}` : '=0')
  const fD = push('Modelado por el OS: interés, comisiones, impuestos (estimado)', filasModelo.length ? `=${filasModelo.map((f) => `-${T(f)}`).join('')}` : '=0')
  const fCtrl = push('⇒ Control: las cuatro cajas suman la variación neta ($0)',
    `=ROUND($B$${fA}+$B$${fB}+$B$${fC}+$B$${fD}-${T(filaVariacion)};0)`)

  return { filas, titulo: fTit, formatos: { moneda: [fA, fB, fC, fD], control: [fCtrl] } }
}
