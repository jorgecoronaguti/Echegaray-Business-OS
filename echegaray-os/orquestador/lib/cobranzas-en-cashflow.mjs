// LA TRAZABILIDAD DE CADA COBRO HASTA SU CELDA DEL CASH FLOW.
//
// POR QUÉ EXISTE (21/07). "Hay montos que salen en Cobranzas que tienen fechas actualizadas y no se
// están viendo reflejados los cambios en cash flows y demás."
//
// Comparar totales no sirve para contestar eso: el total de las tres líneas de ingreso cuadraba al
// peso con la pestaña y aun así la pregunta seguía abierta, porque DOS ERRORES QUE SE COMPENSAN DAN
// DIFERENCIA CERO. Un cobro movido de julio a agosto y otro movido de agosto a julio se anulan en el
// gran total y arruinan las dos columnas.
//
// La reproducción tiene que ser independiente: se recalcula acá, en JavaScript, la misma
// clasificación que hace la fórmula del Sheet, y se compara mes contra mes. Si el cuadro y esta
// cuenta dicen lo mismo, la fórmula está haciendo lo que promete.

// LOS RÓTULOS DEL CUADRO SE IMPORTAN DE QUIEN LOS ESCRIBE. Transcriptos acá, el día que cambie uno
// este control seguiría buscando el texto viejo y volvería a no encontrar nada — que es la forma en
// que ya falló, sólo que con números de fila en vez de con textos.
import { ROTULO_CONCEPTO } from './cash-flow-matriz.mjs'
import { rotuloSub } from './cash-flow-rubros.mjs'
// EL LADO —real o proyectado— ES UN CONCEPTO PROPIO Y VIVE EN SU ARCHIVO. Acá se usa; allá se define
// contra las MEDIDAS de la matriz, que son las que deciden qué línea suma qué estado.
import {
  LADOS, LADO_POR_ROTULO, ROTULOS_INGRESO, parLados, totalDeLados, ladoDeCobro, veredictoDelLado, culpables,
} from './cobranzas-lado.mjs'
import { esCobrado, esPendiente } from './cobranzas-repaso.mjs'
import { cruzarConElBanco } from './cobranzas-respaldo-banco.mjs'
// LA VALUACIÓN ES LA MISMA FUNCIÓN QUE USA EL EXTRACTOR DEL LIBRO, importada y no copiada. Los dos
// lados de esta comparación tienen que hablar la misma moneda o el control mide su propia diferencia
// de criterio en vez de medir el dato (ver el bloque de la fila 62 más abajo).
import { valuarEnPesos, COL_MONEDA_COBRANZAS, instrumentoDeCobro } from './cobranzas-contrato.mjs'
import { colIndex } from './rubro-caja.mjs'
// El NOMBRE del rango con nombre del dólar, importado y no transcrito: es la marca por la que se
// reconoce una fila atada a la cotización (ver `atadaAlDolar`).
import { RANGO_TC } from './tipo-cambio.mjs'

// Los dos conceptos que contienen cobranzas —lo ya cobrado y lo esperado— y los dos predicados que
// parten el universo, re-exportados para que ningún llamador tenga que saber que se mudaron.
export { ROTULOS_INGRESO, LADOS } from './cobranzas-lado.mjs'
export { esCobrado, esPendiente, repasar, porMes } from './cobranzas-repaso.mjs'

/** La sub-línea del rubro Cobranzas, tal como la escribe la matriz ("· Cobranzas"). */
export const SUB_COBRANZAS = rotuloSub('Cobranzas').trim()

/** Las columnas de Cobranzas, por índice desde A=0. Verificadas contra el encabezado del 21/07;
 *  comprobante/emisión agregados el 04/08 y reverificados contra la fila 4 real. */
export const C = {
  emision: 2, comprobante: 4, unidad: 5, cliente: 6, concepto: 8,
  total: 12, forma: 13, estado: 14, fechaVenta: 15, fechaCobro: 16,
  // La letra se IMPORTA del contrato de Cobranzas (`COL_MONEDA_COBRANZAS`) en vez de transcribir el
  // 26: el día que la columna se mueva, se mueve en un solo lugar y los dos lados siguen mirando la
  // misma celda. Es el mismo respaldo posicional que usa el extractor del Libro.
  moneda: colIndex(COL_MONEDA_COBRANZAS),
  banco: 53,
}
/** La marca que el OS escribe cuando el banco dice que el valor se entregó a un tercero. */
export const MARCA_ENDOSADO = 'ENDOSADO'

