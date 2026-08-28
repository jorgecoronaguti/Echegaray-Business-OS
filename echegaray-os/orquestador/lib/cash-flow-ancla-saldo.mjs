// DÓNDE ENGANCHA EL SALDO REAL DE CAJA, Y CÓMO ENCADENA DE AHÍ EN ADELANTE.
//
// POR QUÉ EXISTE (04/08/2026). El dueño: "tenés que repasar todo cobranzas e ir viendo el tema de
// caja a fin de cada semana y mes". Al verificar la identidad
//
//     caja al inicio + ingresos − egresos = caja al cierre        (dentro de un período)
//     caja al cierre del período = caja al inicio del siguiente   (entre períodos)
//
// contra las dos pestañas reales, la primera cerró en las dos y la segunda se rompió en el semanal:
// las CINCO semanas de agosto arrancaban con el MISMO saldo, $115.548.463. Cuatro eslabones perdidos.
//
// LA CAUSA ERA UN CRITERIO MENSUAL APLICADO A UN CUADRO SEMANAL. El ancla se escribía así, igual en
// las dos pestañas:
//
//     IF(EOMONTH(col;0) < EOMONTH(CAJA_FECHA_SALDO;0) ; "" ;
//        IF(EOMONTH(col;0) = EOMONTH(CAJA_FECHA_SALDO;0) ; N(CAJA_TOTAL_DISPONIBLE) ; anterior))
//
// En la mensual `EOMONTH(col;0)` identifica la columna, porque hay una columna por mes. En la semanal
// hay CINCO columnas dentro del mismo mes, así que las cinco daban "es el mes del saldo" y las cinco
// se pegaban al saldo declarado en vez de encadenar. Efecto medido sobre el archivo real: el cierre
// del 31/08 mostraba $147.965.511 cuando la cadena da $232.113.539 — $84.148.028 de diferencia, que
// se arrastra a las diecisiete semanas siguientes porque septiembre engancha de ahí.
//
// LA CORRECCIÓN ES LA DEFINICIÓN, NO UN PARCHE: el período que ancla es EL QUE CONTIENE la fecha del
// saldo, y "contener" se decide con la misma ventana [desde, hasta) con la que cada columna suma sus
// movimientos. Un cuadro trimestral o quincenal futuro no vuelve a caer en esto.
//
// NO ESCRIBE NADA. Devuelve la expresión y el modelo; quien escribe es scripts/cash-flow-rehacer.mjs.

/** Los tres papeles que puede cumplir una columna frente al saldo declarado. */
export const ROL = {
  /** Termina antes de la fecha del saldo: no hay con qué reconstruirlo hacia atrás. Va vacío. */
  ANTES: 'antes',
  /** Contiene la fecha del saldo: arranca con el saldo real. Es el único ancla. */
  ANCLA: 'ancla',
  /** Posterior: arranca donde cerró el anterior. */
  ENCADENA: 'encadena',
}

const dia = (d) => Math.floor(new Date(d).getTime() / 86400000)

/**
 * NÚCLEO PURO: qué papel cumple una columna, dada su ventana y la fecha del saldo.
 *
 * La ventana es SEMIABIERTA [desde, hasta) — la misma con la que la columna suma sus movimientos.
 * Por eso un saldo fechado justo en `hasta` NO pertenece a esta columna sino a la siguiente: si
 * perteneciera a las dos, un movimiento de ese día se contaría dos veces.
 *
 * @param {Date|string|number} desde primer día del período (inclusive)
 * @param {Date|string|number} hasta primer día del período siguiente (excluyente)
 * @param {Date|string|number} fechaSaldo fecha a la que está declarado el saldo real de CAJA
 * @returns {'antes'|'ancla'|'encadena'}
 */
export function rolDelPeriodo(desde, hasta, fechaSaldo) {
  const s = dia(fechaSaldo)
  if (dia(hasta) <= s) return ROL.ANTES
  if (dia(desde) <= s) return ROL.ANCLA
  return ROL.ENCADENA
}

/**
 * NÚCLEO PURO: los roles de una grilla entera.
 *
 * EL INVARIANTE QUE SE PRUEBA: hay EXACTAMENTE UN ancla mientras la fecha del saldo caiga dentro de
 * la grilla. Con el criterio viejo la semanal tenía cinco, y cinco anclas es cuatro eslabones que no
 * existen.
 *
 * @param {Array<Date>} inicios encabezados de las columnas, en orden
 * @param {Date|string|number} fechaSaldo
 * @param {(i:number)=>Date} finDe fin excluyente del período i (el inicio del siguiente)
 */
