// EL PERFIL DE LIQUIDEZ DEL HORIZONTE — el piso, el techo, la tendencia y los períodos que deciden.
//
// ═══ QUÉ FALTABA Y POR QUÉ IMPORTA ═══
//
// El bloque de decisión que ya existe (cash-flow-tesoreria.mjs) contesta "cuál es la peor columna y
// qué la explica". Es la mitad de la pregunta. Un tesorero decide con tres números más, y ninguno
// estaba en la pestaña:
//
//   · EL MÍNIMO DE CAJA — no el punto más bajo, sino el punto más bajo CONTRA EL COLCHÓN que la
//     empresa quiere tener. "Cierra en $8,7M" no dice nada hasta saber que un mes de estructura
//     cuesta $12M: ese cierre es un déficit de $3,3M disfrazado de superávit. La skill de tesorería
//     lo llama peak funding y es explícita: *"ese número, no la facturación ni el margen, define si
//     la obra es tomable"*. Acá se mide sobre la empresa entera, que es donde se financia.
//
//   · EL MÁXIMO — el punto más alto del horizonte y cuándo ocurre. Es el otro lado del mismo dato:
//     plata parada es costo de oportunidad, y sin saber cuánto sobra y por cuánto tiempo no se puede
//     colocar nada (es la entrada de tesoreria-inversiones-corporativas). Un cuadro que sólo mira el
//     pozo optimiza para no morir; mirando también el pico se optimiza para ganar.
//
//   · LA TENDENCIA — si la caja del horizonte va hacia arriba o hacia abajo, medida como la
//     pendiente entre la primera mitad y la segunda. Un cuadro de 53 columnas no se lee de un
//     vistazo: la dirección hay que decirla, no dejarla para que la deduzca el ojo.
//
//   · LOS EVENTOS CRÍTICOS — los períodos que hay que mirar, nombrados con su fecha: cuándo se
//     cruza el colchón por primera vez, cuándo se cruza el cero por primera vez, y cuánto dura el
//     tramo en rojo. "Hay 5 semanas en negativo" no se puede accionar; "el 9 de noviembre cruzás el
//     cero y no volvés hasta el 28 de diciembre" sí.
//
//   · LA COMPARACIÓN ENTRE PERÍODOS — el cierre de este período contra el anterior, y contra el
//     promedio del horizonte. Es lo que convierte una fila de saldos en una lectura.
//
// ═══ TODO POR FÓRMULA, SOBRE LAS MISMAS CELDAS DEL CUADRO ═══
//
// Ni un número escrito por el generador. Los cinco leen la fila "Efectivo al cierre" y la fila de
// encabezados que ya están arriba: si mañana cambia una línea del cuerpo, esto cambia con ella. Un
// indicador de riesgo con datos propios es la forma más elegante de tener dos verdades.
//
// ═══ EL COLCHÓN NO SE INVENTA: SE CALCULA DEL PROPIO CUADRO ═══
//
// La tentación era pedir un parámetro "mínimo de caja deseado" y dejarlo en una celda. Sería un
// número pegado (Regla de Oro 5) y además nadie lo mantendría. El colchón se deriva de lo que la
// empresa gasta: UN período promedio de egresos del horizonte. Es el criterio estándar de *minimum
// cash buffer* —cubrir la operación mientras se consigue el dinero— y se mueve solo cuando la
// estructura de costos se mueve.

/** Cuántos períodos de egreso promedio se quieren tener siempre en caja. */
export const COLCHON_PERIODOS = 1

/**
 * NÚCLEO PURO: el colchón, calculado UNA vez en la columna B de su fila del cuadro.
 *
 * Es el egreso promedio de un período CON MOVIMIENTO. Promediar sobre las 53 columnas metería las
 * semanas del futuro todavía sin cargar y daría un colchón artificialmente bajo — justo el sesgo que
 * hace que un mínimo de caja insuficiente parezca alcanzar.
 *
 * @param {number[]} filasEgreso filas de subtotal de cada categoría de egreso
 * @param {string} colN letra de la última columna de período
 */
