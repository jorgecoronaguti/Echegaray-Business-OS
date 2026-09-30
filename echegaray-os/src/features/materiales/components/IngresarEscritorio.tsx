'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton, Drawer } from '@/shared/components/ds'
import { botonPrimario } from '@/features/herramientas/components/estilo'
import type { Destino } from '../logica/stock'
import { FormIngresarMaterial } from './FormIngresarMaterial'

/** «Ingresar material» en la computadora: el mismo formulario que el teléfono, en el panel lateral (sin irse de la lista). */
export function IngresarEscritorio({ destinos, lugarInicial }: { destinos: Destino[]; lugarInicial?: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} style={botonPrimario} data-testid="ingresar-material">+ Ingresar material</button>
      {abierto && (
        <Drawer
          titulo="Ingresar material al stock" onCerrar={() => setAbierto(false)} ancho={480} testid="panel-ingresar"
          pie={<Boton type="button" variante="discreta" onClick={() => setAbierto(false)}>Cancelar</Boton>}
        >
          <FormIngresarMaterial destinos={destinos} lugarInicial={lugarInicial} alHacer={() => { setAbierto(false); router.refresh() }} />
        </Drawer>
      )}
    </>
  )
}