/**
 * Serial de Sheets → Date (UTC). El día 0 es el 30/12/1899.
 *
 * EL VACÍO NO ES EL DÍA CERO. `Number(null)` y `Number('')` dan 0, que es una fecha válida —el
 * 30/12/1899— así que sin este filtro toda celda sin número se convierte en un mes de 1899. Pasó de
 * verdad: la columna "Total 2026" del cuadro entró a la auditoría como un mes más y reportó un
 * desvío de $442.197.707 que no existía.
 */
export const aFecha = (serial) => {
  if (serial === null || serial === undefined || serial === '') return null
  const n = Number(serial)
  return Number.isFinite(n) && n > 0 ? new Date(Date.UTC(1899, 11, 30) + n * 86400000) : null
}

const mesDe = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * NÚCLEO PURO: un cobro, tal como lo ve el libro que alimenta el cash flow.
 *
 * ═══ EL MES DE IMPUTACIÓN SALE DE "Fecha cobro" Y DE NINGUNA OTRA (14/08/2026) ═══
 *
 * `fecha` conserva el respaldo a la Fecha de Venta porque el repaso de cartera lo necesita para
 * decir qué está vencido. Pero `mes` —la columna del cuadro donde cae el peso— sale SÓLO de
 * `Fecha cobro`, que es lo que hace `deCobranzas` en el libro (`fechaEsperada` y `fechaReal`
 * resuelven al MISMO rótulo "Fecha cobro", y una fila sin ese dato no produce movimiento).
 *
 * Por qué el respaldo estaba mal para imputar: la Fecha de Venta es la fecha de la factura, o sea
 * DEVENGADO. Usarla para elegir la columna de un cuadro PERCIBIDO mezcla las dos ventanas —regla de
 * oro 3 y 5— y, peor, imputa a un mes lo que el libro no imputa a ninguno: dos criterios distintos
 * para el mismo cobro, que es exactamente el desvío que este archivo audita. Hoy no hay ninguna fila
 * así en el archivo vivo (medido: 0 de 90); mañana la primera pasa sin gritar.
 *
 * ═══ UN COBRO EN DÓLARES NO ES UN COBRO EN PESOS ═══
 *
 * MEDIDO EL 14/08 CONTRA EL ARCHIVO VIVO. Cobranzas f62, Quattropani · Melisa García SAS, U$S 15.400
 * con fecha de cobro 31/07. El libro lo valúa —`_MOVIMIENTOS` L839 dice $22.972.595,80— y este
 * auditor leía la columna M cruda: $15.400. Julio marcaba ⚠ $22.957.196 de desvío contra el cuadro y
 * el desvío no existía: el auditor estaba comparando pesos contra dólares. El total general cerraba
 * igual porque el mismo error aparecía de los dos lados del gran total.
 *
 * SIN TIPO DE CAMBIO NO SE INVENTA UNO: la fila queda marcada `sinValuar` con su motivo y `auditar`
 * la saca del mes y la declara. Contarla al valor nominal es repetir el defecto en silencio.
 *
 * @param {Array<object>} fila la fila de la grilla de Cobranzas
 * @param {number} nro el número de fila del archivo, para poder ir a mirarla
 * @param {{tipoCambio: number|null}} opciones el `TIPO_CAMBIO_USD` del archivo
 */
