// LOS EXTRACTORES DE NÓMINA — jornales de obra, oficina y dirección, desde "Jornales por Quincena".
//
// ═══ POR QUÉ ESTA FUENTE Y NO COMPRAS (31/07 y 01/08, ya medido y ya pagado) ═══
//
// Las tres viven en la planilla de nómina y NO en Compras, y no es una preferencia de estilo:
//
//   · JORNALES DE OBRA. En Compras están tipeados a mano como estimación ($144.848.022 en el año);
//     el dato real de la planilla da $114.371.743. Sumar Compras infla la caja $30,5M.
//   · OFICINA + DIRECCIÓN. Compras tiene CINCO personas y la planilla tenía DOS: los tres que
//     faltaban son los retiros de Dirección. Desde el 01/08 las dos mitades viven en la planilla y
//     la línea del cash flow es su suma (`formulaAdministracion`), con Compras convertido en MEMO.
//
// Por eso `deCompras` saltea estos dos rubros: si los emitiera, el libro contaría la misma nómina dos
// veces. La regla del CUADRO es la misma —la línea de Compras vive en un grupo con `signo: 0`— y acá
// se cumple sacándola del libro, que es donde se cuenta una sola vez.
//
// ═══ LA ENTRADA SON LOS RANGOS CON NOMBRE, NO LAS FILAS DE LA PESTAÑA ═══
//
// El cash flow lee `JORNALES_REAL_*`, `OFICINA_*` y `DIRECCION_*` por NOMBRE desde que el rediseño del
// 23/07 movió las quincenas de la fila 3 a la 41 y las sumas siguieron devolviendo un número —el de las
// filas equivocadas— sin marcar un solo error. El libro lee exactamente los mismos nombres: si la
// pestaña se reordena, las dos vistas se mueven juntas.

