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

/** Las columnas de Cobranzas, por índice desde A=0. Verificadas contra el encabezado del 21/07;
 *  comprobante/emisión agregados el 04/08 y reverificados contra la fila 4 real. */
export const C = {
  emision: 2, comprobante: 4, unidad: 5, cliente: 6, concepto: 8,
  total: 12, forma: 13, estado: 14, fechaVenta: 15, fechaCobro: 16, banco: 53,
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
 * NÚCLEO PURO: un cobro, tal como lo ve la fórmula del cash flow.
 *
 * LA FECHA QUE MANDA ES LA DE COBRO Y SI NO HAY, LA DE VENTA. Es la misma regla de la fórmula, y
 * está bien: el cash flow es percibido, así que interesa cuándo entra la plata; mientras no haya
 * fecha de cobro, la de venta es la mejor estimación disponible.
 */
export function leerCobro(fila, nro) {
  const num = (j) => (fila[j]?.numero ?? null)
  const txt = (j) => String(fila[j]?.valor ?? '').trim()
  const monto = num(C.total)
  if (!monto) return null
  const fechaCobro = aFecha(num(C.fechaCobro))
  const f = fechaCobro ?? aFecha(num(C.fechaVenta))
  return {
    fila: nro,
    monto,
    unidad: txt(C.unidad).toLowerCase(),
    cliente: txt(C.cliente),
    estado: txt(C.estado),
    fecha: f,
    fechaCobro,
    mes: f ? mesDe(f) : null,
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
    if (!c.fecha || c.endosado) continue
    if (!acc.has(c.mes)) acc.set(c.mes, { cobrado: 0, esperado: 0 })
    if (esCobrado(c)) acc.get(c.mes).cobrado += c.monto
    // El corte de la fórmula: un esperado de un mes ya cerrado NO suma. Se replica tal cual para que
    // la comparación mida el dato, no una diferencia de criterio inventada acá.
    else if (esPendiente(c) && c.fecha >= corte) acc.get(c.mes).esperado += c.monto
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
 * NÚCLEO PURO: la auditoría completa.
 *
 * @param {Array<Array<object>>} filasCob grilla de Cobranzas desde la fila 5
 * @param {Array<Array<object>>} filasCf grilla del cash flow desde la fila 3 (encabezado + líneas)
 */
export function auditar(filasCob = [], filasCf = []) {
  const cobros = []
  filasCob.forEach((f, i) => { const c = leerCobro(f, i + 5); if (c) cobros.push(c) })

  const meses = mesesDelCuadro(filasCf[0] ?? [])
  const enCuadro = new Map(meses.map((m) => [m.mes, 0]))
  // Las tres líneas de ingreso son las últimas del rango leído (civil, mantenimiento, otras).
  for (const fila of filasCf.slice(-3)) {
    for (const m of meses) enCuadro.set(m.mes, (enCuadro.get(m.mes) ?? 0) + (fila[m.col]?.numero ?? 0))
  }

  const fueraDeVentana = [], endosados = [], sinUnidad = [], sinFecha = []
  const porMesCob = new Map(meses.map((m) => [m.mes, 0]))

  for (const c of cobros) {
    if (!c.fecha) { sinFecha.push({ ...c, motivo: 'sin fecha de cobro ni de venta' }); continue }
    if (c.endosado) { endosados.push({ ...c, motivo: 'el banco dice que se entregó a un tercero' }); continue }
    if (!c.unidad) { sinUnidad.push({ ...c, motivo: 'la columna Unidad está vacía' }); continue }
    if (!porMesCob.has(c.mes)) { fueraDeVentana.push({ ...c, motivo: `su mes (${c.mes}) no es una columna del cuadro` }); continue }
    porMesCob.set(c.mes, porMesCob.get(c.mes) + c.monto)
  }

  return {
    cobros,
    meses,
    totalCobranzas: cobros.reduce((s, c) => s + c.monto, 0),
    totalCashFlow: [...enCuadro.values()].reduce((s, v) => s + v, 0),
    fueraDeVentana, endosados, sinUnidad, sinFecha,
    porMes: meses.map((m) => ({ mes: m.mes, cobranzas: porMesCob.get(m.mes) ?? 0, cashflow: enCuadro.get(m.mes) ?? 0 })),
  }
}
