'use client'

// «Nueva» ubicación (D04): sólo servicio técnico o tercero. El Taller es uno solo (taller + almacén,
// dueño 21/09), una obra sale del índice de obras y un rodado es un activo: ninguno se crea acá.

import { useState } from 'react'
import { crearUbicacionAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { V, campo } from './estilo'

export function NuevaUbicacion() {
  const { refrescar, avisar } = useHerramientas()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'servicio_tecnico' | 'tercero'>('servicio_tecnico')
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} style={{ fontSize: '12.5px', color: V.apagado }} data-testid="nueva-ubicacion">Nueva</button>
  }
  async function crear() {
    const r = await crearUbicacionAction({ tipo, nombre, contacto })
    if (!r.ok) return setError(r.error)
    avisar(`Se creó «${nombre.trim()}».`)
    setAbierto(false)
    setNombre('')
    setContacto('')
    refrescar()
  }
  return (
    <div role="dialog" aria-label="Nueva ubicación" style={{ position: 'absolute', zIndex: 20, marginTop: 180, width: 290, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
      <div style={{ display: 'flex', gap: 12, fontSize: '12.5px' }}>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={tipo === 'servicio_tecnico'} onChange={() => setTipo('servicio_tecnico')} />Servicio técnico</label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={tipo === 'tercero'} onChange={() => setTipo('tercero')} />Tercero</label>
      </div>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" style={{ ...campo, height: 32 }} autoFocus />
      <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Contacto (opcional)" style={{ ...campo, height: 32 }} />
      {error && <div style={{ fontSize: '12px', color: V.neg }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, fontSize: '12.5px' }}>
        <button type="button" onClick={crear} disabled={nombre.trim().length < 2} style={{ fontWeight: 600 }}>Crear</button>
        <button type="button" onClick={() => setAbierto(false)} style={{ color: V.apagado }}>Cancelar</button>
      </div>
    </div>
  )
}
