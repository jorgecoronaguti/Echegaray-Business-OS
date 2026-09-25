'use client'

// FIRMAR LA CONFORMIDAD EN LA COMPUTADORA — el mismo recuadro de M02, en el panel lateral del escritorio.
//
// El trazo, la función de la base y la validación son los del teléfono (`FirmarConformidad`): acá cambia
// el MARCO, no el acto. En la PC se firma con el mouse o el trackpad en un panel al costado de la lista,
// sin salir de «Mi efectivo» (patrón de panel lateral: la entidad se edita al lado de donde se la ve).
// Cerrar el panel vuelve a la misma URL sin `?firmar=`.

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { FirmarConformidad } from '../campo/components/FirmarConformidad'

export function PanelFirmar({
  entrega, codigo, texto, volverA,
}: {
  entrega: string
  codigo: string
  /** «Recibo $ X en efectivo para <destino>», escrito por la página. */
  texto: string
  volverA: string
}) {
  const router = useRouter()
  const cerrar = useCallback(() => router.replace(volverA), [router, volverA])
  return (
    <Drawer titulo={`Firmar ${codigo}`} subtitulo="Conformidad de la entrega" onCerrar={cerrar} ancho={480} testid="panel-firmar">
      <div className="flex min-h-[420px] flex-col gap-4">
        <div className="text-[13px] leading-relaxed text-ink-soft" data-testid="firmar-texto">
          {texto} y me comprometo a rendirlos con comprobante.
        </div>
        <FirmarConformidad entrega={entrega} volverA={volverA} />
        <div className="text-[12px] text-muted">Queda el trazo, la fecha y la hora. Convive con el papel firmado.</div>
      </div>
    </Drawer>
  )
}
