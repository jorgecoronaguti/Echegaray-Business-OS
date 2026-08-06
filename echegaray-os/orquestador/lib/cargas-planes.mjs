// LOS PLANES DE PAGO DE DEUDA PREVISIONAL — de Compras (su espejo en Supabase) a filas de la grilla.
//
// Vive fuera del generador porque es LECTURA de una fuente, no dibujo de la pestaña: quien quiera
// saber cuánta deuda previsional financiada hay viva no tiene que correr un generador de Sheets.

import { query } from './db.mjs'

const HOY = new Date().toISOString().slice(0, 10)

/** Los planes de pago de deuda previsional, agrupados desde Compras. */
export async function planesDePago(anio) {
  // El MISMO filtro que la regla de rubro-caja: por concepto, no por cliente. Bajo la etiqueta
  // "Plan de pago" también hay Anticipo de Ganancias, que es impuesto y no tiene nada que hacer acá.
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const m = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    const nombre = /w303094/i.test(c) ? 'Plan F931 W303094 — financiación de junio 2026'
      : /dic\s*25/i.test(c) ? 'Deuda previsional F931 — Diciembre 2025'
        : /enero\s*26/i.test(c) ? 'Deuda previsional F931 — Enero 2026'
          : `Otro — ${c.slice(0, 40)}`
    const p = m.get(nombre) ?? { nombre, cuotas: [], total: 0 }
    p.cuotas.push({ monto: Number(x.total) || 0, fecha: x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null })
    p.total += Number(x.total) || 0
    m.set(nombre, p)
  }
  return [...m.values()].map((p) => {
    const pendientes = p.cuotas.filter((c) => !c.fecha || c.fecha > HOY)
    return {
      ...p,
      n: p.cuotas.length,
      pagadas: p.cuotas.length - pendientes.length,
      saldo: pendientes.reduce((s, c) => s + c.monto, 0),
      proxima: pendientes.map((c) => c.fecha).filter(Boolean).sort()[0] ?? null,
      // Cuánto cae en cada mes de ESTE año: es lo que permite ponerlas en la misma grilla mensual
      // que todo el resto de la pestaña, en vez de en una tablita aparte con sus propias columnas.
      porMes: Array.from({ length: 13 }, (_, m) => (m === 0 ? 0 : p.cuotas
        .filter((c) => c.fecha && Number(c.fecha.slice(0, 4)) === anio && Number(c.fecha.slice(5, 7)) === m)
        .reduce((s, c) => s + c.monto, 0))),
    }
  }).sort((a, b) => b.saldo - a.saldo)
}
