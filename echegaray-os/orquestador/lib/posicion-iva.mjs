// LA POSICIÓN DE IVA DE VERDAD: con el saldo a favor ARRASTRADO.
//
// POR QUÉ EXISTE (20/07). El dueño pidió traer IVA e IIBB a la pestaña de impuestos. Al mirarlo
// aparecieron dos cosas:
//   1. En Compras NO hay una sola fila de IVA ni de IIBB. Los $9.835.877 que figuraban como
//      "Impuestos" eran planes de pago de deuda previsional mal clasificados. O sea: el impuesto que
//      más plata mueve estaba enteramente fuera del cash flow.
//   2. La posición mes a mes que ya calculaba libro-iva.mjs (débito − crédito) NO es lo que se paga.
//      El saldo técnico a favor se arrastra al mes siguiente. Sin arrastrar, marzo daba $14,8M a
//      pagar; arrastrando los saldos de enero y febrero, se pagaron $11,1M. Y hoy hay $7,5M de saldo
//      a favor que NO se ven por ningún lado.
//
// Esto NO reemplaza la DDJJ: no incluye retenciones ni percepciones sufridas, ni ajustes. Es la
// posición técnica sobre los comprobantes reales de ARCA. La diferencia contra el F2002 hay que
// mirarla, no taparla — por eso la función devuelve también de qué comprobantes salió cada mes.

import { posicionIvaAnio } from './libro-iva.mjs'

/** Alícuota general de IVA. Si algún día cambia, cambia acá y en ningún otro lado. */
export const ALICUOTA_IVA = 0.21

/**
 * NÚCLEO PURO: arrastra el saldo técnico a favor mes a mes.
 * @param {Array<{periodo:string, disponible:boolean, debito_fiscal?:number, credito_fiscal?:number}>} meses
 * @returns {Array} los mismos meses + saldo_previo, a_pagar_real, saldo_queda
 */
export function arrastrarSaldo(meses = []) {
  let saldo = 0 // saldo técnico a favor que viene del mes anterior
  return meses.map((m) => {
    if (!m.disponible) return { ...m, saldo_previo: saldo, a_pagar_real: null, saldo_queda: saldo }
    const pos = (m.debito_fiscal ?? 0) - (m.credito_fiscal ?? 0)
    // Posición positiva = hay que pagar, pero primero se consume el saldo a favor acumulado.
    const aPagar = Math.max(0, pos - saldo)
    const saldoQueda = Math.max(0, saldo - pos)
    const previo = saldo
    saldo = saldoQueda
    return { ...m, posicion: pos, saldo_previo: previo, a_pagar_real: aPagar, saldo_queda: saldoQueda }
  })
}

/**
 * NÚCLEO PURO: proyecta el IVA de los meses que todavía no tienen comprobantes.
 * El dueño pidió "proyección calculada por ventas": el débito sale de las ventas proyectadas por la
 * alícuota. El crédito NO se puede proyectar por ventas — depende de qué se compre — así que se usa
 * el promedio de los meses reales, que es un supuesto y se declara como tal.
 * SI NO HAY VENTAS CARGADAS PARA UN MES FUTURO, no se proyecta cero. Cobranzas sólo tiene facturas
 * ya emitidas, así que de agosto en adelante no hay ninguna — y proyectar "cero ventas" daba un
 * saldo a favor creciendo hasta $30,7M, que es un disparate que además tapa el problema real. Se usa
 * el ritmo real de facturación (promedio de los meses con comprobantes) ajustado por inflación, que
 * es la regla de oro del dueño para toda proyección.
 *
 * @param {Array} meses salida de arrastrarSaldo
 * @param {Object} ventasProyectadas {'2026-08': monto_neto, …}
 * @param {Object} factorInflacion {'2026-08': 1.019, …} acumulado desde hoy
 * @returns {Array} los meses no disponibles, completados y marcados es_proyeccion
 */
export function proyectarIva(meses = [], ventasProyectadas = {}, factorInflacion = {}) {
  const reales = meses.filter((m) => m.disponible)
  const creditoProm = reales.length
    ? reales.reduce((s, m) => s + (m.credito_fiscal ?? 0), 0) / reales.length
    : 0
  // El ritmo real de facturación: promedio del débito de los meses con comprobantes.
  const debitoProm = reales.length
    ? reales.reduce((s, m) => s + (m.debito_fiscal ?? 0), 0) / reales.length
    : 0
  let saldo = reales.length ? reales[reales.length - 1].saldo_queda ?? 0 : 0
  return meses.map((m) => {
    if (m.disponible) { saldo = m.saldo_queda ?? saldo; return m }
    const factor = Number(factorInflacion[m.periodo]) || 1
    const netoCargado = Number(ventasProyectadas[m.periodo]) || 0
    // Si hay facturación cargada para ese mes, manda ella. Si no, el ritmo real ajustado.
    const porRitmo = !netoCargado
    const debito = porRitmo ? debitoProm * factor : netoCargado * ALICUOTA_IVA
    const neto = debito / ALICUOTA_IVA
    const pos = debito - creditoProm
    const aPagar = Math.max(0, pos - saldo)
    const previo = saldo
    saldo = Math.max(0, saldo - pos)
    return {
      ...m,
      es_proyeccion: true,
      neto_proyectado: neto,
      debito_fiscal: debito,
      credito_fiscal: creditoProm,
      posicion: pos,
      saldo_previo: previo,
      a_pagar_real: aPagar,
      saldo_queda: saldo,
      metodo: porRitmo
        ? `SIN facturación cargada para este mes: débito = ritmo real de ${reales.length} meses × inflación (${factor.toFixed(3)}) · crédito = promedio de esos meses`
        : `débito = facturación cargada × ${ALICUOTA_IVA * 100}% · crédito = promedio de ${reales.length} meses reales`,
    }
  })
}

/**
 * La posición del año, real + proyectada, lista para escribir.
 * @param {number} anio
 * @param {Object} ventasProyectadas por período 'YYYY-MM'
 */
export async function posicionIvaCompleta(anio, ventasProyectadas = {}, factorInflacion = {}) {
  const { meses } = await posicionIvaAnio(anio)
  return proyectarIva(arrastrarSaldo(meses), ventasProyectadas, factorInflacion)
}
