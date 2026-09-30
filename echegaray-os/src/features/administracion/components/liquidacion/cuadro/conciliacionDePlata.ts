// QUE CADA FILA DEL RESUMEN DE PLATA CIERRE A LA VISTA (auditor, 30/09/2026).
//
// El resumen mostraba Total, Pagado y Saldo por canal, pero `pagoDeLaLinea` compensa: lo pagado de más en efectivo
// baja el saldo del banco, y quien cobró de más en total no se descuenta de nada. Sin decirlo, «Total − Pagado ≠
// Saldo» y «banco + efectivo a pagar ≠ Saldo total» parecían errores. Acá se suma, sobre el MISMO universo de filas
// (las que tienen saldo que afirmar), cada término de esa compensación para que el componente los muestre. No se
// recalcula ningún saldo: se leen los de la línea y se agrega lo que los separa del bruto.

import type { PagoDeLaLinea } from '../../../services/pagoDeLaQuincena'

const r2 = (n: number): number => Math.round(n * 100) / 100

export interface FilaDeCanal {
  total: number
  pagado: number
  saldo: number
  /** Pagado de más por el OTRO canal que se descuenta de éste. */
  descontado: number
  /** Pagado de más por ESTE canal por quien cobró de más en total: no baja el saldo de nadie. */
  sobrepasado: number
}

export interface ConciliacionDePlata {
  banco: FilaDeCanal
  efectivo: FilaDeCanal
  total: { total: number; pagado: number; saldo: number }
  aPagarBanco: number
  aPagarEfectivo: number
  /** Personas que cobraron de más EN TOTAL, y por cuánto: `aPagar` banco + efectivo excede el saldo en esto. */
  cobraronDeMas: { personas: number; importe: number }
  /** Filas sin saldo que afirmar: su pago no entra en ninguna cifra de arriba. */
  sinSaldo: number
}

const canal = (): FilaDeCanal => ({ total: 0, pagado: 0, saldo: 0, descontado: 0, sobrepasado: 0 })

export function conciliarPlata(pagos: readonly PagoDeLaLinea[]): ConciliacionDePlata {
  const c: ConciliacionDePlata = {
    banco: canal(), efectivo: canal(), total: { total: 0, pagado: 0, saldo: 0 },
    aPagarBanco: 0, aPagarEfectivo: 0, cobraronDeMas: { personas: 0, importe: 0 }, sinSaldo: 0,
  }
  for (const p of pagos) {
    if (p.saldoTotal == null || p.banco == null || p.negro == null || p.total == null) { c.sinSaldo++; continue }
    const lados = [
      { f: c.banco, bruto: p.saldoBancoBruto ?? 0, saldo: p.saldoBanco ?? 0, tot: p.banco, pag: p.pagadoBanco },
      { f: c.efectivo, bruto: p.saldoEfectivoBruto ?? 0, saldo: p.saldoEfectivo ?? 0, tot: p.negro, pag: p.pagadoEfectivo },
    ]
    for (const l of lados) {
      l.f.total += l.tot; l.f.pagado += l.pag; l.f.saldo += l.saldo
      // Lo que separa el saldo del bruto: positivo = el otro canal lo descontó; negativo = pagado de más sin saldo
      // contra el cual descontar (el saldo quedó en 0 y el bruto por debajo).
      const dif = r2(l.bruto - l.saldo)
      if (dif > 0) l.f.descontado += dif
      else l.f.sobrepasado += -dif
    }
    c.total.total += p.total; c.total.pagado += p.pagado; c.total.saldo += p.saldoTotal
    c.aPagarBanco += p.aPagarBanco ?? 0; c.aPagarEfectivo += p.aPagarEfectivo ?? 0
    if (p.saldoTotal < 0) { c.cobraronDeMas.personas++; c.cobraronDeMas.importe += -p.saldoTotal }
  }
  for (const f of [c.banco, c.efectivo]) for (const k of ['total', 'pagado', 'saldo', 'descontado', 'sobrepasado'] as const) f[k] = r2(f[k])
  for (const k of ['total', 'pagado', 'saldo'] as const) c.total[k] = r2(c.total[k])
  c.aPagarBanco = r2(c.aPagarBanco); c.aPagarEfectivo = r2(c.aPagarEfectivo)
  c.cobraronDeMas.importe = r2(c.cobraronDeMas.importe)
  return c
}
