'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/shared/components/movil/tokens'
import { LienzoFirma } from '@/shared/firma/LienzoFirma'
import { firmarConformidadAction } from '../acciones'
import { Contorno, Primario } from './Piezas'

// M02 · FIRMAR LA CONFORMIDAD — el recuadro para firmar con el dedo, y sus dos botones.
//
// El recuadro (canvas, trazo, SVG) es `shared/firma/LienzoFirma`: el mismo del recibo del gasto manual. Acá
// quedan los botones y la llamada a la base. «Confirmar» se enciende cuando el lienzo avisa una firma de verdad
// (`firmaValida`), no con cualquier toque.

export function FirmarConformidad({ entrega, volverA }: { entrega: string; volverA: string }) {
  const router = useRouter()
  const [svg, setSvg] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rehacer = () => { setReinicio((n) => n + 1); setError(null) }

  const confirmar = async () => {
    if (!svg) { setError('Firmá arriba de la línea: el trazo es muy corto.'); return }
    setEnviando(true)
    setError(null)
    const r = await firmarConformidadAction({ entrega, trazo: svg })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.replace(volverA)
    router.refresh()
  }

  return (
    <>
      <LienzoFirma onCambio={(v) => { setSvg(v); if (v) setError(null) }} reinicio={reinicio} />
      {error && <div data-testid="firma-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><Contorno onClick={rehacer} activo={!enviando} testid="firma-rehacer">Rehacer</Contorno></div>
        <div style={{ flex: 1.4 }}>
          <Primario alto={52} activo={svg !== null && !enviando} onClick={confirmar} testid="firma-confirmar">
            {enviando ? 'Guardando…' : 'Confirmar'}
          </Primario>
        </div>
      </div>
    </>
  )
}
