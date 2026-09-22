'use client'

import { useState } from 'react'
import { C } from '@/shared/components/movil/tokens'
import { Contorno } from './Piezas'

// «NO COINCIDE EL MONTO» (M01) — no hay una función en la base para rechazar una entrega, y no se
// inventa: la entrega la corrige quien la cargó (anularla con motivo es de Administración). Lo que
// hace el botón es decir exactamente eso, con el nombre de quien se la dio, y que NO firme.

export function NoCoincide({ quien }: { quien: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Contorno onClick={() => setAbierto((a) => !a)} testid="no-coincide">No coincide el monto</Contorno>
      {abierto && (
        <div data-testid="no-coincide-texto" style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>
          No firmes. Decíselo a {quien}: la entrega la corrige quien la cargó, y recién ahí firmás el monto que
          contaste.
        </div>
      )}
    </>
  )
}