export function leerCobro(fila, nro, { tipoCambio = null } = {}) {
  const num = (j) => (fila[j]?.numero ?? null)
  const txt = (j) => String(fila[j]?.valor ?? '').trim()
  const bruto = num(C.total)
  if (!bruto) return null
  const fechaCobro = aFecha(num(C.fechaCobro))
  const f = fechaCobro ?? aFecha(num(C.fechaVenta))
  const val = valuarEnPesos(bruto, fila[C.moneda]?.valor, tipoCambio)
  const pesos = val.motivo ? bruto : val.pesos
  // EL NOMINAL EN DÓLARES, POR LAS DOS PUERTAS: la columna "Moneda" (que ya trae el nominal crudo) y
  // la fórmula atada a `TIPO_CAMBIO_USD` (donde el nominal hay que despejarlo de los pesos). Queda en
  // UN solo campo para que `clasificar` no tenga que saber por cuál de las dos entró.
  const nominalUsd = (() => {
    if (val.moneda === 'USD') return val.motivo ? null : bruto
    if (!val.motivo && atadaAlDolar(fila) && Number.isFinite(tipoCambio) && tipoCambio > 0) {
      return pesos / tipoCambio
    }
    return null
  })()
  const cobro = {
    fila: nro,
    // `monto` habla SIEMPRE en pesos —es lo que se compara contra el cuadro—; `montoOrigen` y
    // `moneda` guardan de dónde salió, para poder desmentir el número sin volver al Sheet.
    monto: pesos,
    montoOrigen: bruto,
    // `null` cuando la fila es en pesos de verdad. NO es `0`: un cero se lee como "cero dólares", que
    // es una afirmación, y acá lo que corresponde decir es "esta fila no cotiza".
    nominalUsd,
    moneda: val.moneda,
    tipoCambio: val.tipoCambio ?? null,
    sinValuar: val.motivo ?? null,
    unidad: txt(C.unidad).toLowerCase(),
    cliente: txt(C.cliente),
    estado: txt(C.estado),
    fecha: f,
    fechaCobro,
    // EL SERIAL CRUDO, ADEMÁS DEL Date. El extracto (`_BANCO_RAW`) habla en seriales de Sheets, y
    // convertir de un lado y del otro sería tener dos criterios de huso para el mismo día: un cobro
    // del 1° a las 00:00 UTC puede ser el 31 en otra conversión. Se compara serial contra serial.
    serialCobro: num(C.fechaCobro),
    fechaVenta: aFecha(num(C.fechaVenta)),
    mes: fechaCobro ? mesDe(fechaCobro) : null,
    comprobante: txt(C.comprobante),
    concepto: txt(C.concepto),
    forma: txt(C.forma),
    // El instrumento decide si este cobro TIENE que aparecer en el extracto (ver
    // `deberiaEstarEnElBanco`). La traducción es la del contrato de la pestaña, no una copia.
    instrumento: instrumentoDeCobro(txt(C.forma)),
    endosado: txt(C.banco).toUpperCase().startsWith(MARCA_ENDOSADO),
    // El texto crudo de "Valor banco" viaja con el cobro: es lo que permite decir, sin volver al
    // Sheet, si este "Cobrado" tiene respaldo del extracto o sólo la palabra de la pestaña.
    valorBanco: txt(C.banco),
  }
  // El LADO se resuelve una vez, acá, y viaja con el cobro. Calculado en cada uso, la primera copia
  // que se olvide de excluir el endosado inventa un ingreso — y el cuadre mediría ese olvido.
  return { ...cobro, lado: ladoDeCobro(cobro, { esCobrado, esPendiente }) }
}

/**
 * ¿LOS PESOS DE ESTA FILA SE MUEVEN CON EL DÓLAR, AUNQUE LA COLUMNA "Moneda" ESTÉ VACÍA?
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (28/08/2026) ═══
 *
 * El pipeline venía fallando desde el 25/08 con "el cuadro afirma un cobro que Cobranzas no dice", y
 * el cuadro no afirmaba nada de más: cada peso salía de Cobranzas, fila por fila. Cobranzas 78–86
 * (Quattropani, nueve quincenas proyectadas) tienen la columna "Moneda" VACÍA y su importe escrito
 * como `=3500*TIPO_CAMBIO_USD` más IVA. Es una fila en dólares que no lo declara donde el OS mira.
 *
 * Como no lo declara, los dos lados la leían como pesos estáticos — y no lo es: el LIBRO congela el
 * valor cuando se genera y el cuadre RELEE la pestaña dos minutos después, con la cotización ya
 * movida. Medido: la misma celda M78 dio $6.404.243,23, $6.402.329,01 y $6.402.223,135 en tres
 * lecturas de la misma mañana. La diferencia era $3.921,61 por mes (×1,5 en diciembre, que tiene tres
 * quincenas en vez de dos): `nominal × Δtc`, ni un peso más.
 *
 * `DERIVA_TC` existe exactamente para eso y no se activaba, porque `veredictoDelLado` pregunta "¿este
 * lado tiene dólares?" al acumulador `usd`, que se llena desde la columna "Moneda". Con la columna
 * vacía el mes caía en la regla estricta de un peso — y contra 38.115 dólares nominales, un
 * movimiento de la cotización de $0,000027 ya la rompe. El control no comparaba dos cifras en pesos:
 * comparaba una foto contra la misma fórmula revaluada, creyendo que las dos eran estáticas.
 *
 * POR QUÉ SE MIRA LA FÓRMULA Y NO SE ARREGLA LA COLUMNA "Moneda". Porque marcar AA="USD" haría que
 * `valuarEnPesos` multiplique OTRA VEZ por el tipo de cambio un importe que la fórmula ya convirtió:
 * la fila quedaría valuada al cuadrado. El peso está declarado donde el dueño lo escribió —en la
 * fórmula— y ahí es donde hay que leerlo.
 *
 * POR QUÉ ALCANZA CON QUE LO MENCIONE CUALQUIER CELDA DE LA FILA. `TIPO_CAMBIO_USD` es el único
 * ancla al dólar del archivo: una fila que lo nombra es una fila cuyos pesos se mueven solos. Un
 * falso positivo no afloja el control hasta dejarlo pasar cualquier cosa — sólo cambia la regla del
 * mes de "un peso" a "el tipo de cambio implícito, dentro de `DERIVA_TC`", y un cobro imputado al mes
 * equivocado sigue cayendo porque produce un implícito absurdo, no una deriva de cotización.
 *
 * @param {Array<object>} fila la fila de la grilla de Cobranzas (celdas con `.formula`)
 */
