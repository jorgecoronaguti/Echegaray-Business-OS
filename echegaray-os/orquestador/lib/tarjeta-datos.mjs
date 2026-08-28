// LOS RESÚMENES DE TARJETA, LEÍDOS DE LA BASE. La única capa de este dominio que toca Postgres.
//
// El parser es puro, los controles son puros, el estado es puro y la banda de la pestaña es pura.
// Todo lo que consulta vive acá, en un archivo, y devuelve la MISMA FORMA que los tests le pasan a
// mano a esas funciones. Ese contrato es lo que permite que la pestaña se pruebe entera sin base.
//
// POR QUÉ NO SE LEE DE `banco-santander.mjs`: ahí la tarjeta era una constante escrita a mano, y ése
// es justamente el defecto que este trabajo vino a cerrar. La constante sigue existiendo porque
// `impuestos-pestana.mjs` la usa para su cuadro de posición; la pestaña de la tarjeta ya no.

import { query } from './db.mjs'
import { tcDeducido } from './tarjeta-resumen.mjs'

/** Una `date` de Postgres a ISO corto, sin que el huso la corra un día. */
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null)
const num = (v) => (v == null ? null : Number(v))

/**
 * Todos los resúmenes cargados, del más nuevo al más viejo, con sus líneas y sus cuotas.
 *
 * TRES CONSULTAS Y NO UN JOIN: un join multiplica la cabecera por cada línea y obliga a re-agrupar
 * en memoria igual. Con un resumen por mes esto son tres viajes, no trescientos.
 */
export async function leerResumenes({ q = query } = {}) {
  const { rows: cab } = await q('select * from public.tarjeta_resumen order by cierre desc')
  if (!cab.length) return []
  const ids = cab.map((r) => r.id)
  const { rows: lin } = await q('select * from public.tarjeta_resumen_linea where resumen_id = any($1) order by resumen_id, orden', [ids])
  const { rows: cuo } = await q('select * from public.tarjeta_cuota_a_vencer where resumen_id = any($1) order by resumen_id, mes', [ids])

  return cab.map((r) => {
    const lineas = lin.filter((l) => String(l.resumen_id) === String(r.id)).map((l) => ({
      orden: l.orden, tipo: l.tipo, concepto: l.concepto, fecha: iso(l.fecha),
      comprobante: l.comprobante, comercio: l.comercio, referencia: l.referencia,
      cuota: l.cuota, cuotas: l.cuotas, pesos: num(l.importe_pesos), dolares: num(l.importe_dolares),
      base: num(l.base), tc: num(l.tc),
    }))
    const consumos = lineas.filter((l) => l.tipo === 'consumo')
    return {
      id: r.id,
      tarjeta: r.tarjeta,
      titular: r.titular,
      numero: r.numero,
      cierre: iso(r.cierre),
      vencimiento: iso(r.vencimiento),
      cierreAnterior: iso(r.cierre_anterior),
      vencimientoAnterior: iso(r.vencimiento_anterior),
      proximoCierre: iso(r.proximo_cierre),
      proximoVencimiento: iso(r.proximo_vencimiento),
      limiteCompra: num(r.limite_compra),
      limiteFinanciacion: num(r.limite_financiacion),
      saldoAnteriorPesos: num(r.saldo_anterior_pesos),
      saldoAnteriorDolares: num(r.saldo_anterior_dolares),
      pagoAnterior: r.pago_anterior_importe == null ? null
        : { fecha: iso(r.pago_anterior_fecha), importe: num(r.pago_anterior_importe), tc: num(r.pago_anterior_tc) },
      pagoAnteriorTc: num(r.pago_anterior_tc),
      consumosPesos: num(r.consumos_pesos),
      consumosDolares: num(r.consumos_dolares),
      cargosPesos: num(r.cargos_pesos),
      aDebitarPesos: num(r.a_debitar_pesos),
      aDebitarDolares: num(r.a_debitar_dolares),
      cuentaDebito: r.cuenta_debito,
      pagoMinimo: num(r.pago_minimo),
      pagoMinimoVerificado: r.pago_minimo_verificado,
      origen: r.origen,
      // El TC del cierre no se guarda: se DEDUCE de la base de la percepción y del consumo en
      // dólares, que sí están guardados. Un dato calculado que se persiste es un dato que puede
      // quedar viejo respecto de los dos que lo producen.
      tcCierre: tcDeducido(lineas.find((l) => l.concepto === 'rg5617')?.base, num(r.consumos_dolares)),
      cargos: lineas.filter((l) => l.tipo === 'cargo').map((l) => ({ concepto: l.concepto, comercio: l.comercio, importe: l.pesos, base: l.base })),
      consumos,
      cuotasAVencer: cuo.filter((c) => String(c.resumen_id) === String(r.id))
        .map((c) => ({ mes: iso(c.mes), importe: num(c.importe), esTotal: c.es_total, cuotas: c.cuotas, cuota: num(c.cuota) })),
    }
  })
}

/**
 * Los débitos de tarjeta del extracto. La OTRA fuente: sin esto, "ya se pagó" lo contestaría el
 * mismo documento que dice que hay que pagar.
 *
 * Se traen todos los movimientos del período relevante y el filtro por naturaleza lo hace
 * `esPagoDeTarjeta` (que usa `clasificarMovimiento`), no un `like` inventado acá: el criterio de qué
 * concepto es un pago de tarjeta se define una sola vez, en el importador del banco.
 */
export async function leerMovimientosBanco({ q = query, desde = '2026-01-01' } = {}) {
  const { rows } = await q(
    'select fecha, concepto, importe from public.banco_movimientos where fecha >= $1 order by fecha', [desde])
  return rows.map((r) => ({ fecha: iso(r.fecha), concepto: r.concepto, importe: Number(r.importe) }))
}
