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
import { CONCEPTOS, ROTULO_CONCEPTO } from './cash-flow-matriz.mjs'
import { rotuloSub } from './cash-flow-rubros.mjs'
// LA VALUACIÓN ES LA MISMA FUNCIÓN QUE USA EL EXTRACTOR DEL LIBRO, importada y no copiada. Los dos
// lados de esta comparación tienen que hablar la misma moneda o el control mide su propia diferencia
// de criterio en vez de medir el dato (ver el bloque de la fila 62 más abajo).
import { valuarEnPesos, COL_MONEDA_COBRANZAS } from './cobranzas-contrato.mjs'
import { colIndex } from './rubro-caja.mjs'

/** Los dos conceptos que contienen cobranzas: lo ya cobrado y lo esperado. */
export const ROTULOS_INGRESO = ['ingresoReal', 'ingresoProyectado']
  .map((clave) => CONCEPTOS.find((c) => c.clave === clave).rotulo)

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
  return {
    fila: nro,
    // `monto` habla SIEMPRE en pesos —es lo que se compara contra el cuadro—; `montoOrigen` y
    // `moneda` guardan de dónde salió, para poder desmentir el número sin volver al Sheet.
    monto: val.motivo ? bruto : val.pesos,
    montoOrigen: bruto,
    moneda: val.moneda,
    tipoCambio: val.tipoCambio ?? null,
    sinValuar: val.motivo ?? null,
    unidad: txt(C.unidad).toLowerCase(),
    cliente: txt(C.cliente),
    estado: txt(C.estado),
    fecha: f,
    fechaCobro,
    fechaVenta: aFecha(num(C.fechaVenta)),
    mes: fechaCobro ? mesDe(fechaCobro) : null,
    comprobante: txt(C.comprobante),
    concepto: txt(C.concepto),
    forma: txt(C.forma),
    endosado: txt(C.banco).toUpperCase().startsWith(MARCA_ENDOSADO),
  }
}

/** La condición exacta con la que el cuadro cuenta un cobro como YA COBRADO (fila 6). */
export const esCobrado = (c) => String(c.estado).toLowerCase() === 'cobrado'
/** Y la de la línea de esperadas (fila 10): ni cobrado ni endosado. */
export const esPendiente = (c) => !esCobrado(c) && String(c.estado).toLowerCase() !== 'endosado' && !c.endosado

const primeroDelMes = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

/**
 * NÚCLEO PURO: el repaso de Cobranzas que pidió el dueño — "repasar todo cobranzas e ir viendo el
 * tema de caja a fin de cada semana y mes".
 *
 * LOS CUATRO HUECOS QUE BUSCA, Y POR QUÉ CADA UNO ES PLATA QUE EL CUADRO NO MUESTRA:
 *
 *   sinFecha — un pendiente sin fecha de cobro NI de venta no cae en ninguna columna. No aparece en
 *     ninguna semana ni en ningún mes: es invisible para el cuadro y para la decisión.
 *
 *   invisiblesAlCuadro — EL HUECO CARO Y SILENCIOSO. La línea de esperadas lleva el corte
 *     `(col >= EOMONTH(TODAY();-1)+1)` para no inflar un mes ya cerrado con un cobro que no entró, y
 *     eso está bien. Pero el efecto es que un pendiente FECHADO ANTES del mes en curso desaparece de
 *     las dos líneas: no es cobrado (no entró) y su columna está apagada. La empresa sigue esperando
 *     esa plata y el cuadro no la muestra en ningún lado. NO se corrige acá: dónde debe reaparecer
 *     —el mes en curso, una línea de vencidos, o nada hasta renegociar la fecha— es una decisión del
 *     dueño con efecto económico. Acá se mide y se declara.
 *
 *   vencidos — pendientes con fecha pasada que siguen pendientes. Incluye a los invisibles y además
 *     a los del mes en curso, que el cuadro sí muestra pero como si fueran a entrar.
 *
 *   cobradosAFuturo — marcados "Cobrado" con fecha de cobro POSTERIOR a hoy. El cash flow es
 *     percibido: no se puede haber cobrado algo que se cobra la semana que viene. O la fecha está
 *     mal, o el estado se adelantó; en cualquier caso el mes de ese cobro está afirmando un hecho
 *     que todavía no ocurrió.
 *
 * @param {Array<object>} cobros salida de leerCobro
 * @param {{hoy: Date|string|number}} opciones
 */
