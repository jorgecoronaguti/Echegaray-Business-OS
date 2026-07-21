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

/** Las columnas de Cobranzas, por índice desde A=0. Verificadas contra el encabezado del 21/07. */
export const C = { unidad: 5, cliente: 6, total: 12, forma: 13, estado: 14, fechaVenta: 15, fechaCobro: 16, banco: 53 }
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
  const f = aFecha(num(C.fechaCobro)) ?? aFecha(num(C.fechaVenta))
  return {
    fila: nro,
    monto,
    unidad: txt(C.unidad).toLowerCase(),
    cliente: txt(C.cliente),
    estado: txt(C.estado),
    fecha: f,
    mes: f ? mesDe(f) : null,
    endosado: txt(C.banco).toUpperCase().startsWith(MARCA_ENDOSADO),
  }
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