export function formulaColchon(filasEgreso, colN) {
  const egresos = filasEgreso.map((f) => `$B$${f}:${colN}$${f}`).join('+')
  return `=IFERROR(${COLCHON_PERIODOS}*SUMPRODUCT((${egresos}))/MAX(1;SUMPRODUCT(--((${egresos})>0)));0)`
}

/**
 * NÚCLEO PURO: el puente del efectivo — la variación del horizonte abierta por actividad.
 *
 * POR QUÉ ES UN BLOQUE Y NO SE GRAFICA DIRECTO SOBRE LOS SUBTOTALES. Las tres filas "FLUJO NETO DE
 * …" están separadas por las actividades que las producen, y un waterfall de la API NO acepta más de
 * un `sourceRange` por eje: con las filas sueltas no hay gráfico posible. Este bloque las pone
 * contiguas REFERENCIÁNDOLAS —`=<total>` y nada más—, así que no es un segundo cálculo: es la misma
 * celda leída desde otro lugar. Si mañana cambia una línea del cuerpo, el puente cambia con ella.
 *
 * La columna B del bloque significa "el total del horizonte", igual que en los otros bloques de
 * decisión que ya viven debajo del cierre (ahí B siempre es un escalar, nunca un período).
 *
 * @param {number} fila0 · @param {string} colTotal letra de la columna del total
 * @param {Array<{fila:number,nombre:string}>} actividades subtotal de cada actividad
 */
export function bloquePuente({ fila0, colTotal, actividades }) {
  const filas = []
  const push = (a, b = '', c = '') => { filas.push([a, b, c]); return fila0 + filas.length - 1 }
  const fTit = push('EL PUENTE DEL EFECTIVO — de dónde sale y a dónde se va, en todo el horizonte')
  const primera = fila0 + filas.length
  for (const a of actividades) push(a.nombre, `=${colTotal}${a.fila}`)
  const ultima = fila0 + filas.length - 1
  return {
    filas,
    titulo: fTit,
    puente0: primera,
    puente1: ultima,
    formatos: { texto: [fTit], moneda: Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i) },
  }
}

/**
 * NÚCLEO PURO: el bloque de perfil de liquidez.
 *
 * @param {object} p
 * @param {'semanal'|'mensual'} p.periodo
 * @param {number} p.fila0 fila (1-based) donde arranca el bloque
 * @param {string} p.colN letra de la ÚLTIMA columna de período
 * @param {number} p.filaCab fila del encabezado de períodos
 * @param {number} p.filaCierre fila del efectivo al cierre
 * @param {number} p.filaVariacion fila del aumento/(disminución) neta
 * @param {number} p.filaColchon fila del cuadro donde vive el colchón (una sola definición)
 * @returns {{filas:Array<Array<string>>, titulo:number, formatos:object, fMinimo:number, fColchon:number}}
 */