export const atadaAlDolar = (fila = []) =>
  fila.some((c) => typeof c?.formula === 'string' && c.formula.includes(RANGO_TC))

/**
 * NÚCLEO PURO: los meses que muestra el cuadro, leídos de su fila de encabezado.
 * Se leen del Sheet en vez de asumir doce columnas de un año: el día que el cuadro cambie de ventana
 * —o arranque en otro mes— una lista fija empezaría a comparar contra columnas que no existen.
 */
export function mesesDelCuadro(filaEncabezado = []) {
  const out = []
  filaEncabezado.forEach((c, j) => {
    if (j === 0) return
    const d = aFecha(c?.numero)
    if (d) out.push({ col: j, mes: mesDe(d) })
  })
  return out
}

/**
 * NÚCLEO PURO: DÓNDE ESTÁ CADA COSA EN EL CUADRO — buscando su RÓTULO, nunca contando filas.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (14/08/2026) ═══
 *
 * El auditor leía `'Cash Flow Mensual'!A3:N9` y daba por hecho dos cosas: que la fila 3 era el
 * encabezado de meses y que las tres últimas del rango eran las líneas de ingreso. Las dos dejaron de
 * ser ciertas el 06/08, cuando las vistas pasaron a matriz: el encabezado se fue a la fila 7 y las
 * tres líneas (civil / mantenimiento / otras) se unificaron en "· Cobranzas" bajo ingresos reales y
 * bajo proyectados. No hubo error: leyó el subtítulo como encabezado, no reconoció NINGÚN mes, y
 * entonces TODO cobro cayó en "su mes no es una columna del cuadro" — $808.990.000 de falso positivo
 * contra un residuo real de $771. Un control que grita mal enseña a ignorarlo.
 *
 * Acá no se cuenta ni una fila: la cabecera es la que dice `Concepto` en su columna A, y las líneas
 * de ingreso son las sub-líneas `· Cobranzas` que cuelgan de los dos conceptos de ingreso. Los tres
 * rótulos se IMPORTAN del vocabulario que usa el generador — no se transcriben.
 *
 * @param {Array<Array<object>>} filas grilla del cash flow LEÍDA DESDE LA FILA 1
 * @returns {{cabecera:number|null, meses:{col:number,mes:string}[], ingreso:{fila:number,de:string}[]}}
 */