import { movimiento, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'
import { estadoDeEgreso } from './caja-canales.mjs'
import { respaldoEnLote } from './libro-respaldo-banco.mjs'
// El criterio de "¿esta quincena se pagó?", cruzado contra el extracto. Vive afuera porque lo usan
// DOS: este extractor (para decidir el estado) y scripts/jornales-evidencia-pago.mjs (para mostrarle
// la evidencia al dueño). Escrito dos veces, el libro y la tabla podrían decir cosas distintas.
import { lotesDeHaberes, testigoDeQuincena, VEREDICTO, GRITAN } from './jornales-testigos.mjs'

/** La pestaña de la que salen los tres bloques. Es una sola: el bloque distingue, no la pestaña. */
export const PESTANA_NOMINA = 'Jornales por Quincena'
export const RUBRO_JORNALES = 'Nómina · Jornales de obra'
export const RUBRO_ADMINISTRACION = 'Nómina · Sueldos administración'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/**
 * Un rango con nombre leído por la API viene como filas (`[[46001], [46015]]`); un test lo escribe
 * como lista (`[46001, 46015]`). Las dos son la misma columna: se acepta la que llegue.
 */
const columna = (v) => (Array.isArray(v) ? v : []).map((c) => (Array.isArray(c) ? c[0] : c))

/**
 * LA IDENTIDAD DE UN RENGLÓN DE NÓMINA ES SU BLOQUE, NO SU FILA.
 *
 * Los cuatro bloques (real, proyectado, oficina, dirección) viven en la MISMA pestaña, y la clave de
 * deduplicación cae en `origen:pestaña:fila` cuando el movimiento no tiene comprobante ni número de
 * cheque. Sin el bloque adentro, el renglón 3 de Oficina y el renglón 3 de Dirección serían el mismo
 * movimiento y uno de los dos desaparecería del libro sin que ninguna suma se rompa.
 */
const filaDe = (bloque, i) => `${bloque}:${i + 1}`

/**
 * NÚCLEO PURO: un renglón del registro, ya con su veredicto, convertido en movimiento(s).
 *
 * ═══ SE PARTE EN LO QUE EL BANCO PRUEBA Y LO QUE NO ═══
 *
 * El extracto prueba la columna "Banco" de la quincena, no su TOTAL: el adelanto y lo pagado contra
 * recibo salen por caja física y el banco no los ve. Marcar REAL el total entero porque el lote
 * bancario coincide sería presentar una inferencia como hecho. Se emiten dos renglones —el mismo
 * patrón que `partirContraElExtracto` usa para Dirección— y la suma no se mueve un peso.
 */
function quincenaAMovimientos({ q, t, fecha, declarada, marcada = false, importe, i }, { corte, extracto, aviso }) {
  const comun = {
    signo: SALE,
    importe,
    concepto: `Jornales · quincena al ${isoDeSerial(q.hasta ?? fecha)}`,
    rubro: RUBRO_JORNALES,
    origen: { pestana: PESTANA_NOMINA, fila: filaDe('Quincenas reales', i) },
  }
  const nombre = `la quincena al ${isoDeSerial(q.hasta ?? fecha)} ($${importe})`
  if (GRITAN.includes(t.veredicto)) {
    aviso(`libro-extractores-nomina(Jornales): ${nombre} sale ${t.veredicto} — ${t.motivo}.`)
  }
  // El dueño la marcó y la fecha es creíble: manda su edición. `estadoDeEgreso` sigue vigilando que un
  // "pagado" con fecha POSTERIOR al corte no se cuente como plata que ya salió (el caso de Dirección).
  if (declarada !== null) {
    return [movimiento({ ...comun, fecha, estado: estadoDeEgreso({ instrumento: 'desconocido', pagado: true, fecha, corte }) })]
  }
  // MARCADA CON FECHA IMPOSIBLE: el dueño afirmó que se pagó y la aritmética sólo desmintió el CUÁNDO.
  // Sale REAL con la fecha prevista, que es la única defendible, y el grito de arriba ya nombró por qué.
  if (marcada) {
    return [movimiento({ ...comun, fecha, estado: estadoDeEgreso({ instrumento: 'desconocido', pagado: true, fecha, corte }) })]
  }
  if (t.veredicto !== VEREDICTO.banco || !t.cubierto) {
    return [movimiento({ ...comun, fecha, estado: 'COMPROMETIDO' })]
  }
  // El débito respaldó a esta quincena y no puede respaldar a otra.
  for (const fila of t.filas) extracto?.usados?.add(fila)
  aviso(`libro-extractores-nomina(Jornales): ${nombre} no tiene «Pagado el» y el extracto la prueba: `
    + `$${t.cubierto} debitados el ${isoDeSerial(t.fecha)}. Esa parte pasa a REAL; el resto sigue abierto.`)
  const resto = Math.round((importe - t.cubierto) * 100) / 100
  const ms = [movimiento({
    ...comun,
    fecha: t.fecha,
    importe: t.cubierto,
    estado: 'REAL',
    concepto: `${comun.concepto} · ${t.motivo}`,
    origen: { ...comun.origen, fila: `${comun.origen.fila}:real` },
  })]
  if (resto > 0) {
    ms.push(movimiento({ ...comun, fecha, importe: resto, estado: 'COMPROMETIDO', origen: { ...comun.origen, fila: `${comun.origen.fila}:pendiente` } }))
  }
  return ms
}

/**
 * JORNALES POR QUINCENA → los egresos de la nómina de obra.
 *
 * ═══ LA FECHA QUE DECIDE, EN EL MISMO ORDEN QUE LA FÓRMULA ═══
 *
 * `fechaDeCajaDeQuincena(PAGO, HASTA, PAGADO)` de `jornales-fecha-pago.mjs`, textual:
 *   1. PAGADO   — salió de verdad. Es un HECHO. Gana siempre.
 *   2. PREVISTA — el lote del banco si ya pasó, o el parámetro (`Se paga el`).
 *   3. CIERRE   — último recurso, para que una quincena sin ninguna fecha no desaparezca del cuadro.
 * Una quincena no se paga el día que cierra: el extracto lo prueba (cierre 15/07 → lote del 17/07).
 *
 * ═══ EL ESTADO NO ES "REAL PORQUE EL BLOQUE SE LLAMA REAL" ═══
 *
 * El bloque real son las quincenas CERRADAS, que no es lo mismo que PAGADAS: la que cierra el 31/07 se
 * paga el 03/08. Marcarla REAL diría que la plata ya salió de la cuenta cinco días antes de que salga
 * —una estimación presentada como hecho, que es la regla de oro nº 2—.
 *
 * ═══ PERO LA COLUMNA TIPEADA YA NO DECIDE SOLA (16/08/2026) ═══
 *
 * Hasta hoy esta función hacía `estado = pagado === null ? 'COMPROMETIDO' : 'REAL'`. La columna N se
 * desalineó ocho filas y OCHO quincenas quedaron sin fecha: el libro las publicó impagas y CAJA dijo
 * que faltaba pagar más de lo ya pagado. **$70.431.250 de deuda que salió de una celda vacía.**
 *
 * Un testigo que falta no prueba lo contrario. Ahora se cruza contra el extracto
 * (`lib/jornales-testigos.mjs`) y cada renglón sale con uno de tres desenlaces:
 *   · el banco lo prueba → la parte que salió por banco es REAL, con la FECHA DEL DÉBITO;
 *   · el dueño lo marcó   → REAL (su edición manda), salvo fecha imposible o posterior al corte;
 *   · nadie puede probarlo → COMPROMETIDO **y se grita con nombre y monto**, que es la diferencia
 *     entre una deuda medida y una deuda inventada en silencio.
 *
 * @param {{reales?:object, proyectadas?:object}} bloques columnas de los rangos con nombre
 * @param {number|null} corte serial del corte, para que un proyectado vencido se vea como VENCIDO
 * @param {{aviso?:Function, extracto?:object}} ctx el extracto compartido (`debitos`/`corte`/`usados`)
 * @returns {Array} movimientos
 */
export function deJornalesQuincenas({ reales = {}, proyectadas = {} } = {}, corte = null,
  { aviso = avisoPorDefecto, extracto = null } = {}) {
  const out = []
  const real = {
    pago: columna(reales.pago), hasta: columna(reales.hasta), banco: columna(reales.banco),
    pagado: columna(reales.pagado), total: columna(reales.total),
  }
  const lotes = lotesDeHaberes(extracto?.debitos ?? [], { usados: extracto?.usados })
  const desdeExtracto = (extracto?.debitos ?? []).reduce((a, d) => (a === null || d.fecha < a ? d.fecha : a), null)
  for (let i = 0; i < Math.max(real.total.length, real.pago.length, real.hasta.length); i++) {
    const q = { pago: num(real.pago[i]), hasta: num(real.hasta[i]), banco: num(real.banco[i]), pagado: num(real.pagado[i]) }
    const t = testigoDeQuincena(q, { lotes, corte: extracto?.corte ?? null, desdeExtracto })
    const importe = num(real.total[i])
    // La fecha declarada sólo cuenta si PUEDE ser la de este pago: una imposible movía $4,9M de enero
    // a mayo en el Cash Flow Mensual sin dar un error. Descartada, manda la prevista.
    const declarada = t.veredicto === VEREDICTO.imposible ? null : q.pagado
    // ═══ DESCARTAR LA FECHA NO ES DESCARTAR EL PAGO (16/08/2026, publicado y corregido) ═══
    //
    // La primera versión de esto mandaba una fecha imposible a `null` y ahí terminaba: el renglón
    // caía en COMPROMETIDO. Se publicó, y las SIETE quincenas de enero a abril —$51.941.723 que el
    // dueño cobró hace meses— aparecieron como deuda vencida. El tramo "Vencido" de CAJA pasó de
    // $(53.811.188) a $(98.641.528) y "falta pagar este mes" de $125,9M a $174,3M. Cambié un error
    // por otro más grande, y en la dirección contraria a la que este archivo vino a arreglar.
    //
    // Son DOS afirmaciones con fuerza distinta y el código las trataba como una:
    //   · que la celda TENGA algo → el dueño afirma que esta quincena se pagó. Es su edición y manda.
    //   · que ese algo sea UNA FECHA CREÍBLE → afirma CUÁNDO. Eso sí lo puede desmentir la aritmética.
    //
    // Invalidar el cuándo no invalida el qué. Una quincena marcada con fecha imposible sale REAL con
    // la fecha PREVISTA —la única defendible— y se grita que la fecha se descartó.
    const marcada = q.pagado !== null
    const fecha = declarada ?? q.pago ?? q.hasta
    if (fecha === null || !importe) continue
    out.push(...quincenaAMovimientos({ q, t, fecha, declarada, marcada, importe, i },
      { corte, extracto, aviso }))
  }
  const proy = { pago: columna(proyectadas.pago), hasta: columna(proyectadas.hasta), total: columna(proyectadas.total) }
  for (let i = 0; i < Math.max(proy.total.length, proy.pago.length, proy.hasta.length); i++) {
    const fecha = num(proy.pago[i]) ?? num(proy.hasta[i])
    const importe = num(proy.total[i])
    if (fecha === null || !importe) continue
    out.push(movimiento({
      fecha,
      signo: SALE,
      importe,
      concepto: `Jornales · quincena proyectada al ${isoDeSerial(num(proy.hasta[i]) ?? fecha)}`,
      rubro: RUBRO_JORNALES,
      estado: estadoContraCorte('PROYECTADO', fecha, corte),
      origen: { pestana: PESTANA_NOMINA, fila: filaDe('Quincenas proyectadas', i) },
    }))
  }
  return out
}

/**
 * NÚCLEO PURO: un bloque MENSUAL de la planilla de nómina (Oficina o Dirección) → movimientos.
 *
 * Los dos bloques tienen la misma forma —`_PAGO` (cuándo sale de la caja), `_PAGADO` (lo que ya se
 * pagó) y `_PROYECTADO` (lo que se va a pagar)— y el cash flow los suma con la misma fórmula
 * (`formulaOficina` / `formulaDireccion`, idénticas salvo el nombre del rango). Una sola función:
 * dos copias de esto se desincronizan la primera vez que alguien toque una.
 *
 * UN MES ESTÁ PAGADO O PROYECTADO, NUNCA LOS DOS. La planilla lo garantiza por construcción (la
 * proyección se apaga sola cuando la celda de pagado tiene plata). Si algún día se llenaran las dos, el
 * Sheet las SUMA y duplicaría el mes; acá gana el hecho y se avisa, que es lo que el comentario de
 * `formulaOficina` dice que tiene que pasar: *"el control de nómina lo grita en vez de duplicar"*.
 */
function deBloqueMensual({ pago, pagado, proyectado }, corte, { bloque, aviso, extracto }) {
  const P = columna(pago); const G = columna(pagado); const Y = columna(proyectado)
  const out = []
  for (let i = 0; i < Math.max(P.length, G.length, Y.length); i++) {
    const fecha = num(P[i])
    const real = num(G[i])
    const proy = num(Y[i])
    if (fecha === null) continue
    if (real && proy) {
      aviso(`libro-extractores-nomina(${bloque}): el renglón ${i + 1} tiene PAGADO ${real} y PROYECTADO ${proy} `
        + 'a la vez. Vale el pagado (el hecho le gana a la proyección); el Sheet los sumaría y duplicaría el mes.')
    }
    const importe = real || proy
    if (!importe) continue
    const comun = {
      signo: SALE,
      importe,
      concepto: `${bloque} · ${isoDeSerial(fecha)}`,
      rubro: RUBRO_ADMINISTRACION,
      origen: { pestana: PESTANA_NOMINA, fila: filaDe(bloque, i) },
    }
    if (!real) {
      out.push(movimiento({ ...comun, fecha, estado: estadoContraCorte('PROYECTADO', fecha, corte) }))
      continue
    }
    // ═══ "PAGADO" CON FECHA FUTURA NO ES "LA PLATA SALIÓ" (06/08) ═══
    //
    // Medido en vivo: Dirección de julio, $9.000.000 (tres socios × $3.000.000), marcado pagado con
    // fecha de caja 10/08 — cuatro días DESPUÉS del corte del extracto. El libro lo emitía REAL, y un
    // REAL no lo mira ninguna de las vistas de proyección porque se asume que ya está en el saldo del
    // banco. No estaba: el extracto termina en el corte. Nueve millones invisibles.
    //
    // La regla es la misma que `caja-canales.mjs` ya aplica a Compras y sale de ahí para que no
    // puedan discrepar: sin instrumento declarado —que es el caso de la nómina, la planilla no dice
    // cómo se pagó— un pago con fecha posterior al corte es un COMPROMISO, no un hecho.
    out.push(...partirContraElExtracto({ ...comun, fecha, importe }, { corte, extracto, bloque, i, aviso }))
  }
  return out
}

/**
 * NÚCLEO PURO: un pago declarado HECHO se parte en la parte que el extracto respalda y la que no.
 *
 * Sin extracto, o sin respaldo único, devuelve UN movimiento con el estado que corresponde por fecha
 * (`estadoDeEgreso`) — que ya es el arreglo del defecto: el compromiso vuelve a estar visible. El
 * respaldo sólo lo AFINA, pasando a REAL la parte que el banco prueba que salió.
 */
function partirContraElExtracto(base, { corte, extracto, bloque, i, aviso }) {
  const estado = estadoDeEgreso({ instrumento: 'desconocido', pagado: true, fecha: base.fecha, corte })
  if (estado === 'REAL' || !extracto?.debitos?.length) return [movimiento({ ...base, estado })]
  const r = respaldoEnLote(base.importe, base.fecha, extracto.debitos,
    { corte: extracto.corte, usados: extracto.usados })
  if (!r.cubierto) {
    aviso(`libro-extractores-nomina(${bloque}): el renglón ${i + 1} dice PAGADO $${base.importe} con fecha `
      + `${isoDeSerial(base.fecha)}, posterior al corte del extracto. Queda COMPROMETIDO entero: ${r.motivo}.`)
    return [movimiento({ ...base, estado })]
  }
  // El débito respaldó a este movimiento y no puede respaldar a otro: se marca consumido. Sin esto,
  // dos bloques de la misma planilla podrían reclamar los mismos $3.000.000 y el libro daría por
  // pagada plata que salió una sola vez.
  for (const fila of r.filas) extracto.usados?.add(fila)
  const resto = Math.round((base.importe - r.cubierto) * 100) / 100
  const ms = [movimiento({
    ...base,
    fecha: r.fecha,
    importe: r.cubierto,
    estado: 'REAL',
    concepto: `${base.concepto} · ${r.motivo}`,
    origen: { ...base.origen, fila: `${base.origen.fila}:real` },
  })]
  if (resto > 0) {
    ms.push(movimiento({
      ...base,
      importe: resto,
      estado,
      origen: { ...base.origen, fila: `${base.origen.fila}:pendiente` },
    }))
  }
  return ms
}

/** Por defecto el aviso va a la consola; los tests le inyectan un colector para poder afirmarlo. */
const avisoPorDefecto = (m) => console.warn(m)

/** OFICINA (bloque "Oficina 26" de la planilla) → sueldos de administración. */
export function deOficina(bloque = {}, corte = null, { aviso = avisoPorDefecto, extracto = null } = {}) {
  return deBloqueMensual(bloque, corte, { bloque: 'Oficina', aviso, extracto })
}

/**
 * DIRECCIÓN → la otra mitad de la misma línea de nómina.
 *
 * Son los retiros mensuales de Jorge Echegaray, Rodrigo Echegaray y Jorge Corona. OJO al conciliar
 * contra el extracto: el débito del retiro NO lleva el nombre del socio — el de Jorge Corona sale
 * "A ana laura echegaray ovi" (confirmado por el dueño, 06/08/2026). Por eso el respaldo bancario
 * (libro-respaldo-banco.mjs) matchea por lote monto+día y nunca por identidad. Existían sólo en
 * Compras y una sola vez (julio, a pagar el 10/08), así que de septiembre a diciembre el cuadro
 * proyectaba $3.000.000/mes contra $9.800.000 reales: **$26.000.000 de egreso que nadie veía**. La
 * pestaña los proyecta desde el 01/08 y ésta es la puerta por la que entran al libro.
 */
export function deDireccion(bloque = {}, corte = null, { aviso = avisoPorDefecto, extracto = null } = {}) {
  return deBloqueMensual(bloque, corte, { bloque: 'Dirección', aviso, extracto })
}
