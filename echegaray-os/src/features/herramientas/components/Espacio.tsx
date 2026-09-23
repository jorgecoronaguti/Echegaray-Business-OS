'use client'

// EL ESPACIO DE TRABAJO — los paneles de Mover, Alta, Baja y Reportar, disponibles en cualquier pantalla.
//
// `D05` y `D12` son PANELES al costado, no modales: la lista queda detrás con lo seleccionado a la vista.
// La baja (`D13`) sí es una confirmación centrada: es la única acción que no se deshace.
//
// El parque llega del servidor como filas planas (`DatosParque`) y se arma acá una vez: las pantallas y
// los paneles miran el mismo objeto, así «dónde está» no puede decir dos cosas en la misma pantalla.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { armarParque, type DatosParque, type Parque } from '../logica/parque'
import type { ObraIndice } from '../types'
import { PanelMover } from './PanelMover'
import { PanelAlta } from './PanelAlta'
import { DialogoBaja } from './DialogoBaja'
import { PanelReportar } from './PanelReportar'
import { PanelEditar } from './PanelEditar'
import { PanelVerificar } from './PanelVerificar'

export interface Yo { id: string | null; nombre: string | null }

type PanelAbierto =
  | { tipo: 'mover'; ids: string[]; destino?: string; origen?: string | null }
  /** `destino`: clave de `claveDestino` (u:<ubicación> · obra:<obra>) donde entra lo nuevo; sin él, el Taller. */
  | { tipo: 'alta'; destino?: string }
  | { tipo: 'baja'; id: string }
  | { tipo: 'reportar'; ids: string[] }
  | { tipo: 'editar'; id: string }
  | { tipo: 'verificar'; id: string }
  | null

interface Ctx {
  parque: Parque
  obras: ObraIndice[]
  yo: Yo
  abrir: (p: Exclude<PanelAbierto, null>) => void
  cerrar: () => void
  abierto: PanelAbierto
  /** Aviso corto después de una escritura («12 activos movidos a Taller»). */
  aviso: string | null
  avisar: (t: string | null) => void
  /** Vuelve a leer la base sin cerrar el panel. */
  refrescar: () => void
}

const Contexto = createContext<Ctx | null>(null)

export function useHerramientas(): Ctx {
  const c = useContext(Contexto)
  if (!c) throw new Error('useHerramientas fuera de <EspacioHerramientas>')
  return c
}

export function EspacioHerramientas({ datos, obras, yo, children }: {
  datos: DatosParque
  obras: ObraIndice[]
  yo: Yo
  children: ReactNode
}) {
  const parque = useMemo(() => armarParque(datos), [datos])
  const [abierto, setAbierto] = useState<PanelAbierto>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const router = useRouter()
  const ctx: Ctx = {
    parque, obras, yo, abierto, aviso, avisar: setAviso, refrescar: () => router.refresh(),
    abrir: (p) => { setAviso(null); setAbierto(p) },
    cerrar: () => setAbierto(null),
  }
  const hecho = (t: string) => {
    setAbierto(null)
    setAviso(t)
    router.refresh()
  }
  const ancho = abierto && abierto.tipo !== 'baja' ? 520 : 0
  return (
    <Contexto.Provider value={ctx}>
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, opacity: ancho ? 0.55 : 1, transition: 'opacity .12s' }}>
          {aviso && (
            <div
              role="status" data-testid="aviso-herramientas"
              style={{ margin: '14px 30px 0', padding: '9px 12px', border: '1px solid #E7E6E2', borderRadius: 6, fontSize: '13px', display: 'flex', gap: 12, alignItems: 'center' }}
            >
              <span style={{ flex: 1 }}>{aviso}</span>
              <button type="button" onClick={() => setAviso(null)} style={{ color: '#91918B', fontSize: '12.5px' }}>cerrar</button>
            </div>
          )}
          {children}
        </div>
        {abierto?.tipo === 'mover' && <PanelMover key={abierto.ids.join(',')} idsIniciales={abierto.ids} destinoInicial={abierto.destino} origenInicial={abierto.origen} onHecho={hecho} />}
        {abierto?.tipo === 'alta' && <PanelAlta key={abierto.destino ?? ''} destinoInicial={abierto.destino} onHecho={hecho} />}
        {abierto?.tipo === 'reportar' && <PanelReportar ids={abierto.ids} onHecho={hecho} />}
        {abierto?.tipo === 'editar' && <PanelEditar id={abierto.id} onHecho={hecho} />}
        {abierto?.tipo === 'verificar' && <PanelVerificar key={abierto.id} id={abierto.id} onHecho={hecho} />}
      </div>
      {abierto?.tipo === 'baja' && <DialogoBaja id={abierto.id} onHecho={hecho} />}
    </Contexto.Provider>
  )
}