export function ubicarCuadro(filas = []) {
  const crudo = (i) => String(filas[i]?.[0]?.valor ?? '')
  const cabecera = filas.findIndex((f) => String(f?.[0]?.valor ?? '').trim() === ROTULO_CONCEPTO)
  if (cabecera < 0) return { cabecera: null, meses: [], ingreso: [] }

  const ingreso = []
  let concepto = null
  for (let i = cabecera + 1; i < filas.length; i++) {
    const t = crudo(i)
    if (!t.trim()) continue
    // Una sub-línea se reconoce por su viñeta (`rotuloSub`), no por la sangría: el ancho de la
    // sangría es decoración y cambiarla no debería mover un control.
    if (/^\s*·/.test(t)) {
      if (concepto && ROTULOS_INGRESO.includes(concepto) && t.trim() === SUB_COBRANZAS) {
        ingreso.push({ fila: i, de: concepto })
      }
    } else concepto = t.trim()
  }
  return { cabecera, meses: mesesDelCuadro(filas[cabecera] ?? []), ingreso }
}

/** La tolerancia del cuadre. Un peso: por debajo es ruido de coma flotante, por encima es un dato. */
export const TOLERANCIA = 1

/**
 * ═══ LO ÚNICO QUE SE TOLERA, Y POR QUÉ NO ES UN UMBRAL EN PESOS (14/08/2026) ═══
 *
 * `TIPO_CAMBIO_USD` es una cotización VIVA. Medido: dos lecturas del mismo rango con 15 minutos de
 * diferencia dieron 1.491,766 y 1.492,521. El libro congela el valor cuando se genera y el cuadre
 * lee el de ahora, así que un mes con dólares arrastra `nominal × Δtc` de residuo sin que nadie se
 * haya equivocado en nada. En julio eso fueron $12.228 sobre U$S 15.400.
 *
 * UN UMBRAL EN PESOS SERÍA LA FORMA DE PERDER ESTO OTRA VEZ. Habría que ponerlo lo bastante alto para
 * que el pipeline no aborte solo —decenas de miles— y ese colchón se lo come cualquier desvío chico
 * de imputación. Peor: cuando el volumen en dólares crezca, el colchón que hoy alcanza deja de
 * alcanzar y el primer reflejo es subirlo. Es exactamente cómo un control se convierte en adorno.
 *
 * Entonces el mes con dólares NO se compara en pesos: se despeja el TIPO DE CAMBIO IMPLÍCITO en el
 * cuadro y se exige que esté cerca del que declara el archivo. Un cobro imputado a otro mes no
 * produce una deriva de cotización: produce un implícito absurdo. Medio punto porcentual es más de lo
 * que el dólar se mueve en los minutos que separan al libro de las vistas dentro de una corrida.
 */
export const DERIVA_TC = 0.005

/**
 * NÚCLEO PURO: cada cobro, a su balde y a su mes.
 *
 * Devuelve los HUECOS —la plata que el cuadre no puede comparar y por eso hay que declarar— y los
 * ACUMULADOS por mes que alimentan el veredicto. Los dos conciliadores se acumulan aparte del bruto
 * porque la igualdad que se exige los necesita separados, no netos.
 *
 * @param {Array<object>} cobros salida de `leerCobro`
 * @param {Array<{mes:string}>} meses las columnas que muestra el cuadro
 */
