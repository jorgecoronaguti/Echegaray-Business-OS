// EL INSERT DEL RESUMEN DE TARJETA, EN UN SOLO LUGAR.
//
// Vive acá y no en el importador por lo mismo que `banco-escribir.mjs`: dos INSERT distintos sobre
// la misma tabla se separan a la primera corrección, y desde ahí el conteo miente sin dar un solo
// error. Hoy lo usan el importador y el test contra Postgres real; mañana, el botón que suba el PDF
// desde el chat.
//
// ═══ LA IDEMPOTENCIA NO ES UNA PROMESA DEL CÓDIGO: ES `ON CONFLICT` SOBRE UN ÍNDICE ═══
//
//   · el resumen se identifica por (tarjeta, cierre) — el número puede faltar y una tarjeta cierra
//     una sola vez por período;
//   · cada línea, por (resumen, orden) — el mismo PDF leído dos veces da el mismo orden, y dos
//     consumos del mismo día, mismo importe y mismo comercio son un caso REAL (dos cargos de U$S 45
//     de ANTHROPIC el 31/07) que ninguna otra combinación de campos distingue;
//   · cada cuota a vencer, por (resumen, mes).
//
// Y `do update`, no `do nothing`: re-importar un PDF corregido tiene que CORREGIR la fila, no
// dejar la lectura vieja adentro pensando que ya estaba.
//
// `cx` es cualquier cosa con `.query(texto, params)`: el pool, un cliente en transacción, o el
// cliente que el test hace rollback al terminar.

/** Lo que se guarda de cada línea, en el orden del INSERT. */
const filaLinea = (m) => [m.orden, m.tipo, m.concepto, m.fecha, m.comprobante, m.comercio, m.referencia,
  m.cuota, m.cuotas, m.pesos, m.dolares, m.base ?? null, m.tc ?? null]

export async function insertarResumen(cx, p, origen) {
  const r = p.resumen
  // ON CONFLICT sobre el índice por CIERRE (el que siempre aplica: el número puede faltar).
  // `do update` y no `do nothing`: re-importar un PDF corregido tiene que corregir la fila.
  const { rows: [fila] } = await cx.query(`
      insert into public.tarjeta_resumen (
        tarjeta, cuenta_tarjeta, titular, numero, cierre, vencimiento, cierre_anterior, vencimiento_anterior,
        proximo_cierre, proximo_vencimiento, limite_compra, limite_cuotas, limite_financiacion,
        saldo_anterior_pesos, saldo_anterior_dolares, pago_anterior_fecha, pago_anterior_importe, pago_anterior_tc,
        consumos_pesos, consumos_dolares, cargos_pesos, a_debitar_pesos, a_debitar_dolares, cuenta_debito,
        pago_minimo, pago_minimo_verificado, origen)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      on conflict (tarjeta, cierre) do update set
        numero = excluded.numero, vencimiento = excluded.vencimiento,
        cierre_anterior = excluded.cierre_anterior, vencimiento_anterior = excluded.vencimiento_anterior,
        proximo_cierre = excluded.proximo_cierre, proximo_vencimiento = excluded.proximo_vencimiento,
        limite_compra = excluded.limite_compra, limite_cuotas = excluded.limite_cuotas,
        limite_financiacion = excluded.limite_financiacion,
        saldo_anterior_pesos = excluded.saldo_anterior_pesos, saldo_anterior_dolares = excluded.saldo_anterior_dolares,
        pago_anterior_fecha = excluded.pago_anterior_fecha, pago_anterior_importe = excluded.pago_anterior_importe,
        pago_anterior_tc = excluded.pago_anterior_tc,
        consumos_pesos = excluded.consumos_pesos, consumos_dolares = excluded.consumos_dolares,
      cargos_pesos = excluded.cargos_pesos, a_debitar_pesos = excluded.a_debitar_pesos,
        a_debitar_dolares = excluded.a_debitar_dolares, cuenta_debito = excluded.cuenta_debito,
        pago_minimo = excluded.pago_minimo, pago_minimo_verificado = excluded.pago_minimo_verificado,
        origen = excluded.origen, importado_en = now()
      returning id, (xmax = 0) as nueva`,
  [r.tarjeta, r.cuentaTarjeta, r.titular, r.numero, r.cierre, r.vencimiento, r.cierreAnterior, r.vencimientoAnterior,
    r.proximoCierre, r.proximoVencimiento, r.limiteCompra, r.limiteCuotas, r.limiteFinanciacion,
    r.saldoAnteriorPesos, r.saldoAnteriorDolares, r.pagoAnterior?.fecha ?? null, r.pagoAnterior?.importe ?? null,
    r.pagoAnterior?.tc ?? null, r.consumosPesos, r.consumosDolares, r.cargosPesos, r.aDebitarPesos,
    r.aDebitarDolares, r.cuentaDebito, r.pagoMinimo, r.pagoMinimoVerificado, origen])

  for (const m of p.movimientos) {
    await cx.query(`
        insert into public.tarjeta_resumen_linea
          (resumen_id, orden, tipo, concepto, fecha, comprobante, comercio, referencia, cuota, cuotas, importe_pesos, importe_dolares, base, tc)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (resumen_id, orden) do update set
          tipo = excluded.tipo, concepto = excluded.concepto, fecha = excluded.fecha,
          comprobante = excluded.comprobante, comercio = excluded.comercio, referencia = excluded.referencia,
          cuota = excluded.cuota, cuotas = excluded.cuotas, importe_pesos = excluded.importe_pesos,
          importe_dolares = excluded.importe_dolares, base = excluded.base, tc = excluded.tc`,
    [fila.id, ...filaLinea(m)])
  }
  // Las líneas que sobran de una carga anterior más larga se borran: si el PDF corregido trae
  // menos renglones, dejarlas convertiría el resumen en la suma de dos lecturas distintas.
  await cx.query('delete from public.tarjeta_resumen_linea where resumen_id = $1 and orden > $2', [fila.id, p.movimientos.length])

  for (const q of p.cuotas.porMes) {
    await cx.query(`
        insert into public.tarjeta_cuota_a_vencer (resumen_id, mes, importe, es_total, cuotas, cuota)
        values ($1,$2,$3,false,null,null)
        on conflict (resumen_id, mes) do update set importe = excluded.importe, es_total = false, cuotas = null, cuota = null`,
    [fila.id, q.mes, q.importe])
  }
  if (p.cuotas.cola) {
    const k = p.cuotas.cola
    await cx.query(`
        insert into public.tarjeta_cuota_a_vencer (resumen_id, mes, importe, es_total, cuotas, cuota)
        values ($1,$2,$3,true,$4,$5)
        on conflict (resumen_id, mes) do update set importe = excluded.importe, es_total = true, cuotas = excluded.cuotas, cuota = excluded.cuota`,
    [fila.id, k.desde, k.total, k.cuotas, k.cuota])
  }
  return fila
}
