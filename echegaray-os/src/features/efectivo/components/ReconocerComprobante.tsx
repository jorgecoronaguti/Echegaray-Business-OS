'use client'

// D04 · RECONOCER EL GASTO A MANO (dueño, 01/10/2026: «quiero poder modificar todo como sea; por ejemplo acá
// quiero reconocer ese gasto, dárselo por ok y listo»).
//
// El lector dejó el ticket esperando —proveedor nuevo, parece un remito, sin CUIT— y Administración no tenía
// cómo darlo por bueno: sólo pedir el dato o descartar. Acá los campos de «Lo que leyó el sistema» se escriben
// (vienen precargados con lo leído) y «Reconocer el gasto» lo rinde: la base lo saca de la cola del lector,
// lo manda a Compras como «A rendir» con la foto y baja el saldo de la entrega en el acto.
//
// El estado del ticket y las acciones secundarias llegan dibujados desde el servidor (`estado`, `acciones`):
// este componente sólo es dueño de los campos y del botón que los envía.

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { pesos } from '../logica/entregas'
import { validarMonto } from '../logica/formularios'
import { reconocerComprobanteAction } from '../services/edicion'
import { Campo, ErrorPanel } from './Piezas'
import { V, botonOscuroGrande, campo, campoMonto } from './estilo'

export interface LeidoParaReconocer {
  proveedor: string
  cuit: string
  numero: string
  total: string
  fecha: string
  concepto: string
}

export function ReconocerComprobante({ id, inicial, destino, persona, enSuPoder, estado, acciones }: {
  id: string
  inicial: LeidoParaReconocer
  destino: string
  persona: string
  enSuPoder: number
  estado: ReactNode
  acciones: ReactNode
}) {
  const router = useRouter()
  const [v, setV] = useState(inicial)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const poner = (k: keyof LeidoParaReconocer) => (x: { target: { value: string } }) => { setV((a) => ({ ...a, [k]: x.target.value })); setError(null) }
  const m = validarMonto(v.total)
  const queda = m.ok ? Math.round((enSuPoder - m.dato) * 100) / 100 : null

  const reconocer = () => empezar(async () => {
    setError(null)
    if (!v.fecha) { setError('Poné la fecha del gasto'); return }
    if (!m.ok) { setError(m.error); return }
    if (!v.concepto.trim()) { setError('Escribí qué se compró o pagó'); return }
    const r = await reconocerComprobanteAction(id, v)
    if (!r.ok) { setError(r.error); return }
    router.refresh()
  })

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '18px 26px' }} data-testid="reconocer-formulario">
        <Campo rotulo="Proveedor">
          <input value={v.proveedor} onChange={poner('proveedor')} maxLength={120} style={campo} aria-label="Proveedor" data-testid="reconocer-proveedor" />
        </Campo>
        <Campo rotulo="CUIT (si se sabe)">
          <input value={v.cuit} onChange={poner('cuit')} inputMode="numeric" maxLength={13} placeholder="20-12345678-9" style={campoMonto} aria-label="CUIT" data-testid="reconocer-cuit" />
        </Campo>
        <Campo rotulo="Comprobante">
          <input value={v.numero} onChange={poner('numero')} maxLength={40} placeholder="sin número" style={campoMonto} aria-label="Número de comprobante" data-testid="reconocer-numero" />
        </Campo>
        <Campo rotulo="Importe total">
          <input value={v.total} onChange={poner('total')} inputMode="decimal" placeholder="0" style={campoMonto} aria-label="Importe total" data-testid="reconocer-total" />
        </Campo>
        <Campo rotulo="Fecha">
          <input type="date" value={v.fecha} onChange={poner('fecha')} style={campo} aria-label="Fecha del gasto" data-testid="reconocer-fecha" />
        </Campo>
        <Campo rotulo="Obra">
          <div style={{ ...campo, display: 'flex', alignItems: 'center', color: V.apagado }} className="truncate">{destino}</div>
        </Campo>
        <div className="md:col-span-2">
          <Campo rotulo="Qué se compró o pagó">
            <input value={v.concepto} onChange={poner('concepto')} maxLength={300} style={campo} aria-label="Qué se compró o pagó" data-testid="reconocer-concepto" />
          </Campo>
        </div>
      </div>

      {estado}

      <ErrorPanel texto={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" onClick={reconocer} disabled={pendiente} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="reconocer-confirmar">
          {pendiente ? 'Reconociendo…' : 'Reconocer el gasto'}
        </button>
        {acciones}
      </div>
      {queda != null && (
        <div style={{ fontSize: '12.5px', color: queda < 0 ? V.warn : V.apagado }} data-testid="reconocer-efecto">
          Va a Compras como «A rendir» · a {persona} le quedan {pesos(queda)} por rendir
        </div>
      )}
    </>
  )
}
