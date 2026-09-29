'use client'

import { useRef, useState } from 'react'
import { Boton } from '@/shared/components/ds'
import { imprimirHoja } from '@/features/administracion/components/liquidacion/cuadro/HojaDelRecibo'
import { numeroRemito, type Remito } from '../logica/stock'
import { HojaRemito } from './HojaRemito'

// EL REMITO CON SU BOTÓN «IMPRIMIR / PDF». `imprimirHoja` abre una ventana con SÓLO esta hoja y dispara el
// diálogo del navegador, donde «Guardar como PDF» es una opción: no hay un segundo generador de PDF que
// mantener. Si el navegador bloquea la ventana, se dice (antes no pasaba nada y no se sabía por qué).

export function RemitoImprimible({ remito }: { remito: Remito }) {
  const hoja = useRef<HTMLDivElement>(null)
  const [bloqueada, setBloqueada] = useState(false)
  return (
    <div className="space-y-3" data-testid="remito-imprimible">
      <HojaRemito hoja={hoja} remito={remito} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="button" variante="primaria" onClick={() => setBloqueada(!imprimirHoja(hoja.current, `Remito ${numeroRemito(remito.numero)}`))} data-testid="remito-imprimir"
          className="max-lg:min-h-[48px]">
          Imprimir / PDF
        </Boton>
        {bloqueada && <span role="alert" className="text-[12px] text-neg">El navegador bloqueó la ventana de impresión. Permitila para este sitio y probá de nuevo.</span>}
      </div>
    </div>
  )
}
