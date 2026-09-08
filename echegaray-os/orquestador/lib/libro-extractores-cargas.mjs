// LA CADENA DE CARGAS SOCIALES COMO FUENTE DEL LIBRO — y la precedencia contra Compras.
//
// ═══ EL AGUJERO QUE ESTO CIERRA (06/08/2026) ═══
//
// La pestaña "Cargas Sociales" tiene una cadena entera —jornales → remuneración → F931 → ART → OS →
// FCL → UOCRA → IERIC → FODECO— y su fila de caja lleva escrito, en el código que la genera, *"Ésta
// es la fila que tiene que mirar el cash flow"*. **No la miraba nadie.** No había un solo rango con
// nombre `CARGAS_*` y el Libro Canónico no leía la pestaña: proyectaba las cargas con las filas
// PLANAS que alguien tipeó en Compras —$8.000.000 en agosto, $6.500.000 de septiembre a diciembre,
// números redondos, o sea presupuestados— mientras la cadena medía $8.569.345 · $7.608.663 ·
// $8.633.543 · $9.082.359 · $9.121.411. La propia pestaña denunciaba la diferencia en su fila
// "diferencia contra lo proyectado acá" y nadie la levantaba.
//
// Y el devengado de DICIEMBRE ($10.507.157, que sale el 10/01/2027) no estaba en ningún lado: la
// grilla del año termina en diciembre y esa plata cae al año siguiente.
//
// ═══ POR QUÉ LA FECHA VIENE DEL SHEET Y NO SE CALCULA ACÁ ═══
//
// El devengado de un mes sale de la caja al mes SIGUIENTE, y el día no es una regla que este archivo
// pueda inventar: el calendario de ARCA para la seguridad social no está cableado en el OS. La
// pestaña lo publica como una fila de fechas vivas (`=DATE(año;mes+1;F931_DIA_DE_PAGO)`) con el día
// en un parámetro que el dueño corrige en una celda. Acá se LEEN seriales: si el criterio cambia, se
// cambia en un lugar y esto lo sigue. Diciembre resuelve solo — `DATE(2026;13;10)` es el 10/01/2027.
//
// ═══ LA PRECEDENCIA, DECLARADA (no se borra un dato: se decide cuál manda) ═══
//
//   1. EL HECHO LE GANA A TODO. Si Compras tiene el pago del mes marcado "Pagado", la cadena NO emite
//      ese mes: la plata ya salió y su fila real entra por la puerta de Compras.
//   2. LA CADENA LE GANA AL PLANO PREVISTO. Para los meses que la cadena cubre, las filas PROYECTADAS
//      de Compras de rubro "Nómina · Cargas sociales" y "Nómina · Gremiales" no entran al libro.
//   3. SI LA CADENA NO PUBLICA, COMPRAS VUELVE A ENTRAR. Sin los rangos con nombre —o con la serie en
//      cero— no hay meses cubiertos y no se excluye nada. Es fail-safe a propósito: el modo de falla
//      de un rango con nombre es devolver vacío sin dar error, y "vacío" no puede significar "borrá
//      la proyección de cargas del cash flow".
//
// LAS CUOTAS DE PLANES DE PAGO NO ENTRAN POR ACÁ. Son deuda vieja financiada (rubro "Deuda
// previsional (planes de pago)", $2.968.642,73 en agosto, verificado contra Compras el 06/08): ya
// entran por Compras con su fecha y su monto exactos, y la cadena no las proyecta. Meterlas también
// acá las contaría dos veces.

