'use client'

// ELEGIR (O CARGAR) EL SERVICIO TÉCNICO — un proveedor (dueño, 23/09/2026: «puede formar parte de
// una categoría de proveedores»). Los del rubro «Servicio técnico» primero; cualquier otro proveedor
// se puede elegir igual (queda clasificado si no tenía rubro). Si no existe, se carga acá mismo con
// nombre y CUIT opcional: entra a Proveedores por la misma puerta que la ficha.
//
// Lo usan «Nueva» en Ubicaciones y «Servicio técnico…» en Mover: la misma lista, la misma alta.

import { useState } from 'react'
import { candidatosServicioTecnico } from '../logica/servicioTecnico'
import { servicioTecnicoAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { MONO, V, botonPrimarioGrande, botonSecundarioGrande, campo } from './estilo'

export function ElegirServicioTecnico({ alListo, alCancelar }: { alListo: (ubicacionId: string, nombre: string) => void; alCancelar: () => void }) {
  const { parque } = useHerramientas()
  const [busca, setBusca] = useState('')
  const [nuevo, setNuevo] = useState<{ nombre: string; cuit: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const candidatos = candidatosServicioTecnico(parque, busca).slice(0, 12)

  async function elegir(entrada: { proveedorId: string } | { nombre: string; cuit?: string }, nombre: string) {
    setEnviando(true)
    setError(null)
    const r = await servicioTecnicoAction(entrada)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    alListo(r.dato, nombre)
  }

  return (
    <div data-testid="elegir-servicio-tecnico" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>Un servicio técnico es un proveedor. Elegilo o cargalo.</div>
      {!nuevo && (
        <>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar proveedor por nombre o CUIT" style={{ ...campo, height: 32 }} autoFocus data-testid="buscar-proveedor" />
          <div role="listbox" style={{ display: 'flex', flexDirection: 'column', maxHeight: 220, overflowY: 'auto', border: `1px solid ${V.linea}`, borderRadius: 6 }}>
            {candidatos.length === 0 && <div style={{ padding: '10px 12px', fontSize: '12.5px', color: V.apagado }}>Ningún proveedor coincide.</div>}
            {candidatos.map((c) => (
              <button
                key={c.proveedor.id} type="button" role="option" aria-selected={false} disabled={enviando}
                onClick={() => elegir({ proveedorId: c.proveedor.id }, c.proveedor.nombre)}
                className="hover:bg-surface-quiet" data-testid="candidato-servicio-tecnico"
                style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, padding: '0 12px', fontSize: '13px', textAlign: 'left', borderBottom: `1px solid ${V.linea}` }}
              >
                <span style={{ flex: 1, minWidth: 0 }} className="truncate">{c.proveedor.nombre}</span>
                {c.proveedor.cuit && <span style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{c.proveedor.cuit}</span>}
                <span style={{ fontSize: '11.5px', color: c.esDelRubro ? V.tintaSuave : V.tenue }}>
                  {c.ubicacionId ? 'ya es un lugar' : c.esDelRubro ? 'servicio técnico' : (c.proveedor.rubro ?? c.proveedor.rubro_deducido ?? 'sin rubro')}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: '12.5px' }}>
            <button type="button" onClick={() => setNuevo({ nombre: busca, cuit: '' })} style={{ fontWeight: 600 }} data-testid="cargar-proveedor-nuevo">Cargar proveedor nuevo</button>
            <button type="button" onClick={alCancelar} style={{ color: V.apagado }}>Cancelar</button>
          </div>
        </>
      )}
      {nuevo && (
        <>
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del proveedor" style={{ ...campo, height: 32 }} autoFocus data-testid="nuevo-proveedor-nombre" />
          <input value={nuevo.cuit} onChange={(e) => setNuevo({ ...nuevo, cuit: e.target.value })} placeholder="CUIT (opcional)" inputMode="numeric" style={{ ...campo, height: 32, fontFamily: MONO }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={enviando || nuevo.nombre.trim().length < 2} onClick={() => elegir({ nombre: nuevo.nombre, cuit: nuevo.cuit || undefined }, nuevo.nombre.trim())}
              style={{ ...botonPrimarioGrande, height: 32 }} data-testid="crear-servicio-tecnico">
              Cargar y usar
            </button>
            <button type="button" onClick={() => setNuevo(null)} style={{ ...botonSecundarioGrande, height: 32 }}>Volver</button>
          </div>
        </>
      )}
      {error && <div style={{ fontSize: '12px', color: V.neg }} role="alert">{error}</div>}
    </div>
  )
}
