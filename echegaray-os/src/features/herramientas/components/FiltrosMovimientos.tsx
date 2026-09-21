'use client'

// Los tres filtros de D06, en la barra del nivel 2: ventana de tiempo, lugar, persona. Viven en la URL.

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { V } from './estilo'

export interface Opcion { v: string; t: string }

const sel = {
  height: 28, padding: '0 8px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '12.5px', color: V.tinta, background: '#FFFFFF', maxWidth: 200,
}

export function FiltrosMovimientos({ lugares, personas }: { lugares: Opcion[]; personas: Opcion[] }) {
  const router = useRouter()
  const ruta = usePathname()
  const sp = useSearchParams()
  const poner = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString())
    if (v) q.set(k, v)
    else q.delete(k)
    router.replace(`${ruta}${q.toString() ? `?${q}` : ''}`, { scroll: false })
  }
  return (
    <>
      <select aria-label="Ventana" value={sp.get('dias') ?? '30'} onChange={(e) => poner('dias', e.target.value === '30' ? '' : e.target.value)} style={sel} data-testid="filtro-dias">
        <option value="7">Últimos 7 días</option>
        <option value="30">Últimos 30 días</option>
        <option value="90">Últimos 90 días</option>
        <option value="todo">Todo el historial</option>
      </select>
      <select aria-label="Ubicación" value={sp.get('ubicacion') ?? ''} onChange={(e) => poner('ubicacion', e.target.value)} style={sel}>
        <option value="">Todas las ubicaciones</option>
        {lugares.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select aria-label="Usuario" value={sp.get('usuario') ?? ''} onChange={(e) => poner('usuario', e.target.value)} style={sel}>
        <option value="">Todos los usuarios</option>
        {personas.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </>
  )
}