export function bloqueLiquidez({ periodo, fila0, colN, filaCab, filaCierre, filaVariacion, filaColchon }) {
  const U = periodo === 'semanal' ? 'semana' : 'mes'
  const Us = periodo === 'semanal' ? 'semanas' : 'meses'
  const filas = []
  const push = (a, b = '', c = '') => { filas.push([a, b, c]); return fila0 + filas.length - 1 }
  // LA FILA QUE UNA LÍNEA VA A OCUPAR, ANTES DE OCUPARLA. Una glosa que comenta su propio número
  // —"▲ la caja mejora"— tiene que referenciar la celda de al lado, y con `const f = push(…$B$${f}…)`
  // eso es un ReferenceError de zona muerta: el argumento se evalúa antes de que exista el binding.
  // No es hipotético: reventaba `grilla()` entero y con ella 17 tests, incluidos los que no miran este
  // bloque. Un bloque de lectura nunca puede tumbar el cuadro que lee.
  const proximaFila = () => fila0 + filas.length
  const rango = (f) => `$B$${f}:${colN}$${f}`
  const cierres = rango(filaCierre)
  const fechas = rango(filaCab)
  // Un cierre VACÍO no es un cero: son los períodos anteriores al saldo cargado en CAJA, donde el
  // cuadro no puede decir con cuánta plata se arrancaba. Promediarlos como ceros hundiría todas las
  // medias del bloque. `ISNUMBER` sobre el rango los distingue y —a diferencia de `N()`— se expande
  // dentro de SUMPRODUCT, que es donde se usa.
  const hayCierre = `ISNUMBER(${cierres})`
  // El promedio de los períodos que cumplen `cond`, ignorando los que no tienen cierre. SUMPRODUCT y
  // no AVERAGE(IF(...)): en Sheets ese IF no se expande solo y devuelve el promedio de UNA celda sin
  // dar ningún error — la clase de fórmula que miente en silencio.
  const promedio = (cond) => `IFERROR(SUMPRODUCT((${hayCierre})*(${cond})*(${cierres}))/SUMPRODUCT((${hayCierre})*(${cond}));"")`

  const fTit = push(`EL PERFIL DE LIQUIDEZ — hasta dónde baja, hasta dónde sube y hacia dónde va`)

  // ── EL PISO CONTRA EL COLCHÓN ───────────────────────────────────────────────────────────────────
  // EL COLCHÓN NO SE CALCULA ACÁ: SE LEE DE LA FILA DEL CUADRO. Vive arriba, en la grilla, porque el
  // gráfico de liquidez necesita dibujarlo como una LÍNEA a lo ancho de todos los períodos y una
  // celda suelta no se puede graficar. Calcularlo dos veces —una para la tabla y otra para el
  // gráfico— es exactamente cómo se termina con dos umbrales distintos para el mismo riesgo.
  const fColchon = push(`Colchón mínimo de caja (${COLCHON_PERIODOS} ${U} de egresos promedio)`,
    `=$B$${filaColchon}`, 'Lo que cuesta operar mientras se consigue el dinero')
  const fMinimo = push(`Punto más bajo del horizonte`, `=IFERROR(MIN(${cierres});"")`)
  push(`· en qué ${U} ocurre`, `=IFERROR(INDEX(${fechas};1;MATCH(MIN(${cierres});${cierres};0));"")`)
  // ÉSTE es el número que decide: cuánto falta para el colchón en el peor momento. Positivo = sobra.
  push('⇒ Margen sobre el colchón en el peor momento', `=IFERROR($B$${fMinimo}-$B$${fColchon};"")`,
    `=IFERROR(IF($B$${fMinimo}<0;"DESCUBIERTO: falta plata, no colchón";IF($B$${fMinimo}<$B$${fColchon};"Alcanza para pagar, pero sin colchón";"Cubierto"));"")`)

  // ── EL TECHO: cuánto sobra y cuándo ─────────────────────────────────────────────────────────────
  const fMax = push('Punto más alto del horizonte', `=IFERROR(MAX(${cierres});"")`)
  push(`· en qué ${U} ocurre`, `=IFERROR(INDEX(${fechas};1;MATCH(MAX(${cierres});${cierres};0));"")`)
  // El excedente colocable es el MÍNIMO del horizonte menos el colchón, no el máximo: colocar contra
  // el pico deja a la empresa sin plata en el pozo. Es la regla de tesoreria-inversiones-corporativas
  // —"cuánto sobra DE VERDAD"— y es la diferencia entre un excedente y un descubierto caro.
  push('⇒ Excedente colocable sin tocar el colchón', `=IFERROR(MAX(0;$B$${fMinimo}-$B$${fColchon});0)`,
    'Se mide contra el PISO del horizonte, nunca contra el pico')

  // ── LA TENDENCIA ────────────────────────────────────────────────────────────────────────────────
  // Primera mitad contra segunda mitad de los períodos CON cierre. Es una lectura de dirección, no
  // una regresión: con 53 puntos y un salto de saldo inicial en el medio, una pendiente lineal diría
  // menos que esta comparación.
  // El orden de cada columna dentro del rango, 1..n: sirve para partirlo en mitades sin depender de
  // en qué letra empieza la grilla.
  const orden = `(COLUMN(${cierres})-COLUMN($B$${filaCierre})+1)`
  const mitad = `ROUND(SUMPRODUCT(--(${hayCierre}))/2;0)`
  const nTend = proximaFila()
  const fTend = push('Tendencia del horizonte (2ª mitad vs 1ª mitad)',
    `=IFERROR(${promedio(`${orden}>${mitad}`)}-${promedio(`${orden}<=${mitad}`)};"")`,
    `=IFERROR(IF($B$${nTend}>0;"▲ la caja mejora sobre el horizonte";IF($B$${nTend}<0;"▼ la caja se deteriora sobre el horizonte";"= estable"));"")`)
  push('Variación neta promedio por período',
    `=IFERROR(SUMPRODUCT((${hayCierre})*(${rango(filaVariacion)}))/MAX(1;SUMPRODUCT(--(${hayCierre})));"")`)

  // ── LOS EVENTOS CRÍTICOS, con fecha ─────────────────────────────────────────────────────────────
  // MATCH con 0 sobre un array booleano: la PRIMERA columna que cumple. Sin ordenar y sin LOOKUP
  // binario, que sobre datos no ordenados devuelve el resultado equivocado en vez de un error.
  const primeraQue = (cond) => `=IFERROR(INDEX(${fechas};1;MATCH(1;ARRAYFORMULA(--((${hayCierre})*(${cond})));0));"")`
  push(`Primer ${U} por debajo del colchón`, primeraQue(`${cierres}<$B$${fColchon}`),
    'Acá empieza a hacer falta una decisión de financiamiento')
  push(`Primer ${U} con la caja en negativo`, primeraQue(`${cierres}<0`),
    'Acá el descubierto deja de ser opcional')
  push(`${Us[0].toUpperCase()}${Us.slice(1)} bajo el colchón / en negativo`,
    `=COUNTIFS(${cierres};"<"&$B$${fColchon})&" / "&COUNTIF(${cierres};"<0")`,
    'Cuántos períodos del horizonte cruzan cada línea')

  // ── LA COMPARACIÓN ENTRE PERÍODOS ───────────────────────────────────────────────────────────────
  // El período en curso es el que CONTIENE HOY, ubicado por su ventana — igual que ancla el saldo
  // real. Buscarlo por número de columna ataría la lectura a la posición de la grilla.
  const ventana = periodo === 'semanal' ? `(${fechas}+7>TODAY())` : `(ARRAYFORMULA(EOMONTH(${fechas};0)+1)>TODAY())`
  const colHoy = `MATCH(1;ARRAYFORMULA((${fechas}<=TODAY())*${ventana});0)`
  const fHoy = push(`Cierre del ${U} en curso`, `=IFERROR(INDEX(${cierres};1;${colHoy});"")`)
  const fAnt = push(`Cierre del ${U} anterior`, `=IFERROR(INDEX(${cierres};1;${colHoy}-1);"")`)
  push('⇒ Variación contra el período anterior', `=IFERROR($B$${fHoy}-$B$${fAnt};"")`)
  // SUMPRODUCT, NO `AVERAGE(IF(...))`. Es la trampa que este mismo archivo documenta doce líneas más
  // arriba y acá estaba escrita igual: en Sheets ese IF no se expande sin ARRAYFORMULA y devuelve el
  // promedio de UNA celda, sin dar error. Un promedio que miente en silencio es peor que no tenerlo.
  push('Cierre promedio del horizonte', `=${promedio('1')}`)

  return {
    filas,
    titulo: fTit,
    fMinimo,
    fColchon,
    formatos: {
      texto: [fTit],
      moneda: [fColchon, fMinimo, fMinimo + 2, fMax, fMax + 2, fTend, fTend + 1, fHoy, fAnt, fAnt + 1, fAnt + 2],
      fecha: [fMinimo + 1, fMax + 1, fTend + 2, fTend + 3],
    },
  }
}
