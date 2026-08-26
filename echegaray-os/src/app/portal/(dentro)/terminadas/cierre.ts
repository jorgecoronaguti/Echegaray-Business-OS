import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// EL CIERRE DE UNA OBRA TERMINADA — cobrado, fondo de reparo, duración.

export type ObraCerrada = {
  cobrado: number
  pendiente: number
  rotuloCobro: string
  /** Lo retenido y todavía no devuelto. `0` = no queda nada abierto. */
  faltaReparo: number
  reparoDevueltoEn: string | null
  meses: number | null
}

export function mesesEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null
  const a = new Date(desde), b = new Date(hasta)
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return m > 0 ? m : null
}

export async function cierreDeObra(obraId: string): Promise<ObraCerrada> {
  const sb = createAdminClient()
  const [{ data: pagos }, { data: obra }] = await Promise.all([
    sb.from('pago_programado').select('tipo, monto, fecha_pago, devuelto_en').eq('obra_id', obraId),
    sb.from('obras').select('fecha_inicio, fecha_cierre').eq('id', obraId).maybeSingle(),
  ])

  let cobrado = 0, pendiente = 0, faltaReparo = 0
  let reparoDevueltoEn: string | null = null
  for (const p of pagos ?? []) {
    const monto = p.monto == null ? null : Number(p.monto)
    if (p.tipo === 'fondo_reparo') {
      if (p.devuelto_en) reparoDevueltoEn = String(p.devuelto_en)
      else if (monto != null) faltaReparo += monto
      continue
    }
    if (monto == null) continue
    if (p.fecha_pago) cobrado += monto
    else pendiente += monto
  }

  return {
    cobrado, pendiente, faltaReparo, reparoDevueltoEn,
    // «todo» sólo cuando NO queda nada. Con un peso pendiente se dice el número.
    rotuloCobro: pendiente === 0 && cobrado > 0 ? 'pagada' : pendiente > 0 ? 'con saldo' : 'sin datos de cobro',
    meses: mesesEntre(obra?.fecha_inicio ?? null, obra?.fecha_cierre ?? null),
  }
}
