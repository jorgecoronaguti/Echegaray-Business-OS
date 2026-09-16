'use client'

// LA MARCA «PAGADA» DE UNA FILA — dueño, 16/09/2026, textual: *«necesito marcar como "pagado" ya a la gente y que
// marque un poco el color distinto en liq hs»*.
//
// Un clic y la persona queda pagada: la acción del servidor (`marcarLineaPagada`) completa Pagado banco y Pagado
// efectivo con lo que faltaba de cada lado, así los saldos quedan en 0 por el mismo camino que un pago tecleado, y
// sella fecha y autor. El segundo clic deshace: vuelven las cifras de antes. La fila entera se pinta con `posSuave`
// (verde = estado positivo, nunca decorativo) y lo decide `colorDeFila`, que es la única definición del color.
//
// Sin `router.refresh()`: la acción hace `revalidatePath` y el árbol de servidor vuelve solo con `pagadaEn` puesto.
// Mientras tanto el botón se apaga (pendiente) y no acepta otro clic.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { marcarLineaPagada } from '../../../services/liquidacionActions'
import { diaDelSello } from './marcaDePago'
import type { GrupoLiquidacion } from '../../../services/liquidacionQuincena'

export function MarcaDePago({ personaId, grupo, quincena, pagadaEn, cerrada }: {
  personaId: string
  grupo: GrupoLiquidacion
  quincena: { desde: string; hasta: string }
  pagadaEn: string | null | undefined
  /** La quincena cerrada es una foto: la marca se ve, no se toca. */
  cerrada: boolean
}) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const pagada = pagadaEn != null
  const testid = `marca-pagada-${personaId}`

  if (cerrada) {
    return pagada
      ? <span data-testid={testid} data-pagada="1" style={{ ...SELLO, color: V.pos }}>{`✓ Pagada ${diaDelSello(pagadaEn)}`}</span>
      : null
  }

  const alternar = () => empezar(async () => {
    setError(null)
    const r = await marcarLineaPagada({ ...quincena, grupo, persona_id: personaId, pagada: !pagada })
    if (!r.ok) setError(r.error)
  })

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={alternar}
        disabled={pendiente}
        data-testid={testid}
        data-pagada={pagada ? '1' : undefined}
        data-pendiente={pendiente ? '1' : undefined}
        aria-pressed={pagada}
        title={pagada
          ? `Pagada el ${diaDelSello(pagadaEn)} · clic para deshacer (vuelven los pagados de antes)`
          : 'Marcar como pagada: lo que falta de cada lado pasa a Pagado y los saldos quedan en 0'}
        style={{
          ...SELLO,
          padding: '1px 8px', borderRadius: 999, cursor: pendiente ? 'progress' : 'pointer',
          border: `1px solid ${pagada ? V.pos : V.lineaFuerte}`,
          background: pagada ? V.posSuave : 'transparent',
          color: pagada ? V.pos : V.apagado,
          opacity: pendiente ? 0.6 : 1,
        }}
      >
        {pagada ? `✓ Pagada ${diaDelSello(pagadaEn)}` : 'Pagar'}
      </button>
      {error && <span role="alert" data-testid={`${testid}-error`} style={{ fontSize: '10.5px', color: V.neg, whiteSpace: 'normal', maxWidth: 160, textAlign: 'right' }}>{error}</span>}
    </span>
  )
}

const SELLO: React.CSSProperties = { font: 'inherit', fontSize: '11px', lineHeight: '16px', whiteSpace: 'nowrap', fontWeight: 600 }