import { movimiento, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'
import { columnasDeCompras, estaPagada } from './libro-extractores-compras.mjs'
import { sub, total as rotuloTotal } from './patron-pestana.mjs'
import { fila as rangoFila } from './rangos-con-nombre.mjs'

/** La pestaña de la que sale la serie. Es el `origen.pestana` de cada movimiento. */
export const PESTANA_CARGAS = 'Cargas Sociales'
/** Los dos rubros que la cadena cubre. Son los MISMOS textos de `rubro-caja.mjs`: la taxonomía es una. */
export const RUBRO_CARGAS = 'Nómina · Cargas sociales'
export const RUBRO_GREMIALES = 'Nómina · Gremiales'
/** El rubro que la cadena NO cubre y que sigue saliendo de Compras. Está acá para que se lea al lado. */
export const RUBRO_PLANES = 'Deuda previsional (planes de pago)'

/**
 * LOS TRES NOMBRES QUE LA PESTAÑA PUBLICA Y EL LIBRO LEE. Un solo lugar: el generador los importa
 * para publicarlos y el extractor para leerlos, así que no pueden desincronizarse.
 *
 * Son TRES y no dos porque el cash flow tiene DOS líneas —cargas sociales y gremiales— y la cadena
 * proyecta las dos. Publicar sólo el total mudaría los gremiales a la línea de cargas sociales: el
 * número consolidado seguiría bien y las dos líneas dirían cosas falsas.
 */
export const NOMBRES_CARGAS = Object.freeze({
  fechas: 'CARGAS_MES_FECHAS',
  f931: 'CARGAS_MES_F931',
  gremiales: 'CARGAS_MES_GREMIALES',
  // ═══ EL CUARTO NOMBRE: LO DECLARADO EN LA DDJJ (08/09/2026) ═══
  //
  // El dueño, sobre «¿Alcanza la caja?»: *"están mal las cargas sociales presentes en este gráfico,
  // tenemos el dato real de lo que se presenta en el 931"*. La barra del 10/09 decía $7.300.000:
  // $6.500.000 TIPEADOS en Compras f483 más $800.000 de FCL, mientras la sección 1 de la pestaña
  // tenía la DDJJ de agosto declarada por $8.331.697,69. La cadena sólo publicaba la PROYECCIÓN de
  // los meses sin DDJJ; entre la presentación y el pago —los diez días que más importan— el libro
  // caía a la fila plana. Éste es el rango que cierra ese hueco: el «Total declarado», mes por mes.
  declarado: 'CARGAS_MES_F931_DECLARADO',
})

/**
 * LOS RÓTULOS DE LAS TRES FILAS, ESCRITOS UNA VEZ.
 *
 * Son a la vez lo que se escribe en la columna A y el ANCLA con la que `verificarRangos` comprueba,
 * antes de publicar, que cada nombre esté mirando la fila que promete. Escritos en dos archivos, el
 * día que uno cambie el nombre queda apuntando a la fila de al lado — y un rango con nombre mal
 * apuntado devuelve un número plausible, nunca un error.
 */
export const ROTULOS_CARGAS = Object.freeze({
  f931: rotuloTotal('Subtotal F931 — lo que declara la DDJJ'),
  gremiales: rotuloTotal('Subtotal gremiales — FCL, UOCRA, IERIC y FODECO'),
  fechas: sub('sale de la caja el mes siguiente'),
  declarado: rotuloTotal('Total declarado'),
})

/**
 * LOS PLANES DE PAGO DE DEUDA PREVISIONAL, DEFINIDOS UNA VEZ: qué período del F931 financia cada uno.
 *
 * Un F931 DECLARADO cuyo período está financiado NO es una obligación viva del libro: su plata entra
 * por las cuotas del plan, que Compras ya tiene con fecha y monto exactos (rubro `RUBRO_PLANES`).
 * Emitirlo además como declarado sin pagar lo contaría dos veces — junio-26 son $11.950.854 que el
 * libro publicaría como VENCIDO el 10/07 mientras sus cuotas W303094 salen el 16 de cada mes.
 *
 * El patrón se aplica al texto de la fila de Compras (comprobante + detalle), que es el único lugar
 * donde la planilla dice a qué período pertenece la cuota. `cargas-planes.mjs` deriva de acá el
 * nombre de cada plan para la pestaña: una sola definición.
 */
export const PLANES_F931 = Object.freeze([
  Object.freeze({ patron: /w303094/i, periodo: '2026-06', nombre: 'Plan F931 W303094 — financiación de junio 2026' }),
  Object.freeze({ patron: /dic\s*25/i, periodo: '2025-12', nombre: 'Deuda previsional F931 — Diciembre 2025' }),
  Object.freeze({ patron: /enero\s*26/i, periodo: '2026-01', nombre: 'Deuda previsional F931 — Enero 2026' }),
])

/** NÚCLEO PURO: el plan al que pertenece una fila, por lo que dice su texto; `null` si ninguno. */
export const planDeLaFila = (texto) => PLANES_F931.find((p) => p.patron.test(String(texto ?? ''))) ?? null

/**
 * NÚCLEO PURO: las tres declaraciones de rango, ancladas a su rótulo.
 *
 * @param {{fF931:number, fGremiales:number, fFechas:number}} g las filas (1-based) de la grilla armada
 * @param {{c0?:number, c1?:number}} cols las columnas de los doce meses (B..M por defecto, 0-based)
 */
export function rangosDeCargas({ fF931, fGremiales, fFechas, fDeclarado }, { c0 = 1, c1 = 12 } = {}) {
  // LAS CUATRO FILAS SON OBLIGATORIAS. Una fila `undefined` pasa `verificarRangos` sin ruido (ninguna
  // comparación numérica falla) y publicaría un nombre ciego: el libro no leería el declarado y
  // volvería, en silencio, al $6.500.000 tipeado. Se rompe acá, con el nombre de lo que falta.
  const filas = { fFechas, fF931, fGremiales, fDeclarado }
  const faltan = Object.entries(filas).filter(([, f]) => !(Number.isInteger(f) && f > 0)).map(([k]) => k)
  if (faltan.length) throw new Error(`rangosDeCargas: falta la fila de ${faltan.join(', ')} (fDeclarado es el «Total declarado»)`)
  return [
    rangoFila(NOMBRES_CARGAS.fechas, { fila: fFechas, c0, c1, rotulo: ROTULOS_CARGAS.fechas }),
    rangoFila(NOMBRES_CARGAS.f931, { fila: fF931, c0, c1, rotulo: ROTULOS_CARGAS.f931 }),
    rangoFila(NOMBRES_CARGAS.gremiales, { fila: fGremiales, c0, c1, rotulo: ROTULOS_CARGAS.gremiales }),
    rangoFila(NOMBRES_CARGAS.declarado, { fila: fDeclarado, c0, c1, rotulo: ROTULOS_CARGAS.declarado }),
  ]
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/**
 * Un rango con nombre HORIZONTAL leído por la API viene como una fila dentro de una lista
 * (`[[46001, 46032]]`); un test lo escribe como lista (`[46001, 46032]`). Las dos son la misma serie.
 */
export const serie = (v) => {
  const a = Array.isArray(v) ? v : []
  return Array.isArray(a[0]) ? a[0] : a
}

/** El mes calendario ('YYYY-MM') de un serial de Sheets. Es la unidad en la que se decide quién manda. */
export const mesDeSerial = (serial) => isoDeSerial(serial).slice(0, 7)

/**
 * NÚCLEO PURO: qué obligación de F931 le toca a un mes devengado — la declarada o la proyectada.
 *
 * ═══ LA PRECEDENCIA DENTRO DE LA CADENA (08/09/2026) ═══
 *
 *   1. Si Compras ya tiene el pago del mes, nada (lo decide el llamador, antes de llegar acá).
 *   2. Si la DDJJ está presentada, el DECLARADO manda: es la obligación cierta, al centavo, y viaja
 *      como `COMPROMETIDO`. Una proyección para un mes declarado no existe (la pestaña no la publica),
 *      y si existiera sería un número peor que el dato.
 *   3. Un declarado cuyo período está FINANCIADO no se emite: sus cuotas entran por Compras.
 *   4. Sin DDJJ, la PROYECCIÓN de la cadena, como `PROYECTADO`.
 *
 * @returns {{importe:number, estado:string, fila:string}|null} `null` = este mes no emite F931
 */
function obligacionF931({ declarado, proyectado, devengado, mesesFinanciados, aviso }) {
  const decl = num(declarado)
  if (decl) {
    if (mesesFinanciados.has(devengado)) {
      aviso(`libro-extractores-cargas: el F931 de ${devengado} está declarado (${decl}) y FINANCIADO en un plan — sus cuotas entran por Compras, no se emite.`)
      return null
    }
    // A dos decimales: el SUM de la DDJJ llega como 8331697.6899999995 y el libro publica pesos con centavos.
    return { importe: Math.round(decl * 100) / 100, estado: 'COMPROMETIDO', fila: `F931 · declarado ${Number(devengado.slice(5, 7))}` }
  }
  const proy = num(proyectado)
  return proy ? { importe: proy, estado: 'PROYECTADO', fila: `F931 · devengado ${Number(devengado.slice(5, 7))}` } : null
}

/**
 * CARGAS SOCIALES → los egresos de la nómina que todavía no salieron.
 *
 * Una fila por mes devengado, con la fecha en que sale de la caja (la que publica la propia pestaña).
 * El F931 y los gremiales viajan SEPARADOS porque son dos líneas del cash flow y dos rubros de la
 * taxonomía única — juntarlos acá obligaría a repartirlos después, que es donde se inventa.
 *
 * El F931 tiene DOS fuentes en la pestaña y una precedencia (ver `obligacionF931`): lo DECLARADO en
 * la DDJJ para los meses ya presentados, la PROYECCIÓN de la cadena para los que no. Los gremiales
 * no tienen DDJJ: sólo proyección.
 *
 * @param {{fechas:Array, f931:Array, gremiales:Array, declarado?:Array}} rangos lo leído de los rangos con nombre
 * @param {number|null} corte serial del corte: un vencimiento ya pasado y sin pagar es VENCIDO
 * @param {{mesesPagados?:Set<string>, mesesFinanciados?:Set<string>, aviso?:(m:string)=>void}} opciones
 *        `mesesPagados` son claves `YYYY-MM·rubro` del mes de CAJA; `mesesFinanciados`, los períodos
 *        DEVENGADOS (`YYYY-MM`) que un plan de pago financia — ver `PLANES_F931`.
 * @returns {Array} movimientos
 */
export function deCargasSociales({ fechas, f931, gremiales, declarado } = {}, corte = null,
  { mesesPagados = new Set(), mesesFinanciados = new Set(), aviso = () => {} } = {}) {
  const F = serie(fechas)
  const D = serie(declarado)
  const bloques = [
    { importes: serie(f931), rubro: RUBRO_CARGAS, que: 'F931' },
    { importes: serie(gremiales), rubro: RUBRO_GREMIALES, que: 'gremiales' },
  ]
  const out = []
  for (let i = 0; i < F.length; i++) {
    const fecha = num(F[i])
    if (fecha === null) continue
    const mes = mesDeSerial(fecha)
    // El mes que se nombra es el DEVENGADO (la nómina que la generó), no el de la salida: es lo que
    // permite atarla contra la sección 1/4 de la pestaña sin contar meses con los dedos. EL AÑO
    // TAMBIÉN ES DEL DEVENGADO: la nómina de diciembre-26 sale el 10/01/2027 y se llama dic-26.
    const devengado = `${anioDevengado(fecha, i + 1)}-${String(i + 1).padStart(2, '0')}`
    for (const b of bloques) {
      // ═══ EL HECHO LE GANA A LA PROYECCIÓN — POR (MES · RUBRO), NO POR MES ═══
      // El auditor de cierre (06/08) lo rompió con una fila: con la precedencia por mes entero,
      // marcar "Pagado" la fila de gremiales del 17/08 ($700k) tiraba abajo TAMBIÉN el F931 de
      // agosto ($7,0M) y el cash flow volvía a los números redondos tipeados. El F931 y los
      // gremiales vencen en días distintos (10 y 17) y hay una semana por mes en la que el mes está
      // pagado a medias: cada rubro decide solo.
      if (mesesPagados.has(`${mes}·${b.rubro}`)) {
        aviso(`libro-extractores-cargas: ${mes} · ${b.que} ya tiene el pago cargado en Compras — la cadena no lo emite.`)
        continue
      }
      const o = b.que === 'F931'
        ? obligacionF931({ declarado: D[i], proyectado: b.importes[i], devengado, mesesFinanciados, aviso })
        : (num(b.importes[i]) ? { importe: num(b.importes[i]), estado: 'PROYECTADO', fila: `gremiales · devengado ${i + 1}` } : null)
      if (!o) continue
      out.push(movimiento({
        fecha,
        signo: SALE,
        importe: o.importe,
        concepto: `${b.que === 'F931' ? 'F931' : 'Gremiales'} · nómina de ${MES[i + 1] ?? i + 1}-${devengado.slice(2, 4)}`,
        contraparte: b.que === 'F931' ? 'ARCA' : 'FCL · UOCRA · IERIC · FODECO',
        rubro: b.rubro,
        estado: estadoContraCorte(o.estado, fecha, corte),
        // LA IDENTIDAD ES EL MES DEVENGADO, NO LA FILA. Los doce meses viven en la MISMA fila de la
        // pestaña: con el número de fila, la clave de dedup —que cae en `origen:pestaña:fila` cuando
        // no hay comprobante— colapsaría los movimientos en uno y quedaría un mes de cargas en todo
        // el año. Y con el mes adentro, el nombre sobrevive a que la pestaña se reordene.
        origen: { pestana: PESTANA_CARGAS, fila: o.fila },
      }))
    }
  }
  return out
}

const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const anioDe = (serial) => Number(isoDeSerial(serial).slice(0, 4))
/** El año del mes DEVENGADO: si la salida (fecha) cae en un mes anterior al devengado, cruzó el año. */
const anioDevengado = (serial, mesDevengado) => {
  const a = anioDe(serial)
  const mesSalida = Number(isoDeSerial(serial).slice(5, 7))
  return mesSalida >= mesDevengado ? a : a - 1
}

/**
 * NÚCLEO PURO: los meses de caja que la cadena cubre. Es lo que habilita la exclusión en Compras — y
 * si está vacío, no se excluye nada.
 */
export function mesesCubiertos(movimientos = []) {
  // La clave es (mes · rubro): la cadena puede cubrir el F931 de un mes cuyos gremiales ya se
  // pagaron por Compras, y al revés. Una clave por mes entero revertía el mes completo (auditor).
  return new Set(movimientos.map((m) => (mesDeSerial(m.fecha) ? `${mesDeSerial(m.fecha)}·${m.rubro}` : null)).filter(Boolean))
}

/**
 * NÚCLEO PURO: ¿esta fila de Compras la cubre la cadena?
 *
 * TRES CONDICIONES, Y LAS TRES IMPORTAN:
 *   · el rubro tiene que ser uno de los dos que la cadena proyecta;
 *   · la fila NO puede estar pagada — una salida real nunca se descarta, venga de donde venga;
 *   · el mes tiene que estar cubierto por la cadena. Si la cadena no publicó, no hay meses y esto
 *     devuelve `false` siempre: Compras vuelve a entrar entero.
 */
export function cubiertaPorLaCadena({ rubro, fecha, pagada }, cubiertos = new Set()) {
  if (!cubiertos || !cubiertos.size) return false
  if (pagada) return false
  if (rubro !== RUBRO_CARGAS && rubro !== RUBRO_GREMIALES) return false
  if (!Number.isFinite(fecha)) return false
  return cubiertos.has(`${mesDeSerial(fecha)}·${rubro}`)
}

/**
 * COMPRAS, EL LADO QUE MIRA ESTA PRECEDENCIA: qué cargas están pagadas y qué cargas están previstas.
 *
 * Una sola pasada y dos respuestas, porque las dos son la misma pregunta vista de los dos lados:
 *   · `mesesPagados`  — los meses en los que la plata YA salió. La cadena no los emite.
 *   · `previstas`     — las filas planas que la cadena reemplaza cuando publica. Es lo que el portón
 *                       declara como tramo swappeado, con su monto: una exclusión sin monto es una
 *                       exclusión que nadie puede auditar.
 *   · `financiados`   — los períodos DEVENGADOS (`YYYY-MM`) cuyo F931 está en un plan de pago (rubro
 *                       `RUBRO_PLANES`, reconocido por `PLANES_F931`). Un declarado financiado no se
 *                       emite: sus cuotas ya entran por Compras.
 *
 * @param {Array<Array>} filas Compras entera, UNFORMATTED_VALUE
 */
export function cargasEnCompras(filas = []) {
  const c = columnasDeCompras(filas)
  const mesesPagados = new Set()
  const previstas = []
  const financiados = new Set()
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const rubro = String(f[c.rubro] ?? '').trim()
    if (rubro === RUBRO_PLANES) {
      const plan = planDeLaFila(`${f[c.comprobante] ?? ''} ${f[c.obra] ?? ''}`)
      if (plan) financiados.add(plan.periodo)
      continue
    }
    if (rubro !== RUBRO_CARGAS && rubro !== RUBRO_GREMIALES) continue
    // La fecha se lee tal cual: `fechaDeCajaDeCompra` sólo corrige las cuotas de plan de ARCA que
    // caen fin de semana, y ése es otro rubro. Si algún día corrigiera también éstos, hay que pasar
    // por ahí — el mes que sale de acá tiene que ser EL MISMO que usa `deCompras` para excluir.
    const fecha = num(f[c.fechaCaja])
    const total = num(f[c.importe])
    if (fecha === null || !total) continue
    const pagada = estaPagada(f[c.estado])
    if (pagada) { mesesPagados.add(`${mesDeSerial(fecha)}·${rubro}`); continue }
    previstas.push({ fila: i + 1, rubro, fecha, mes: mesDeSerial(fecha), total })
  }
  return { mesesPagados, previstas, financiados }
}

/** Las filas previstas de Compras que la cadena efectivamente reemplaza, con su monto. */
export function reemplazadasPorLaCadena({ previstas = [] } = {}, cubiertos = new Set()) {
  return previstas.filter((p) => cubiertaPorLaCadena({ rubro: p.rubro, fecha: p.fecha, pagada: false }, cubiertos))
}
