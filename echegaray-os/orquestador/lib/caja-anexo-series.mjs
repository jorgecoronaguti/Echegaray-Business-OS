// LAS SERIES QUE ALIMENTAN LOS GRÁFICOS DE CAJA — DATOS AUXILIARES, EN EL ANEXO, NUNCA PEGADOS.
//
// ═══ POR QUÉ ESTÁN ACÁ Y NO EN CAJA (05/08/2026) ═══
//
// Un gráfico de Sheets no puede leer una fórmula: lee un RANGO. Para dibujar el saldo diario de los
// últimos sesenta días hacen falta sesenta celdas con sesenta fechas y sesenta importes. Eso es una
// matriz, y el dueño fue explícito sobre la portada: *"en CAJA no queda ni una tabla larga ni una
// matriz ni texto técnico"*. Así que la matriz vive en `_CAJA_ANEXO` —que es exactamente para lo que
// existe el anexo— y los gráficos, que flotan sobre CAJA, la leen desde ahí.
//
// ═══ Y POR QUÉ CADA CELDA ES UNA FÓRMULA SOBRE EL LIBRO ═══
//
// La tentación evidente era calcular las series en JavaScript y pegar 120 números. Sería más rápido y
// estaría mal por la regla de oro número 5: un número pegado sólo cambia cuando corre el agente, y
// este archivo tiene un timer que ya estuvo detenido semanas. Un gráfico alimentado por valores
// pegados dibuja con precisión la caja de hace diez días.
//
// Cada punto es un `terminoLibro` sobre `_MOVIMIENTOS` —la misma fuente de la que cuelgan las
// tarjetas, la escalera y los dos cash flow—, así que el gráfico y la tabla no pueden discrepar: no
// hay dos cálculos, hay uno.
//
// ═══ CÓMO SE RECONSTRUYE EL PASADO SIN GUARDAR UN HISTÓRICO ═══
//
// No existe una tabla de saldos diarios y no hace falta: el saldo al cierre del día `d` es el saldo de
// HOY menos todo lo REAL que se movió después de `d`. Cada fila es independiente —no es una cadena—
// así que una fila rota no arrastra a las demás, que es lo que pasa con un saldo corrido.
//
// LA PROYECCIÓN ES LA MISMA CUENTA HACIA ADELANTE y con los estados dados vuelta: suma lo que
// TODAVÍA NO pasó por el banco (`COMPROMETIDO`, `PROYECTADO`, `VENCIDO`). `REAL` queda afuera de la
// proyección y es lo único que entra en la historia: sin esa simetría, el día de hoy —donde las dos
// curvas se tocan— contaría dos veces la misma plata.

// ═══ Y LA SERIE DEL AÑO: INGRESOS CONTRA EGRESOS, MES A MES (06/08/2026) ═══
//
// Orden del dueño: el gráfico de la evolución de la caja se reemplaza por uno que muestre EN TODO EL
// AÑO lo que entra contra lo que sale, para poder ver el PUNTO DE EQUILIBRIO. Es la única lectura de
// la pestaña que no habla de saldo sino de CAUDAL: un saldo alto con egresos que le pasan por arriba
// todos los meses es una empresa que se está comiendo la caja, y eso una curva de saldo no lo dice.
//
// Doce filas, dos importes por fila, todo por `terminoLibro` sobre el mismo libro que el resto.

