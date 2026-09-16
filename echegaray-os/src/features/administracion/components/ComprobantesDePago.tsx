'use client'

// LOS PAPELES QUE PRUEBAN QUE LA PLATA SALIÓ — al lado del pago, no mezclados con la factura.
//
// La factura y el comprobante de pago responden preguntas distintas y por eso no comparten bloque:
// juntos, «esta compra no tiene respaldo» dejaría de significar nada. Cada línea dice QUIÉN lo subió
// y CUÁNDO, que es lo que el dueño pidió que quedara registrado.
//
// El enlace se firma AL HACER CLIC y no al montar: el bucket es privado y firmar N papeles por
// render sería N firmas cada vez que alguien abre el panel. Diez minutos de vigencia.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { diaMesAnioISO } from '@/shared/utils/fecha'
import { urlDelComprobanteDePago, type ComprobanteDePago } from '../services/comprobanteDePagoActions'

export function ComprobantesDePago({ lista }: { lista: ComprobanteDePago[] }) {
  const [error, setError] = useState<string | null>(null)
  if (!lista.length) return null

  async function abrir(id: string) {
    setError(null)
    const r = await urlDelComprobanteDePago(id)
    if (r.ok) window.open(r.dato, '_blank', 'noopener')
    else setError(r.error)
  }

  return (
    <div style={{ paddingTop: 12 }} data-testid="comprobantes-de-pago">
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: V.tenue, marginBottom: 6 }}>
        {`Comprobantes del pago · ${lista.length}`}
      </div>
      {lista.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: `1px solid ${V.lineaPanel}` }}>
          <button
            type="button" onClick={() => abrir(c.id)} title={`Abrir ${c.nombre}`}
            data-testid={`comprobante-pago-${c.id}`}
            className="min-w-0 flex-1 truncate text-left"
            style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: V.tinta }}
          >
            {c.nombre}
          </button>
          {/* QUIÉN Y CUÁNDO. Sin esto el papel existe y nadie responde por él. */}
          <span className="shrink-0" style={{ fontSize: 11, color: V.tenue }}>
            {[c.subido_por ?? 'alguien', c.subido_at ? diaMesAnioISO(c.subido_at.slice(0, 10)) : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      ))}
      {error && <p style={{ fontSize: 11.5, color: V.neg, paddingTop: 6 }}>{error}</p>}
    </div>
  )
}