export function repasar(cobros = [], { hoy } = {}) {
  const h = new Date(hoy)
  const inicioMes = primeroDelMes(h)
  const pendientes = cobros.filter(esPendiente)
  const sinFecha = pendientes.filter((c) => !c.fecha)
  const conFecha = pendientes.filter((c) => c.fecha)
  const suma = (l) => l.reduce((s, c) => s + c.monto, 0)
  return {
    total: cobros.length,
    montoTotal: suma(cobros),
    cobrados: cobros.filter(esCobrado).length,
    pendientes: pendientes.length,
    montoPendiente: suma(pendientes),
    sinFecha,
    vencidos: conFecha.filter((c) => c.fecha < h).sort((a, b) => a.fecha - b.fecha),
    invisiblesAlCuadro: conFecha.filter((c) => c.fecha < inicioMes).sort((a, b) => a.fecha - b.fecha),
    cobradosAFuturo: cobros.filter((c) => esCobrado(c) && c.fechaCobro && c.fechaCobro > h),
    montos: {
      sinFecha: suma(sinFecha),
      vencidos: suma(conFecha.filter((c) => c.fecha < h)),
      invisiblesAlCuadro: suma(conFecha.filter((c) => c.fecha < inicioMes)),
      cobradosAFuturo: suma(cobros.filter((c) => esCobrado(c) && c.fechaCobro && c.fechaCobro > h)),
    },
  }
}

/**
 * NÚCLEO PURO: reconstruye, mes por mes, las DOS líneas de ingreso del cuadro desde Cobranzas.
 *
 * Es la contraprueba de la fila 6 y la fila 10 hecha en JavaScript con la misma regla de la fórmula,
 * para poder contestar "¿la línea de cobranzas de este mes se puede reconstruir?" sin preguntarle al
 * cuadro. Un control validado contra la misma fórmula que produce el número no es un control.
 *
 * @param {Array<object>} cobros · @param {{hoy: Date|string|number}} opciones
 * @returns {Map<string,{cobrado:number, esperado:number}>} clave AAAA-MM
 */
export function porMes(cobros = [], { hoy } = {}) {
  const corte = primeroDelMes(new Date(hoy))
  const acc = new Map()
  for (const c of cobros) {
    // `mes` y `fechaCobro`, no `fecha`: el mes de imputación es el de la fecha de cobro y sólo ése
    // (ver `leerCobro`). Un cobro que sólo tiene Fecha de Venta no cae en ninguna columna acá, igual
    // que no produce movimiento en el libro.
    if (!c.mes || c.endosado) continue
    if (!acc.has(c.mes)) acc.set(c.mes, { cobrado: 0, esperado: 0 })
    if (esCobrado(c)) acc.get(c.mes).cobrado += c.monto
    // El corte de la fórmula: un esperado de un mes ya cerrado NO suma. Se replica tal cual para que
    // la comparación mida el dato, no una diferencia de criterio inventada acá.
    else if (esPendiente(c) && c.fechaCobro >= corte) acc.get(c.mes).esperado += c.monto
  }
  return acc
}

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
  const cero = () => new Map(meses.map((m) => [m.mes, 0]))
  // `ars` y `usd` parten lo COMPARABLE por moneda: los pesos se comparan al peso y los dólares por su
  // tipo de cambio implícito (ver `DERIVA_TC`). El nominal en dólares se guarda EN DÓLARES: valuarlo
  // acá volvería a meter la cotización de ahora dentro de la cuenta.
  const acum = { bruto: cero(), endosado: cero(), devolucion: cero(), ars: cero(), usd: cero() }
  const sumar = (mapa, mes, v) => mapa.set(mes, mapa.get(mes) + v)

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
    if (c.endosado) { huecos.endosados.push({ ...c, motivo: 'el banco dice que se entregó a un tercero' }); sumar(acum.endosado, c.mes, c.monto) }
    else if (c.monto < 0) { huecos.devoluciones.push({ ...c, motivo: 'cobro negativo: el libro lo emite como egreso' }); sumar(acum.devolucion, c.mes, c.monto) }
    else {
      if (!c.unidad) huecos.sinUnidad.push({ ...c, motivo: 'la columna Unidad está vacía' })
      sumar(c.moneda === 'USD' ? acum.usd : acum.ars, c.mes, c.moneda === 'USD' ? c.montoOrigen : c.monto)
    }
    sumar(acum.bruto, c.mes, c.monto)
  }
  return { huecos, acum }
}