export function rolesDeLaGrilla(inicios = [], fechaSaldo, finDe) {
  return inicios.map((d, i) => rolDelPeriodo(d, finDe(i), fechaSaldo))
}

/**
 * NÚCLEO PURO: la expresión de "Efectivo y equivalentes al inicio del período" de UNA columna.
 *
 * Es la traducción literal de `rolDelPeriodo` a fórmula de Sheets, con `;` de separador porque el
 * archivo está en locale es_AR (ver memoria: "Fórmula por API va en locale").
 *
 * ═══ LOS PERÍODOS ANTERIORES AL CORTE: DE VACÍOS A RECONSTRUIDOS (28/08/2026) ═══
 *
 * Iban vacíos, y con razón declarada: "no hay con qué reconstruirlo hacia atrás". Sí lo hay, y es la
 * misma identidad que la cadena usa hacia adelante, leída al revés:
 *
 *     inicio(mes) = inicio(mes+1) − resultado(mes)
 *
 * porque cierre(mes) = inicio(mes+1) por definición de la cadena. No entra un dato nuevo: se despeja
 * la MISMA aritmética que ya publica el cuadro, encadenada desde el único mes con ancla. Verificable
 * al peso — reconstruida a mano sobre el archivo real, la cadena hacia atrás desde agosto da
 * $50.630.171 al 1/1/2026 y $50.630.171 + $19.535.570 (ene→jul) = $70.165.741, exactamente el inicio
 * de agosto que el cuadro publica.
 *
 * ⚠ LÍMITE, Y ES EL QUE HAY QUE LEER ANTES DE CREERLE AL NÚMERO. Esto es un CÁLCULO, no un hecho: el
 * saldo de enero no está registrado en ningún lado, se despeja. Si al libro de movimientos le falta
 * un movimiento de marzo, el error NO se reparte: se absorbe entero en los saldos anteriores a marzo,
 * y enero queda con la diferencia acumulada de todo el año adentro. Por eso el mes ANCLA sigue siendo
 * el único saldo verificable contra el banco, y por eso la pestaña lo DICE en su subtítulo en vez de
 * dejar que el lector suponga que enero se leyó de algún lado.
 *
 * POR QUÉ SE ENGANCHA AL INICIO DEL MES SIGUIENTE Y NO AL CIERRE DEL PROPIO MES. Son el mismo número,
 * pero `cierre(mes) = inicio(mes) + resultado(mes)` ya existe: si `inicio(mes)` leyera `cierre(mes)`,
 * las dos celdas se referenciarían mutuamente. Google Sheets detecta la circularidad por el GRAFO de
 * referencias, no por la rama que se evalúa, así que las dos filas darían #REF! aunque los `IF`
 * nunca tomaran los dos caminos a la vez. Apuntando al inicio del mes siguiente la cadena queda
 * acíclica: inicio(ene) → inicio(feb) → … → inicio(ancla) → CAJA_TOTAL_DISPONIBLE.
 *
 * @param {object} p
 * @param {string} p.desde   expresión del primer día del período (normalmente `B$3`)
 * @param {string} p.hasta   expresión del primer día del siguiente (`B$3+7` o `EOMONTH(B$3;0)+1`)
 * @param {string} p.refSaldo   celda/rango con nombre del saldo real (`CAJA_TOTAL_DISPONIBLE`)
 * @param {string} p.refFecha   celda/rango con nombre de su fecha (`CAJA_FECHA_SALDO`)
 * @param {string|null} p.anterior celda del cierre del período anterior, o null en la primera columna
 * @param {string|null} [p.siguiente] celda del INICIO del período siguiente. Con ella (y con
 *   `resultadoDelPeriodo`) los períodos anteriores al corte se reconstruyen hacia atrás; sin ella
 *   van vacíos, que es el comportamiento histórico y el que conserva el semanal —que arranca en la
 *   semana corriente y no tiene columnas anteriores al corte.
 * @param {string|null} [p.resultadoDelPeriodo] celda del resultado (entra − sale) del propio período.
 * @param {string} [p.yaVividoEnElAncla] expresión de lo que YA se movió dentro del período ancla antes
 *   de la fecha del saldo. Se RESTA sólo en ese período y por una razón aritmética: el saldo declarado
 *   está fechado en el MEDIO del período, así que si el período arranca con ese saldo y después suma
 *   todos sus movimientos, los que ocurrieron entre el inicio y el corte se cuentan dos veces. En un
 *   cuadro semanal la distorsión es de días; en uno mensual, de hasta un mes entero de movimientos.
 *   Vacío (default) = comportamiento histórico, para no cambiar en silencio los cuadros que ya lo usan.
 */