import { terminoLibro, LIBRO } from './libro-sumas.mjs'
import { DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { NO_REAL } from './caja-tarjetas.mjs'

/** Cuántos días mira cada curva. El dueño pidió 60 y 60: dos meses a cada lado del día de hoy. */
export const DIAS_HISTORIA = 60
export const DIAS_PROYECCION = 60
/** Los doce meses del año en curso: el gráfico del punto de equilibrio mira el año ENTERO. */
export const MESES = 12
/** Cuántas contrapartes entran en cada gráfico de concentración. Cinco: la sexta ya no se lee. */
export const TOP_N = 5
/** La ventana de los dos gráficos de concentración, en días. */
export const DIAS_TOP = 30
/** La ventana del gráfico de necesidad diaria. El dueño la pidió a 30 días, día por día. */
export const DIAS_NECESIDAD = 30

/**
 * ═══ LOS CINCO BALDES DE LA SALIDA (20/08/2026) ═══
 *
 * El dueño: *"que el gráfico me indique los rubros o lo que me va a ir haciendo descargos de dinero,
 * es decir, cheques, proveedores, sueldos, cargas sociales, impuestos"*. Son cinco baldes y tienen
 * que ser MUTUAMENTE EXCLUYENTES: si una fila cae en dos, el total del día miente hacia arriba y el
 * gráfico dice que hace falta plata que no hace falta.
 *
 * Por eso «Proveedores» NO tiene lista propia: es el RESTO —todos los egresos menos los otros
 * cuatro—. Así ningún rubro queda afuera del gráfico por no haberlo enumerado, que es como se pierde
 * un vencimiento. Y si algún día un sueldo se pagara con cheque, el resto daría negativo y se vería:
 * un balde que se solapa tiene que gritar, no esconderse.
 */
export const BALDES = Object.freeze({
  sueldos: Object.freeze(['Nómina · Jornales de obra', 'Nómina · Sueldos administración']),
  cargas: Object.freeze(['Nómina · Cargas sociales', 'Nómina · Gremiales', 'Deuda previsional (planes de pago)']),
  impuestos: Object.freeze(['Impuestos']),
  /** Cheques se define por INSTRUMENTO, no por rubro: un cheque a un corralón sigue siendo un cheque. */
  cheques: Object.freeze(['cheque', 'echeq']),
})

/**
 * LOS RÓTULOS SON EL CONTRATO. `caja-pestana.mjs` no sabe en qué fila del anexo quedó cada serie:
 * lee la columna A y las ubica POR ESTE TEXTO. Es la misma regla que el resto del archivo —anclar en
 * la posición es lo que ya dejó dos cash flow con el saldo inicial en blanco—, y acá importa el
 * doble: un rango de gráfico mal apuntado dibuja una curva perfecta de datos equivocados.
 */
export const ROTULOS = Object.freeze({
  // EL RÓTULO DEL EQUILIBRIO NO LLEVA EL AÑO, y es a propósito: las celdas dicen `YEAR(TODAY())`, así
  // que la serie cambia sola de año. Un rótulo con "2026" adentro sería el único pedazo del bloque que
  // se congela — y como la ubicación es POR TEXTO EXACTO, el 1° de enero dejaría de encontrarse.
  equilibrio: 'Concepto · ingresos vs egresos por mes, año en curso',
  historia: `Concepto · saldo real, últimos ${DIAS_HISTORIA} días`,
  proyeccion: `Concepto · saldo proyectado, próximos ${DIAS_PROYECCION} días`,
  pagos: `Concepto · pagos, top contrapartes a ${DIAS_TOP} días`,
  cobranzas: `Concepto · cobranzas, top contrapartes a ${DIAS_TOP} días`,
  necesidad: `Concepto · necesidad diaria por rubro vs cobranzas, próximos ${DIAS_NECESIDAD} días`,
})

/** Cuántas filas de datos tiene cada serie, para poder ubicarlas sin volver a leer nada. */
export const LARGO = Object.freeze({
  equilibrio: MESES, historia: DIAS_HISTORIA, proyeccion: DIAS_PROYECCION, pagos: TOP_N, cobranzas: TOP_N,
  necesidad: DIAS_NECESIDAD,
})

/**
 * Las columnas del anexo que usan los gráficos. La F ya está formateada como fecha y la C como plata.
 *
 * `egreso` es la D — la segunda columna de plata del anexo— y existe porque el gráfico del equilibrio
 * es el único con DOS series: necesita dos columnas de importe una al lado de la otra para que el
 * bloque se lea como la tabla que es (mes · entra · sale).
 */
export const COL = Object.freeze({ rotulo: 1, importe: 3, egreso: 4, fecha: 6 }) // 1-based, como los pide la API

/** Un desplazamiento de días desde hoy, escrito como lo escribiría una persona. */
const dia = (n) => (n === 0 ? 'TODAY()' : n > 0 ? `TODAY()+${n}` : `TODAY()-${-n}`)

/**
 * NÚCLEO PURO: el saldo al cierre del día `d`, reconstruido desde la posición de hoy.
 *
 * `d` se expresa en días respecto de hoy (negativo = pasado). La ventana que se resta arranca en el
 * día SIGUIENTE a `d` —lo que pasó el mismo día `d` ya está adentro de su saldo de cierre— y termina
 * mañana, para incluir todo lo de hoy. Con `d = 0` la ventana queda vacía y el punto vale exactamente
 * el total de CAJA: las dos curvas se tocan en el día de hoy sin un salto que habría que explicar.
 */
export const saldoHistorico = (d) =>
  `=${DESDE_CAJA.total}-${terminoLibro({ desde: dia(d + 1), hasta: dia(1), estados: ['REAL'] })}`

/**
 * El primer día del mes `m` del AÑO EN CURSO. `m = 13` devuelve el 1° de enero del año siguiente, que
 * es exactamente el cierre exclusivo que necesita diciembre: `DATE` normaliza el mes que se pasa de 12.
 *
 * Va con `YEAR(TODAY())` y no con el año escrito: el timer de este archivo ya estuvo detenido semanas,
 * y un "2026" pegado convierte el gráfico del año en el gráfico del año pasado sin dar un solo error.
 */
const mes1 = (m) => `DATE(YEAR(TODAY());${m};1)`

/**
 * NÚCLEO PURO: lo que ENTRA y lo que SALE en el mes `m` (1..12), todo el año, todos los estados.
 *
 * ═══ POR QUÉ TODOS LOS ESTADOS Y NO SÓLO LO REAL ═══
 *
 * El punto de equilibrio se busca sobre el AÑO, y el año todavía no pasó: con sólo `REAL` los meses
 * futuros valdrían cero y el cruce se leería donde no está. Entra lo cobrado y lo esperado
 * (`COMPROMETIDO`, `PROYECTADO`, `VENCIDO`), que es cómo se decide un plazo con meses de anticipación.
 *
 * ═══ Y POR QUÉ LOS DOS EN MAGNITUD ═══
 *
 * El egreso vive en el libro con signo −1: en `neto` se dibujaría abajo del cero y las dos curvas
 * jamás se tocarían — que es justo lo que este gráfico tiene que mostrar. En magnitud las dos suben
 * desde cero y el cruce es el punto de equilibrio, visible sin leer un número.
 */
export const ingresosDelMes = (m) =>
  `=${terminoLibro({ desde: mes1(m), hasta: mes1(m + 1), signo: 1, medida: 'magnitud' })}`
export const egresosDelMes = (m) =>
  `=${terminoLibro({ desde: mes1(m), hasta: mes1(m + 1), signo: -1, medida: 'magnitud' })}`

/** NÚCLEO PURO: el saldo proyectado al día `d` (positivo = futuro), sumando lo que todavía no pasó. */
export const saldoProyectado = (d) =>
  `=${DESDE_CAJA.total}+${terminoLibro({ desde: 'TODAY()', hasta: dia(d + 1), estados: NO_REAL })}`

/**
 * NÚCLEO PURO: el top de contrapartes por signo, con SORTN/QUERY sobre el libro y NUNCA con valores
 * pegados.
 *
 * ═══ POR QUÉ QUERY Y NO UNA COLUMNA AUXILIAR CON SUMIF ═══
 *
 * Agrupar por contraparte necesita primero la lista de contrapartes ÚNICAS, y esa lista cambia sola:
 * una columna auxiliar con nombres pegados es un ranking que se congela el día que aparece un
 * proveedor nuevo. `QUERY` agrupa y ordena en la misma expresión, así que no hay nada que mantener.
 *
 * ═══ LAS FECHAS VIAJAN COMO TEXTO ISO, Y ES OBLIGATORIO ═══
 *
 * El lenguaje de QUERY no entiende `TODAY()`: pide un literal `date 'aaaa-mm-dd'`. Se arma con
 * `TEXT(TODAY();"yyyy-mm-dd")` —no con el formato dd/mm del archivo— porque el que lee ese literal es
 * el motor de QUERY, que es siempre en inglés, y no el locale es-AR de la planilla.
 *
 * NO DERRAMA: se pide `INDEX(...;k;col)`, una celda por vez. Un QUERY que derrama sobre las celdas de
 * abajo es incontrolable para un generador que reescribe la pestaña entera.
 *
 * @param {1|-1} signo entra (1) o sale (−1)
 * @param {number} k la posición del ranking, 1-based
 * @param {1|2} col 1 = el nombre de la contraparte, 2 = el importe
 */
/**
 * NÚCLEO PURO: cuánta plata sale de UN balde el día `d`, y cuánta entra por cobranzas.
 *
 * Todo en `magnitud`: el gráfico apila salidas, y apilar números negativos dibuja las barras para
 * abajo y hace ilegible el cruce con la cobranza, que es exactamente lo que hay que mirar.
 *
 * La ventana es de un día: `desde` el día y `hasta` el siguiente. No se filtra por estado —lo REAL
 * de hoy también hay que pagarlo— salvo en el resto, donde se restan los otros cuatro sobre la misma
 * ventana para que el balde de proveedores no pueda contar dos veces.
 */
export function necesidadDelDia(d, balde) {
  const ventana = { desde: dia(d), hasta: dia(d + 1), medida: 'magnitud' }
  const salida = (extra) => terminoLibro({ ...ventana, signo: -1, ...extra })
  if (balde === 'cobranzas') return `=${terminoLibro({ ...ventana, signo: 1 })}`
  if (balde === 'cheques') return `=${salida({ instrumentos: [...BALDES.cheques] })}`
  if (balde === 'sueldos') return `=${salida({ rubros: [...BALDES.sueldos] })}`
  if (balde === 'cargas') return `=${salida({ rubros: [...BALDES.cargas] })}`
  if (balde === 'impuestos') return `=${salida({ rubros: [...BALDES.impuestos] })}`
  // PROVEEDORES ES EL RESTO. Ver `BALDES`: enumerarlo sería dejar afuera el rubro que nadie listó.
  const otros = [
    salida({ instrumentos: [...BALDES.cheques] }),
    salida({ rubros: [...BALDES.sueldos] }),
    salida({ rubros: [...BALDES.cargas] }),
    salida({ rubros: [...BALDES.impuestos] }),
  ]
  return `=${salida()}-${otros.join('-')}`
}

export function topContraparte(signo, k, col) {
  const c = LIBRO.col
  const q = `select ${c.contraparte}, sum(${c.importe}) `
    + `where ${c.signo} = ${signo} and ${c.estado} <> 'REAL' and ${c.contraparte} <> '' `
    // ═══ LA FECHA DEL LIBRO ES UN NÚMERO DE SERIE, NO UNA FECHA (20/08/2026) ═══
    //
    // La columna A de `_MOVIMIENTOS` guarda el serial (46254), no un valor de tipo fecha. El filtro
    // decía `A >= date '2026-08-20'` y QUERY compara un número contra una fecha: no matcheaba NADA.
    // Con 56 filas que cumplían el resto de las condiciones, los dos gráficos salían vacíos.
    + `and ${c.fecha} >= "&TEXT(TODAY();"0")&" `
    + `and ${c.fecha} < "&TEXT(TODAY()+${DIAS_TOP};"0")&" `
    + `group by ${c.contraparte} order by sum(${c.importe}) desc limit ${TOP_N}`
  // ═══ EL +1 NO ES UN AJUSTE FINO: SIN ÉL EL GRÁFICO SALE VACÍO (20/08/2026) ═══
  //
  // `QUERY` con `group by` antepone SIEMPRE una fila de encabezado —«sum Importe»— aunque se le pase
  // 0 en el argumento de headers: ese 0 describe la ENTRADA, no la salida. Con `INDEX(…;1;2)` la
  // primera fila leída era ese rótulo, así que el anexo publicaba el texto "sum " donde tenía que ir
  // el primer importe, y los dos gráficos de CAJA quedaban sin datos sin que nada dijera por qué.
  return `=IFERROR(INDEX(QUERY(${LIBRO.pestana}!$A$${LIBRO.fila0}:$P;"${q}";0);${k + 1};${col});"")`
}

/**
 * EL BLOQUE DEL ANEXO. Recibe el constructor de grilla del anexo (`h.push` devuelve la fila real).
 *
 * @param {{push:Function}} h
 * @returns {{fEq0:number,fEq1:number,fHist0:number,fHist1:number,fProy0:number,fProy1:number,fPag0:number,fPag1:number,fCob0:number,fCob1:number}}
 */
export function bloqueSeries(h) {
  const { push } = h
  push([`A10 · SERIES DE LOS GRÁFICOS DE CAJA — LAS CALCULA \`${LIBRO.pestana}\`, NO SE PEGAN`])

  // LOS ENCABEZADOS DE ESTA FILA SON LOS NOMBRES DE LAS DOS SERIES DEL GRÁFICO. El rango que dibuja
  // arranca acá (con `headerCount: 1`), así que "Ingresos" y "Egresos" son lo que dice la leyenda:
  // sin ellos Sheets rotula "Series 1" y "Series 2", y un gráfico de dos curvas sin leyenda no se lee.
  push([ROTULOS.equilibrio, '', 'Ingresos', 'Egresos', '', 'Mes',
    'Todo el año, todos los estados: lo que ya entró y lo que se espera'])
  const fEq0 = h.n + 1
  for (let m = 1; m <= MESES; m++) push(['', '', ingresosDelMes(m), egresosDelMes(m), '', `=${mes1(m)}`])
  const fEq1 = h.n

  // ═══ ESTA SERIE HOY NO LA DIBUJA NINGÚN GRÁFICO ═══
  //
  // El dueño reemplazó "Evolución de la caja" por el cruce de arriba (06/08/2026). Se conserva porque
  // es la única reconstrucción del pasado que tiene el archivo y retirarla es borrar un dato que nadie
  // pidió borrar; el costo de tenerla son sesenta fórmulas. Si sigue sin consumidor, se retira — pero
  // esa decisión es del dueño, no del que vino a cambiar un gráfico.
  push([ROTULOS.historia, '', 'Saldo', '', '', 'Día', 'Saldo de hoy menos lo REAL posterior a ese día'])
  const fHist0 = h.n + 1
  // De más viejo a más nuevo: un eje temporal que va para atrás se lee mal y Sheets lo dibuja igual.
  for (let i = DIAS_HISTORIA - 1; i >= 0; i--) push(['', '', saldoHistorico(-i), '', '', `=${dia(-i)}`])
  const fHist1 = h.n

  push([ROTULOS.proyeccion, '', 'Saldo', '', '', 'Día', 'Saldo de hoy más lo comprometido/proyectado hasta ese día'])
  const fProy0 = h.n + 1
  for (let i = 1; i <= DIAS_PROYECCION; i++) push(['', '', saldoProyectado(i), '', '', `=${dia(i)}`])
  const fProy1 = h.n

  push([ROTULOS.pagos, '', 'A pagar', '', '', '', `Top ${TOP_N} por contraparte, próximos ${DIAS_TOP} días`])
  const fPag0 = h.n + 1
  for (let k = 1; k <= TOP_N; k++) push([topContraparte(-1, k, 1), '', topContraparte(-1, k, 2)])
  const fPag1 = h.n

  push([ROTULOS.cobranzas, '', 'A cobrar', '', '', '', `Top ${TOP_N} por contraparte, próximos ${DIAS_TOP} días`])
  const fCob0 = h.n + 1
  for (let k = 1; k <= TOP_N; k++) push([topContraparte(1, k, 1), '', topContraparte(1, k, 2)])
  const fCob1 = h.n

  // ═══ LA NECESIDAD DIARIA (20/08/2026) ═══
  //
  // Seis columnas contiguas porque el gráfico las apila en ese orden: cinco baldes de salida y, por
  // encima, la cobranza del día como línea. La pregunta que contesta es una sola y es la que el dueño
  // hizo: *"¿cubrimos día a día esa necesidad?"*. Un total mensual no la contesta — la plata no falta
  // en el mes, falta el martes.
  // ═══ ESTA SERIE VIVE EN LA H Y SIGUIENTES, DETRÁS DE LA COLUMNA DE PROSA ═══
  //
  // Las columnas B a G ya tienen dueño y formato: la F es FECHA para las otras series y la G es la
  // nota. Poner «Cargas sociales» en la F dibujaba seis millones de pesos como «30/12/1899», y correr
  // la prosa dejaba los contadores del anexo sin formato de número. Las siete columnas de este bloque
  // arrancan después de todo eso.
  push([ROTULOS.necesidad, '', '', '', '', '',
    `Salidas apiladas por rubro contra lo que entra, próximos ${DIAS_NECESIDAD} días`,
    'Día', 'Cheques', 'Proveedores', 'Sueldos', 'Cargas sociales', 'Impuestos', 'Cobranzas'])
  const fNec0 = h.n + 1
  for (let i = 0; i < DIAS_NECESIDAD; i++) {
    // LA FECHA VA EN LA B, DEBAJO DE SU PROPIO ENCABEZADO. En la A va el rótulo del bloque —así lo
    // ubica `ubicarSeries`— y las filas de datos la dejan vacía, igual que historia y proyección.
    push(['', '', '', '', '', '', '', `=${dia(i)}`,
      necesidadDelDia(i, 'cheques'), necesidadDelDia(i, 'proveedores'), necesidadDelDia(i, 'sueldos'),
      necesidadDelDia(i, 'cargas'), necesidadDelDia(i, 'impuestos'), necesidadDelDia(i, 'cobranzas')])
  }
  const fNec1 = h.n

  return { fEq0, fEq1, fHist0, fHist1, fProy0, fProy1, fPag0, fPag1, fCob0, fCob1, fNec0, fNec1 }
}

/**
 * NÚCLEO PURO: dónde quedó cada serie dentro del anexo, buscando POR RÓTULO en su columna A.
 *
 * Devuelve `null` para la serie que no encuentre, y el que llama tiene que DECIR que no la dibuja. Un
 * gráfico que no aparece sin que nada explique por qué es el peor estado posible: no se puede
 * arreglar ni descartar. Ya pasó con este mismo módulo.
 *
 * @param {Array<Array<any>>} colA los valores de la columna A del anexo, desde la fila 1
 * @returns {{equilibrio:{f0:number,f1:number}|null, historia:…, proyeccion:…, pagos:…, cobranzas:…}}
 */
export function ubicarSeries(colA = []) {
  const buscar = (rotulo, largo, { conDatos = false } = {}) => {
    const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
    // El encabezado tiene que existir Y tener sus filas debajo: media serie dibuja media verdad.
    if (i < 0 || colA.length < i + 1 + largo) return null
    // Y en los rankings, las filas tienen que tener ALGO. Las fórmulas de top-contraparte devuelven
    // "" cuando no hay contrapartes en la ventana: la fila existe, el dato no, y el gráfico salía
    // dibujado vacío ("el gráfico que no tiene nada" — el dueño lo mandó borrar el 07/08). Sólo
    // aplica a los rankings, cuyo dominio ES la columna A; en historia/proyección/equilibrio la
    // columna A viene vacía por diseño y este control las mataría.
    if (conDatos && !colA.slice(i + 1, i + 1 + largo).some((f) => String(f?.[0] ?? '').trim() !== '')) return null
    return { f0: i + 2, f1: i + 1 + largo }
  }
  return {
    equilibrio: buscar(ROTULOS.equilibrio, LARGO.equilibrio),
    historia: buscar(ROTULOS.historia, LARGO.historia),
    proyeccion: buscar(ROTULOS.proyeccion, LARGO.proyeccion),
    pagos: buscar(ROTULOS.pagos, LARGO.pagos, { conDatos: true }),
    cobranzas: buscar(ROTULOS.cobranzas, LARGO.cobranzas, { conDatos: true }),
    // La necesidad NO lleva `conDatos`: su columna A son fechas, siempre llenas, y un día sin
    // vencimientos es información —ese día no hace falta plata—, no una serie vacía.
    necesidad: buscar(ROTULOS.necesidad, LARGO.necesidad),
  }
}