export function clasificar(cobros = [], meses = []) {
  const huecos = { fueraDeVentana: [], endosados: [], sinUnidad: [], sinFecha: [], sinValuar: [], devoluciones: [] }
  // CADA ACUMULADOR ES UN PAR {real, proyectado}, NO UN NÚMERO. Ésta es la corrección entera: sumar
  // los dos lados antes de comparar hace que una fila que cambia de lado no mueva el resultado.
  const cero = () => new Map(meses.map((m) => [m.mes, parLados()]))
  // `ars` y `usd` parten lo COMPARABLE por moneda: los pesos se comparan al peso y los dólares por su
  // tipo de cambio implícito (ver `DERIVA_TC`). El nominal en dólares se guarda EN DÓLARES: valuarlo
  // acá volvería a meter la cotización de ahora dentro de la cuenta.
  const acum = { bruto: cero(), endosado: cero(), devolucion: cero(), ars: cero(), usd: cero() }
  // El lado de un endosado o de una devolución es el que le tocaría por su estado: es del lado del
  // que hay que restarlo. Sin lado (un estado que no es ni cobrado ni pendiente) no suma en ninguno.
  const sumar = (mapa, mes, lado, v) => { if (lado) mapa.get(mes)[lado] += v }

  for (const c of cobros) {
    // EL ORDEN IMPORTA. `sinValuar` va primero: un dólar contado como peso no se arregla sabiendo en
    // qué mes cae. Antes de saber DÓNDE va, hay que saber CUÁNTO es.
    if (c.sinValuar) { huecos.sinValuar.push({ ...c, motivo: c.sinValuar }); continue }
    // Y `mes` —no `fecha`— es lo que decide la columna: sin Fecha cobro el cuadro no sabe cuándo entra,
    // tenga o no fecha de factura. La de factura es devengado y no imputa caja.
    if (!c.mes) {
      huecos.sinFecha.push({ ...c, motivo: c.fechaVenta ? 'sin Fecha cobro (sólo tiene Fecha de Venta, que es devengado)' : 'sin fecha de cobro ni de venta' })
      continue
    }
    if (!acum.bruto.has(c.mes)) { huecos.fueraDeVentana.push({ ...c, motivo: `su mes (${c.mes}) no es una columna del cuadro` }); continue }
    // UN ENDOSADO NO TIENE LADO —no entra por ninguna de las dos líneas— pero SÍ tiene que restarse
    // del lado donde su estado lo habría puesto: es la resta que hace cerrar ese lado. Por eso el
    // lado se recalcula acá ignorando la marca de endoso, en vez de usar `c.lado`, que es null.
    const lado = c.lado ?? (esCobrado(c) ? 'real' : 'proyectado')
    if (c.endosado) { huecos.endosados.push({ ...c, motivo: 'el banco dice que se entregó a un tercero' }); sumar(acum.endosado, c.mes, lado, c.monto) }
    else if (c.monto < 0) { huecos.devoluciones.push({ ...c, motivo: 'cobro negativo: el libro lo emite como egreso' }); sumar(acum.devolucion, c.mes, lado, c.monto) }
    else {
      if (!c.unidad) huecos.sinUnidad.push({ ...c, motivo: 'la columna Unidad está vacía' })
      // EL BALDE LO DECIDE `nominalUsd`, NO LA COLUMNA "Moneda". Una fila atada a la cotización por
      // fórmula cotiza igual que una que lo declara, y el balde `usd` es el que hace que el mes se
      // juzgue por el tipo de cambio implícito (`DERIVA_TC`) en vez de por el peso exacto.
      const enDolares = c.nominalUsd != null
      sumar(enDolares ? acum.usd : acum.ars, c.mes, lado, enDolares ? c.nominalUsd : c.monto)
    }
    sumar(acum.bruto, c.mes, lado, c.monto)
  }
  return { huecos, acum }
}

/**
 * NÚCLEO PURO: el veredicto de UN mes — REAL contra REAL, PROYECTADO contra PROYECTADO, y el total.
 *
 * ═══ POR QUÉ EL TOTAL NO ALCANZA, Y POR QUÉ IGUAL SE CALCULA (15/08/2026) ═══
 *
 * El total es la suma de los dos lados: una fila que se mueve de real a proyectado no lo mueve ni un
 * peso. Ése era el defecto — `✓ los 12 meses cierran` con la fila 44 del lado equivocado.
 *
 * Se sigue calculando porque contesta otra pregunta: si el total tampoco cierra, hay plata que
 * aparece o desaparece, y eso no es un problema de reparto. El informe necesita poder distinguir
 * "está mal ubicada" de "no está".
 *
 * Vive aparte de `auditar` porque es la aritmética que hay que poder leer sin el ruido de la
 * clasificación —y la que hay que poder testear con números escritos a mano, sin armar una grilla.
 *
 * @param {string} mes clave AAAA-MM
 * @param {object} n los acumulados del mes, cada uno un par `{real, proyectado}`: `bruto` (todo,
 *   valuado), `endosado`, `devolucion`, `cashflow` (las dos líneas del cuadro), `ars` y `usd` (lo
 *   COMPARABLE, partido por moneda; `usd` en dólares nominales), y el `tipoCambio` del archivo.
 */