export function expresionInicio({
  desde, hasta, refSaldo, refFecha,
  anterior = null, siguiente = null, resultadoDelPeriodo = null, yaVividoEnElAncla = '',
}) {
  // El vacío de la primera columna se escribe como "" y no como la celda de la izquierda: a la
  // izquierda de la primera columna está el rótulo, y N("Efectivo…") daría 0 sin avisar.
  const encadena = anterior ? `IF(N(${anterior})=0;"";${anterior})` : '""'
  const ancla = yaVividoEnElAncla ? `N(${refSaldo})-(${yaVividoEnElAncla})` : `N(${refSaldo})`
  // El último período de la grilla no tiene "siguiente": si además cayera antes del corte —un ancla
  // fuera del ejercicio— no hay de dónde despejar nada y va vacío. El vacío se propaga solo hacia la
  // izquierda, porque `N("")` es 0 y la guarda lo convierte otra vez en "".
  const antes = siguiente && resultadoDelPeriodo
    ? `IF(N(${siguiente})=0;"";N(${siguiente})-N(${resultadoDelPeriodo}))`
    : '""'
  return `=IF(${hasta}<=${refFecha};${antes};IF(${desde}<=${refFecha};${ancla};${encadena}))`
}

/**
 * NÚCLEO PURO: el ancla de una grilla que ARRANCA EN EL PRESENTE — la primera columna del semanal.
 *
 * POR QUÉ HACE FALTA OTRA (06/08/2026). `expresionInicio` decide entre tres papeles porque el cuadro
 * mensual arranca en enero y puede tener columnas ANTERIORES al saldo declarado, que no se pueden
 * reconstruir. El semanal rehecho arranca en la semana corriente: no hay columnas anteriores, y la
 * única pregunta es dónde cae el corte respecto del lunes. Las dos respuestas son aritmética pura:
 *
 *   corte DENTRO de la semana  → el saldo declarado ya trae los movimientos del lunes al corte:
 *                                 se RESTAN, o se cuentan dos veces cuando la columna sume su ventana.
 *   corte ANTES del lunes      → al saldo declarado le faltan los movimientos del corte al lunes:
 *                                 se SUMAN.
 *
 * Y no hace falta un IF para elegir: cada término es una ventana que queda VACÍA en el otro caso
 * —[lunes, corte+1) es imposible si el corte es anterior al lunes, y [corte+1, lunes) lo es si el
 * corte cae dentro—, así que el que no corresponde vale cero. Una sola expresión, sin rama muerta.
 *
 * LA SEMÁNTICA DEL ANCLA NO CAMBIA: cuando el corte cae dentro del período, esto da exactamente
 * `total − REAL(desde el inicio del período hasta el corte)`, que es lo que devuelve `expresionInicio`
 * y lo que el control A5 del anexo de CAJA verifica. Sólo lo REAL: un proyectado vencido que nadie
 * concilió no es plata en la cuenta.
 *
 * @param {object} p
 * @param {string} p.desde expresión del primer día del período (la celda del encabezado)
 * @param {string} p.refSaldo rango con nombre del saldo declarado
 * @param {string} p.refFecha rango con nombre de su fecha de corte
 * @param {string} p.yaVivido expresión de lo REAL en [desde, corte+1) — se resta
 * @param {string} p.puestaAlDia expresión de lo REAL en [corte+1, desde) — se suma
 */
export function expresionInicioCorrido({ refSaldo, yaVivido, puestaAlDia }) {
  return `=N(${refSaldo})-(${yaVivido})+(${puestaAlDia})`
}