/**
 * NÚCLEO PURO: el veredicto de UN mes, con los números que lo sostienen.
 *
 * Vive aparte de `auditar` porque es la aritmética que hay que poder leer sin el ruido de la
 * clasificación —y la que hay que poder testear con números escritos a mano, sin armar una grilla.
 *
 * @param {string} mes clave AAAA-MM
 * @param {object} n los acumulados del mes: `bruto` (todo, valuado), `endosado`, `devolucion`,
 *   `cashflow` (la línea del cuadro), `ars` y `usd` (lo COMPARABLE, partido por moneda; `usd` en
 *   dólares nominales), y el `tipoCambio` que declara el archivo.
 */
export function veredictoDelMes(mes, { bruto, endosado, devolucion, cashflow, ars, usd, tipoCambio }) {
  // `cobranzas` es lo COMPARABLE: el bruto una vez descontado lo que el cuadro no tiene por qué
  // mostrar. Los tres números viajan igual para que el informe pueda decir de dónde sale la resta.
  const cobranzas = bruto - endosado - devolucion
  const dif = cobranzas - cashflow
  // EL TIPO DE CAMBIO IMPLÍCITO: lo que el cuadro pagó por cada dólar de este mes, una vez sacada la
  // parte en pesos. Con dólares en el mes es el número que se juzga; sin dólares no existe y manda la
  // igualdad al peso, que es el caso de once de los doce meses.
  const tcImplicito = usd ? (cashflow - ars) / usd : null
  const ok = usd
    ? Boolean(tipoCambio) && Math.abs(tcImplicito - tipoCambio) <= tipoCambio * DERIVA_TC
    : Math.abs(dif) < TOLERANCIA
  return { mes, bruto, endosado, devolucion, cobranzas, cashflow, dif, ars, usd, tcImplicito, ok }
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
 * @param {Array<Array<object>>} filasCob grilla de Cobranzas desde la fila 5
 * @param {Array<Array<object>>} filasCf grilla del cash flow DESDE LA FILA 1 (ver ubicarCuadro)
 * @param {{tipoCambio: number|null}} opciones el `TIPO_CAMBIO_USD` con el que se valúan los dólares
 */
export function auditar(filasCob = [], filasCf = [], { tipoCambio = null } = {}) {
  const cobros = []
  filasCob.forEach((f, i) => { const c = leerCobro(f, i + 5, { tipoCambio }); if (c) cobros.push(c) })

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
      devoluciones: [], porMes: [], ok: false,
    }
  }

  const enCuadro = new Map(meses.map((m) => [m.mes, 0]))
  for (const { fila } of ingreso) {
    for (const m of meses) enCuadro.set(m.mes, (enCuadro.get(m.mes) ?? 0) + (filasCf[fila]?.[m.col]?.numero ?? 0))
  }

  const { huecos, acum } = clasificar(cobros, meses)
  const porMes = meses.map((m) => veredictoDelMes(m.mes, {
    bruto: acum.bruto.get(m.mes) ?? 0, endosado: acum.endosado.get(m.mes) ?? 0,
    devolucion: acum.devolucion.get(m.mes) ?? 0, cashflow: enCuadro.get(m.mes) ?? 0,
    ars: acum.ars.get(m.mes) ?? 0, usd: acum.usd.get(m.mes) ?? 0, tipoCambio,
  }))
  const { fueraDeVentana, sinValuar, sinFecha } = huecos

  return {
    cobros,
    meses,
    ingreso,
    noPudoUbicar: null,
    totalCobranzas: cobros.reduce((s, c) => s + c.monto, 0),
    totalCashFlow: [...enCuadro.values()].reduce((s, v) => s + v, 0),
    ...huecos,
    porMes,
    // El veredicto NO es sólo el de los meses. Una fila que no se pudo valuar o que quedó fuera de la
    // ventana no descuadra ningún mes justamente porque se la sacó: si además no bajara el veredicto,
    // el control estaría premiando el haberla escondido.
    ok: porMes.every((m) => m.ok) && !sinValuar.length && !fueraDeVentana.length && !sinFecha.length,
  }
}