export function veredictoDelMes(mes, { bruto, endosado, devolucion, cashflow, ars, usd, tipoCambio }) {
  const opciones = { tolerancia: TOLERANCIA, deriva: DERIVA_TC }
  const uno = (lado) => veredictoDelLado({
    bruto: bruto[lado], endosado: endosado[lado], devolucion: devolucion[lado],
    cashflow: cashflow[lado], ars: ars[lado], usd: usd[lado], tipoCambio,
  }, opciones)
  const lados = Object.fromEntries(LADOS.map((l) => [l, uno(l)]))
  const total = veredictoDelLado({
    bruto: totalDeLados(bruto), endosado: totalDeLados(endosado), devolucion: totalDeLados(devolucion),
    cashflow: totalDeLados(cashflow), ars: totalDeLados(ars), usd: totalDeLados(usd), tipoCambio,
  }, opciones)
  return {
    mes,
    lados,
    // `difLados` se llama distinto de `dif` A PROPÓSITO: `dif` es el número del TOTAL y lo lee el
    // informe. Un solo nombre para las dos cosas es cómo se cuela el defecto que este archivo arregla.
    difLados: { real: lados.real.dif, proyectado: lados.proyectado.dif },
    // Los nombres planos del total se conservan porque los lee el informe y los tests del cuadre
    // histórico: lo que cambió es que ya NO son el veredicto, sólo uno de sus tres componentes.
    ...total,
    ok: total.ok && LADOS.every((l) => lados[l].ok),
  }
}

/**
 * NÚCLEO PURO: la auditoría completa.
 *
 * ═══ LA IGUALDAD QUE TIENE QUE CERRAR, Y POR QUÉ NO ES CERO (14/08/2026) ═══
 *
 * Por cada mes:  bruto de Cobranzas − endosado − devoluciones = línea "· Cobranzas" del cuadro
 *
 * Las dos restas NO son errores, son diferencias legítimas y cada una tiene su motivo:
 *
 *   · ENDOSADO — el valor se cobró y se entregó a un tercero sin pasar por la cuenta. `deCobranzas` lo
 *     excluye del libro por dos puertas (la marca del dueño en "Valor banco" y `_CHEQUES_RAW`). Está
 *     bien que el cuadro no lo muestre: nunca va a haber ese dinero en el banco. Sigue contando en
 *     `Obras!D14`, que es cobranza de la obra, no caja.
 *
 *   · DEVOLUCIÓN — un cobro NEGATIVO es plata que vuelve. El libro lo emite con signo de egreso y cae
 *     en "Egresos reales · Otros" (ver `ladoDe` en cash-flow-rubros): no está perdido, está del otro
 *     lado. Sumarlo a la línea de ingresos restaría de lo que la empresa cobró, que no es lo que pasó.
 *
 * Exigir diferencia CERO obligaría a mentir en alguno de los dos lados. Exigir que la diferencia sea
 * EXACTAMENTE la suma de los dos conciliadores del mes es lo que convierte esto en un control: si
 * aparece un peso que ninguno de los dos explica, algo se imputó distinto en cada camino.
 *
 * ═══ Y UNA TERCERA COMPARACIÓN QUE NO ES CONTRA EL CUADRO (15/08/2026) ═══
 *
 * Con `filasBanco` se cruza cada "Cobrado" contra el extracto (`_BANCO_RAW`). Un cobro que el
 * extracto no respalda está sumando en INGRESOS REALES —plata que ya está en la cuenta— cuando es, en
 * el mejor de los casos, devengado. El Flujo va por percibido: esa distinción es el criterio entero.
 *
 * NO BAJA EL VEREDICTO, Y ES A PROPÓSITO. `ok` gobierna si la publicación aborta (`cash-flow-vistas`
 * la usa como portón). Un cobro sin respaldo no es un cuadro mal calculado: es un dato que sólo el
 * dueño o una importación del banco pueden cerrar. Abortar la publicación de las dos vistas hasta que
 * alguien concilie deja el cash flow viejo en pantalla y termina con el control apagado — que es
 * exactamente cómo se pierde un control. Se declara fuerte, en la pestaña y en el informe, siempre.
 *
 * @param {Array<Array<object>>} filasCob grilla de Cobranzas desde la fila 5
 * @param {Array<Array<object>>} filasCf grilla del cash flow DESDE LA FILA 1 (ver ubicarCuadro)
 * @param {{tipoCambio: number|null, filasBanco: Array|null}} opciones el `TIPO_CAMBIO_USD` con el que
 *   se valúan los dólares y, si se pasa, `_BANCO_RAW` para el cruce de respaldo.
 */
