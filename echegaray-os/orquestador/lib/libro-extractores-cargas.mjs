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
})

/**
 * NÚCLEO PURO: las tres declaraciones de rango, ancladas a su rótulo.
 *
 * @param {{fF931:number, fGremiales:number, fFechas:number}} g las filas (1-based) de la grilla armada
 * @param {{c0?:number, c1?:number}} cols las columnas de los doce meses (B..M por defecto, 0-based)
 */
export function rangosDeCargas({ fF931, fGremiales, fFechas }, { c0 = 1, c1 = 12 } = {}) {
  return [
    rangoFila(NOMBRES_CARGAS.fechas, { fila: fFechas, c0, c1, rotulo: ROTULOS_CARGAS.fechas }),
    rangoFila(NOMBRES_CARGAS.f931, { fila: fF931, c0, c1, rotulo: ROTULOS_CARGAS.f931 }),
    rangoFila(NOMBRES_CARGAS.gremiales, { fila: fGremiales, c0, c1, rotulo: ROTULOS_CARGAS.gremiales }),
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
 * CARGAS SOCIALES → los egresos de la nómina que todavía no salieron.
 *
 * Una fila por mes devengado, con la fecha en que sale de la caja (la que publica la propia pestaña).
 * El F931 y los gremiales viajan SEPARADOS porque son dos líneas del cash flow y dos rubros de la
 * taxonomía única — juntarlos acá obligaría a repartirlos después, que es donde se inventa.
 *
 * @param {{fechas:Array, f931:Array, gremiales:Array}} rangos lo leído de los tres rangos con nombre
 * @param {number|null} corte serial del corte: un vencimiento ya pasado y sin pagar es VENCIDO
 * @param {{mesesPagados?:Set<string>, aviso?:(m:string)=>void}} opciones
 * @returns {Array} movimientos
 */
export function deCargasSociales({ fechas, f931, gremiales } = {}, corte = null, { mesesPagados = new Set(), aviso = () => {} } = {}) {
  const F = serie(fechas)
  const bloques = [
    { importes: serie(f931), rubro: RUBRO_CARGAS, que: 'F931' },
    { importes: serie(gremiales), rubro: RUBRO_GREMIALES, que: 'gremiales' },
  ]
  const out = []
  for (let i = 0; i < F.length; i++) {
    const fecha = num(F[i])
    if (fecha === null) continue
    const mes = mesDeSerial(fecha)
    // ═══ EL HECHO LE GANA A LA PROYECCIÓN ═══
    // Si Compras ya tiene el pago de ese mes marcado "Pagado", esta plata salió y su fila real entra
    // por la puerta de Compras. Emitirla también acá la contaría dos veces —y del lado peor, porque
    // un PROYECTADO sí pesa en la escalera mientras que el REAL ya está en el saldo del banco.
    if (mesesPagados.has(mes)) {
      aviso(`libro-extractores-cargas: ${mes} ya tiene el pago cargado en Compras — la cadena no lo emite.`)
      continue
    }
    for (const b of bloques) {
      const importe = num(b.importes[i])
      if (!importe) continue
      out.push(movimiento({
        fecha,
        signo: SALE,
        importe,
        // El mes que se nombra es el DEVENGADO (la nómina que la generó), no el de la salida: es lo
        // que permite atarla contra la sección 4 de la pestaña sin contar meses con los dedos.
        concepto: `${b.que === 'F931' ? 'F931' : 'Gremiales'} · nómina de ${MES[i + 1] ?? i + 1}-${String(anioDe(fecha)).slice(2)}`,
        contraparte: b.que === 'F931' ? 'ARCA' : 'FCL · UOCRA · IERIC · FODECO',
        rubro: b.rubro,
        estado: estadoContraCorte('PROYECTADO', fecha, corte),
        // LA IDENTIDAD ES EL MES DEVENGADO, NO LA FILA. Los doce meses viven en la MISMA fila de la
        // pestaña: con el número de fila, la clave de dedup —que cae en `origen:pestaña:fila` cuando
        // no hay comprobante— colapsaría los seis movimientos en uno y quedaría un mes de cargas en
        // todo el año. Y con el mes adentro, el nombre sobrevive a que la pestaña se reordene.
        origen: { pestana: PESTANA_CARGAS, fila: `${b.que} · devengado ${i + 1}` },
      }))
    }
  }
  return out
}

const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const anioDe = (serial) => Number(isoDeSerial(serial).slice(0, 4))

/**
 * NÚCLEO PURO: los meses de caja que la cadena cubre. Es lo que habilita la exclusión en Compras — y
 * si está vacío, no se excluye nada.
 */
export function mesesCubiertos(movimientos = []) {
  return new Set(movimientos.map((m) => mesDeSerial(m.fecha)).filter(Boolean))
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
  return cubiertos.has(mesDeSerial(fecha))
}

/**
 * COMPRAS, EL LADO QUE MIRA ESTA PRECEDENCIA: qué cargas están pagadas y qué cargas están previstas.
 *
 * Una sola pasada y dos respuestas, porque las dos son la misma pregunta vista de los dos lados:
 *   · `mesesPagados`  — los meses en los que la plata YA salió. La cadena no los emite.
 *   · `previstas`     — las filas planas que la cadena reemplaza cuando publica. Es lo que el portón
 *                       declara como tramo swappeado, con su monto: una exclusión sin monto es una
 *                       exclusión que nadie puede auditar.
 *
 * @param {Array<Array>} filas Compras entera, UNFORMATTED_VALUE
 */
export function cargasEnCompras(filas = []) {
  const c = columnasDeCompras(filas)
  const mesesPagados = new Set()
  const previstas = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const rubro = String(f[c.rubro] ?? '').trim()
    if (rubro !== RUBRO_CARGAS && rubro !== RUBRO_GREMIALES) continue
    const fecha = num(f[c.fechaCaja])
    const total = num(f[c.importe])
    if (fecha === null || !total) continue
    const pagada = estaPagada(f[c.estado])
    if (pagada) { mesesPagados.add(mesDeSerial(fecha)); continue }
    previstas.push({ fila: i + 1, rubro, fecha, mes: mesDeSerial(fecha), total })
  }
  return { mesesPagados, previstas }
}

/** Las filas previstas de Compras que la cadena efectivamente reemplaza, con su monto. */
export function reemplazadasPorLaCadena({ previstas = [] } = {}, cubiertos = new Set()) {
  return previstas.filter((p) => cubiertaPorLaCadena({ rubro: p.rubro, fecha: p.fecha, pagada: false }, cubiertos))
}