/**
 * NÚCLEO PURO: la cadena de saldos que DEBERÍA mostrar el cuadro.
 *
 * Existe para poder verificar la pestaña contra algo que no salga de la pestaña: reconstruye inicio
 * y cierre desde los netos y el saldo declarado. Un control validado contra su propia fuente no es
 * un control.
 *
 * ═══ LOS PERÍODOS ANTERIORES AL ANCLA SE DESPEJAN HACIA ATRÁS (28/08/2026) ═══
 *
 * Con `inicio(p) = inicio(p+1) − neto(p)`, encadenado desde el ancla hacia la izquierda. Cada uno de
 * esos períodos sale marcado `calculado: true`, y esa marca NO es decorativa: es la diferencia entre
 * un saldo que se puede contrastar contra el banco y uno que se dedujo de que el libro esté completo.
 * Si al libro le falta un movimiento, el faltante no se reparte — se absorbe entero en los saldos
 * calculados que quedan a la izquierda de ese movimiento.
 *
 * @param {Array<{desde:Date, hasta:Date, neto:number}>} periodos
 * @param {{saldo:number, fecha:Date|string|number}} ancla
 * @param {{reconstruirHaciaAtras?:boolean}} [opciones]
 * @returns {Array<{desde:Date, rol:string, inicio:number|null, cierre:number|null, calculado:boolean}>}
 */
export function cadenaEsperada(periodos = [], ancla, { reconstruirHaciaAtras = true } = {}) {
  const out = []
  let anterior = null
  for (const p of periodos) {
    const rol = rolDelPeriodo(p.desde, p.hasta, ancla.fecha)
    if (rol === ROL.ANTES) { out.push({ desde: p.desde, rol, inicio: null, cierre: null, calculado: false }); continue }
    const inicio = rol === ROL.ANCLA ? Number(ancla.saldo) : anterior
    // Un encadenado sin cierre anterior no puede inventarse un inicio: se declara nulo y se ve.
    if (inicio === null || inicio === undefined) { out.push({ desde: p.desde, rol, inicio: null, cierre: null, calculado: false }); continue }
    const cierre = inicio + Number(p.neto || 0)
    out.push({ desde: p.desde, rol, inicio, cierre, calculado: false })
    anterior = cierre
  }
  if (!reconstruirHaciaAtras) return out
  // De derecha a izquierda, y arrancando en el ANTEÚLTIMO: el último período de la grilla no tiene
  // "siguiente" del que despejar. Si el ancla cae fuera de la grilla, ninguno tiene inicio y el
  // barrido no escribe nada — no se inventa una cadena donde no hay de dónde.
  for (let i = out.length - 2; i >= 0; i--) {
    if (out[i].rol !== ROL.ANTES || out[i].inicio !== null) continue
    const cierre = out[i + 1].inicio
    if (cierre === null || cierre === undefined) continue
    out[i] = { ...out[i], inicio: cierre - Number(periodos[i].neto || 0), cierre, calculado: true }
  }
  return out
}

/**
 * NÚCLEO PURO: auditoría de lo que la pestaña MUESTRA, sin recalcular nada.
 *
 * Dos controles distintos, que fallan por motivos distintos y por eso se informan separados:
 *   · IDENTIDAD — inicio + neto ≠ cierre dentro del mismo período (la fila de cierre miente).
 *   · ENLACE    — cierre de un período ≠ inicio del siguiente (la cadena se cortó).
 * El defecto de agosto era de ENLACE con identidad perfecta: cada columna cerraba bien consigo
 * misma. Mirar sólo la identidad lo habría dado por bueno.
 *
 * @param {Array<{periodo:string, neto:number, inicio:number|null, cierre:number|null}>} filas
 * @param {number} [tolerancia] pesos de redondeo tolerados
 */
export function verificarCadena(filas = [], tolerancia = 1) {
  const hay = (x) => x !== null && x !== undefined && Number.isFinite(Number(x))
  const identidad = [], enlace = []
  let previo = null
  for (const f of filas) {
    if (hay(f.inicio) && hay(f.cierre)) {
      const dif = Number(f.inicio) + Number(f.neto || 0) - Number(f.cierre)
      if (Math.abs(dif) >= tolerancia) identidad.push({ periodo: f.periodo, diferencia: dif })
    }
    if (previo !== null && hay(f.inicio)) {
      const dif = Number(f.inicio) - previo.cierre
      if (Math.abs(dif) >= tolerancia) enlace.push({ periodo: f.periodo, anterior: previo.periodo, diferencia: dif })
    }
    if (hay(f.cierre)) previo = { periodo: f.periodo, cierre: Number(f.cierre) }
  }
  return { identidad, enlace, cierra: identidad.length === 0 && enlace.length === 0 }
}