export function auditar(filasCob = [], filasCf = [], { tipoCambio = null, filasBanco = null } = {}) {
  const cobros = []
  filasCob.forEach((f, i) => { const c = leerCobro(f, i + 5, { tipoCambio }); if (c) cobros.push(c) })
  // El cruce bancario se hace ANTES del portón de ubicación: no depende del cuadro, y un cuadro que
  // no se pudo ubicar no es motivo para dejar de decir qué "Cobrado" no tiene respaldo.
  const respaldo = filasBanco ? cruzarConElBanco(cobros, filasBanco, { esCobrado }) : null

  const { cabecera, meses, ingreso } = ubicarCuadro(filasCf)
  // FALLA CERRADA. Sin cabecera no hay ventana de meses, y sin ventana este auditor declara que TODO
  // está fuera del cuadro — que es exactamente el falso positivo de $808,99M. Un control que no pudo
  // ubicar lo que audita tiene que decir que no pudo, no producir un hallazgo fabricado.
  if (cabecera === null || !meses.length || !ingreso.length) {
    return {
      cobros, meses, ingreso, noPudoUbicar: cabecera === null
        ? `no encontré la fila "${ROTULO_CONCEPTO}" en la columna A del cuadro`
        : (!meses.length ? 'la fila de cabecera no tiene ninguna columna con fecha de mes'
          : `no encontré ninguna línea "${SUB_COBRANZAS}" bajo ${ROTULOS_INGRESO.join(' / ')}`),
      totalCobranzas: cobros.reduce((s, c) => s + c.monto, 0), totalCashFlow: 0,
      fueraDeVentana: [], endosados: [], sinUnidad: [], sinFecha: [], sinValuar: [],
      devoluciones: [], porMes: [], respaldo, cobradoSinRespaldo: respaldo?.sinRespaldo ?? [], ok: false,
    }
  }

  // CADA LÍNEA A SU LADO. `ingreso[].de` trae el rótulo del concepto del que cuelga la sub-línea, y
  // `LADO_POR_ROTULO` lo traduce contra las MEDIDAS. Antes las dos se sumaban acá mismo, en un solo
  // acumulador: por eso una fila del lado equivocado no movía el número y el control decía ✓.
  const enCuadro = new Map(meses.map((m) => [m.mes, parLados()]))
  for (const { fila, de } of ingreso) {
    const lado = LADO_POR_ROTULO.get(de)
    if (!lado) continue
    for (const m of meses) enCuadro.get(m.mes)[lado] += (filasCf[fila]?.[m.col]?.numero ?? 0)
  }

  const { huecos, acum } = clasificar(cobros, meses)
  const par = (mapa, mes) => mapa.get(mes) ?? parLados()
  const porMes = meses.map((m) => {
    const v = veredictoDelMes(m.mes, {
      bruto: par(acum.bruto, m.mes), endosado: par(acum.endosado, m.mes),
      devolucion: par(acum.devolucion, m.mes), cashflow: par(enCuadro, m.mes),
      ars: par(acum.ars, m.mes), usd: par(acum.usd, m.mes), tipoCambio,
    })
    // EL CONTROL NOMBRA LA FILA. Sólo cuando falla: buscar candidatas en un mes que cierra sería
    // ruido, y las candidatas de un mes verde no existen.
    const culpa = v.ok ? [] : culpables(cobros.filter((c) => c.mes === m.mes), v.difLados, { tolerancia: TOLERANCIA })
    return { ...v, culpables: culpa }
  })
  const { fueraDeVentana, sinValuar, sinFecha } = huecos

  return {
    cobros,
    meses,
    ingreso,
    noPudoUbicar: null,
    totalCobranzas: cobros.reduce((s, c) => s + c.monto, 0),
    totalCashFlow: [...enCuadro.values()].reduce((s, v) => s + totalDeLados(v), 0),
    ...huecos,
    porMes,
    // El cruce contra el extracto viaja entero (para poder desmentirlo) y además con su lista corta:
    // los "Cobrado" que el banco NO respalda, que es el aviso que se escribe en la pestaña.
    respaldo,
    cobradoSinRespaldo: respaldo?.sinRespaldo ?? [],
    // El veredicto NO es sólo el de los meses. Una fila que no se pudo valuar o que quedó fuera de la
    // ventana no descuadra ningún mes justamente porque se la sacó: si además no bajara el veredicto,
    // el control estaría premiando el haberla escondido.
    ok: porMes.every((m) => m.ok) && !sinValuar.length && !fueraDeVentana.length && !sinFecha.length,
  }
}
