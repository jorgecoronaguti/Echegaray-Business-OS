// LA COLUMNA "Pagado el" DEL REGISTRO DE QUINCENAS ESTABA CORRIDA UNA FILA.
//
// ═══ QUÉ SE MIDIÓ (01/08) ═══
//
// El dueño: *"la celda AF15 del cash flow semanal sigue mal"*. AF15 es "Jornales de obra" en la semana
// del 27/07 y mostraba $15.475.250 — las DOS últimas quincenas juntas. Al abrir el registro, cada
// fila tenía como "Pagado el" la fecha de pago de la quincena SIGUIENTE:
//
//   fila  quincena         Se paga el   Pagado el (lo que decía)   demora aparente
//   109   16/06 – 30/06    01/07        17/07                      16 días
//   110   01/07 – 15/07    17/07        31/07                      14 días
//   111   16/07 – 31/07    03/08        31/07                      −3 días (¡ANTES de cerrar!)
//
// Las catorce filas mostraban la misma demora de 14 a 17 días — o sea, exactamente una quincena — y la
// última se contradecía sola: decía pagada tres días antes de la fecha en que se paga.
//
// EL EXTRACTO DEL SANTANDER LO CIERRA. Los lotes de "Pago haberes" del archivo están el 01/07
// (lote 260701507) y el 17/07 (lote 260717507). La quincena que cerró el 30/06 se pagó el 01/07 y la
// que cerró el 15/07 se pagó el 17/07: es el banco diciendo qué fila va con qué fecha, y no coincide
// con lo que decía la planilla, que las corría una quincena para adelante.
//
// DE DÓNDE SALIÓ. El 31/07 restauré esta columna desde un snapshot después de habérsela borrado, y la
// emparejé por posición cuando el registro ya se había corrido. Es mi error, y es exactamente la
// trampa que este repo ya tenía anotada: anclar en la posición en vez de en el contenido.
//
// EL EFECTO, QUE NO ERA COSMÉTICO: cada quincena entraba al cash flow DOS SEMANAS TARDE, y la que
// todavía no se pagó ($8.248.000, vence el 03/08) figuraba como pagada el 31/07. En la semana del
// 27/07 se veían $15.475.250 de salida donde salieron $8.248.000.
//
// ESTA COLUMNA ES DEL DUEÑO. Ningún generador la escribe (ver jornales-pestana.mjs). Este módulo
// tampoco la escribe: detecta el corrimiento, propone la corrección y deja que un humano la mire.

/** NÚCLEO PURO: ¿dos fechas caen en el mismo día? Ambas como serial de Sheets. */
const mismoDia = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.round(a) === Math.round(b)

/**
 * NÚCLEO PURO: ¿la columna "Pagado el" está corrida una fila hacia arriba?
 *
 * La prueba es que el "Pagado el" de cada fila coincida con el "Se paga el" de la SIGUIENTE. Con una
 * sola coincidencia no alcanza —dos quincenas pueden pagarse el mismo día por casualidad—, así que se
 * exige que la mayoría de las filas comparables lo cumplan Y que ninguna coincida con su propia fecha.
 *
 * @param {{sePagaEl:number, pagadoEl:number}[]} filas en orden cronológico
 * @returns {{corrido:boolean, coinciden:number, propias:number, comparables:number}}
 */
export function detectarCorrimiento(filas = []) {
  let coinciden = 0
  let propias = 0
  let comparables = 0
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i]
    if (!Number.isFinite(f?.pagadoEl)) continue
    if (mismoDia(f.pagadoEl, f.sePagaEl)) propias++
    const sig = filas[i + 1]
    if (!sig) continue
    comparables++
    if (mismoDia(f.pagadoEl, sig.sePagaEl)) coinciden++
  }
  // Mayoría estricta y ninguna fila que ya esté bien: si algunas coinciden con la suya, lo que hay no
  // es un corrimiento parejo sino un revoltijo, y eso no se arregla moviendo la columna entera.
  return { corrido: comparables > 2 && coinciden > comparables / 2 && propias === 0, coinciden, propias, comparables }
}

/**
 * NÚCLEO PURO: la columna corregida. Cada fila recibe lo que hoy tiene la de ARRIBA.
 *
 * La PRIMERA fila queda vacía a propósito: su fecha de pago real no está en ninguna parte —la que
 * tenía era de la fila siguiente— y ponerle su "Se paga el" sería inventar un hecho. Vacío significa
 * "no sé cuándo se pagó", que es la verdad, y el cuadro ya sabe tratarlo (cae en "sin registrar").
 *
 * @param {{pagadoEl:number|''}[]} filas
 * @returns {(number|'')[]} un valor por fila, en el mismo orden
 */
export function corregir(filas = []) {
  return filas.map((_, i) => (i === 0 ? '' : (filas[i - 1]?.pagadoEl ?? '')))
}

/**
 * NÚCLEO PURO: qué celdas cambian, para poder mirarlas antes de escribir.
 * @returns {{i:number, de:number|'', a:number|'', quincena:string}[]}
 */
export function cambios(filas = [], nuevos = []) {
  const out = []
  for (let i = 0; i < filas.length; i++) {
    const de = filas[i]?.pagadoEl ?? ''
    const a = nuevos[i] ?? ''
    if (String(de) === String(a)) continue
    out.push({ i, de, a, quincena: filas[i]?.quincena ?? '' })
  }
  return out
}

/**
 * NÚCLEO PURO: el control contra el banco. Una fecha corregida que el extracto confirma vale más que
 * cualquier razonamiento sobre la planilla — es el mismo criterio que el resto del archivo: el
 * extracto es la única verdad sobre cuándo salió la plata.
 *
 * NO ALCANZA CON PREGUNTAR "¿esta fecha existe en el extracto?": con la columna corrida, el 01/07 y
 * el 17/07 seguían apareciendo los dos, sólo que en la fila equivocada, y ese control daba lo mismo
 * antes y después. Hay que preguntar POR FILA: la quincena cuyo pago estaba previsto para un día en
 * que el banco emitió un lote, ¿tiene ESE día como fecha de pago?
 *
 * @param {{sePagaEl:number}[]} filas
 * @param {(number|'')[]} nuevos las fechas a evaluar, una por fila
 * @param {number[]} lotesBanco los días (serial) en que el extracto tiene un lote de haberes
 * @returns {{calzan:number, noCalzan:number}}
 */
export function contraBanco(filas = [], nuevos = [], lotesBanco = []) {
  const dias = new Set(lotesBanco.map((d) => Math.round(d)))
  let calzan = 0
  let noCalzan = 0
  for (let i = 0; i < filas.length; i++) {
    // Sólo se puede juzgar la fila cuya fecha PREVISTA cae en un día con lote: ese día el banco pagó
    // una quincena, y es ésta. Las demás no dicen nada — pagos en efectivo no dejan lote.
    const prevista = filas[i]?.sePagaEl
    if (!Number.isFinite(prevista) || !dias.has(Math.round(prevista))) continue
    if (mismoDia(nuevos[i], prevista)) calzan++
    else noCalzan++
  }
  return { calzan, noCalzan }
}
