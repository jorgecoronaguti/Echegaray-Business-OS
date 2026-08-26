import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// EL CIERRE DE UNA OBRA TERMINADA — cobrado, fondo de reparo, duración, comprobantes.
//
// ═══ EL ÚNICO LUGAR DEL PORTAL QUE TODAVÍA LEE `pago_programado` — DECLARADO, NO ESCONDIDO ═══
//
// El 26/08/2026 el cronograma del portal pasó a `esquema_pago`, que es donde la ficha del cliente
// (pantalla 32) lo administra de verdad. Esta pantalla NO pudo seguirlo, y el motivo no es pereza:
//
//   · `esquema_pago.obra_id` apunta a `public.obra_canonica` (id de texto, 18 filas);
//   · Terminadas y `obra_adjunto_cliente` se apoyan en `public.obras` (uuid, 10 filas);
//   · no hay mapeo entre los dos registros y NO se puede fabricar: tienen distinta granularidad —
//     `public.obras` tiene «MAMPOSTERÍA» donde `obra_canonica` tiene «Galpones, Mampostería, Cancha
//     de Padel»—, así que emparejarlos por nombre inventaría a qué obra pertenece cada cobro.
//
// COSTO REAL HOY: cero. Ninguna de las dos obras cerradas de `public.obras` tiene filas en
// `pago_programado`, así que esta función ya devolvía «sin datos de cobro» para las dos. Lo que
// queda es una deuda declarada, no un número equivocado en pantalla.
//
// SIGUIENTE PASO (decisión del dueño): unificar `public.obras` con `obra_canonica`. Mientras haya
// dos registros de obra, el portal va a tener una pantalla de cada lado.

export type ObraCerrada = {
  cobrado: number
  pendiente: number
  rotuloCobro: string
  /** Lo retenido y todavía no devuelto. `0` = no queda nada abierto. */
  faltaReparo: number
  reparoDevueltoEn: string | null
  meses: number | null
  /** Cuántos de sus pagos tienen número de factura y de recibo. */
  facturas: number
  recibos: number
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
    sb.from('pago_programado')
      .select('tipo, monto, fecha_pago, devuelto_en, factura_numero, recibo_numero').eq('obra_id', obraId),
    sb.from('obras').select('fecha_inicio, fecha_cierre').eq('id', obraId).maybeSingle(),
  ])

  let cobrado = 0, pendiente = 0, faltaReparo = 0, facturas = 0, recibos = 0
  let reparoDevueltoEn: string | null = null
  for (const p of pagos ?? []) {
    if (p.factura_numero) facturas++
    if (p.recibo_numero) recibos++
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
    cobrado, pendiente, faltaReparo, reparoDevueltoEn, facturas, recibos,
    // «pagada» sólo cuando NO queda nada. Con un peso pendiente se dice el número.
    rotuloCobro: pendiente === 0 && cobrado > 0 ? 'pagada' : pendiente > 0 ? 'con saldo' : 'sin datos de cobro',
    meses: mesesEntre(obra?.fecha_inicio ?? null, obra?.fecha_cierre ?? null),
  }
}
