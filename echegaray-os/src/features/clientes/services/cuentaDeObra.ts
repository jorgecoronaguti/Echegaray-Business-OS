// LA CUENTA DE UNA OBRA — `public.obra_cuenta`, y de ninguna otra parte.
//
// La vista (migración 20260910T2356) publica POR OBRA las mismas columnas que la pestaña OBRAS del
// Flujo de Caja: contratado, cobrado bruto y neto, por cobrar, vencido y el próximo cobro con su
// medio. La pantalla no vuelve a calcular ninguna: «lo que falta cobrar» restado en el cliente
// —contratado menos cobrado— era una segunda definición del mismo número, y de las que más veces
// discreparon contra el Sheet.
//
// Este módulo sólo convierte. Llega por la RPC `pantalla_clientes()`, que la transporta junto con
// las otras nueve lecturas de la pantalla.

/** Lo que `public.obra_cuenta` publica de una obra. `null` NUNCA es 0: es «no se sabe». */
export interface CuentaDeObra {
  obra_id: string
  obra: string | null
  cliente_id: string | null
  contratado: number | null
  n_cobranzas: number | null
  n_cobradas: number | null
  /** BRUTO: lo que entró al banco, con IVA. */
  cobrado_total: number | null
  /** SIN IVA: el único comparable contra lo contratado, que tampoco lo lleva. */
  cobrado_neto: number | null
  por_cobrar: number | null
  vencido: number | null
  proximo_cobro_fecha: string | null
  proximo_cobro_medio: string | null
  /** Cómo llegó el cobro a esta obra: por OC, por alias, o por el cliente. */
  imputacion: string | null
}

/** `numeric` puede llegar como texto según el transporte. `null` se queda `null`. */
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function aTexto(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v)
}

/** Las filas de `obra_cuenta` ya leídas → el mapa por obra. */
export function armarCuentaPorObra(filas: unknown[]): Map<string, CuentaDeObra> {
  const m = new Map<string, CuentaDeObra>()
  for (const fila of filas) {
    const f = fila as Record<string, unknown>
    const obraId = String(f.obra_id)
    m.set(obraId, {
      obra_id: obraId,
      obra: aTexto(f.obra),
      cliente_id: aTexto(f.cliente_id),
      contratado: aNumero(f.contratado),
      n_cobranzas: aNumero(f.n_cobranzas),
      n_cobradas: aNumero(f.n_cobradas),
      cobrado_total: aNumero(f.cobrado_total),
      cobrado_neto: aNumero(f.cobrado_neto),
      por_cobrar: aNumero(f.por_cobrar),
      vencido: aNumero(f.vencido),
      proximo_cobro_fecha: aTexto(f.proximo_cobro_fecha),
      proximo_cobro_medio: aTexto(f.proximo_cobro_medio),
      imputacion: aTexto(f.imputacion),
    })
  }
  return m
}
