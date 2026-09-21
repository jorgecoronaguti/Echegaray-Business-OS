'use client'

// D13 · BAJA — la única acción que no se deshace. Motivo obligatorio.
//
// Diseño: «sólo dirección». Decisión del dueño (21/09): todos los niveles con permisos iguales, incluida
// la baja. No se filtra por rol; la base sólo exige un usuario logueado.

import { useEffect, useState } from 'react'
import { rotuloUbicacion } from '../logica/parque'
import { darDeBajaAction } from '../services/acciones'
import type { MotivoBaja } from '../types'
import { useHerramientas } from './Espacio'
import { ErrorPanel } from './PanelLateral'
import { botonPeligro, botonSecundarioGrande, eyebrow, V } from './estilo'

const MOTIVOS: { v: MotivoBaja; t: string }[] = [
  { v: 'robada', t: 'Robada' }, { v: 'perdida', t: 'Perdida' }, { v: 'descartada', t: 'Descartada' }, { v: 'vendida', t: 'Vendida' },
]

export function DialogoBaja({ id, onHecho }: { id: string; onHecho: (t: string) => void }) {
  const { parque, cerrar } = useHerramientas()
  const a = parque.activoPorId.get(id)
  const [motivo, setMotivo] = useState<MotivoBaja | null>(null)
  const [detalle, setDetalle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [cerrar])
  if (!a) return null

  async function confirmar() {
    if (!motivo || !a) return
    setEnviando(true)
    setError(null)
    const r = await darDeBajaAction({ activo: a.id, motivo, detalle })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(`${a.codigo} · ${a.nombre} quedó dado de baja.`)
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="titulo-baja" data-testid="dialogo-baja"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(250,250,248,.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px 16px' }}
    >
      <div style={{ width: 410, maxWidth: '100%', background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 8, padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 12px 32px rgba(0,0,0,.08)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div id="titulo-baja" style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-.01em' }}>Dar de baja {a.nombre}</div>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>{a.codigo} · última ubicación: {rotuloUbicacion(parque, a.ubicacion_id)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={eyebrow}>Motivo</div>
          <div role="radiogroup">
            {MOTIVOS.map((m, i) => (
              <label key={m.v} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, fontSize: '13.5px', borderBottom: i < MOTIVOS.length - 1 ? `1px solid ${V.linea}` : undefined, cursor: 'pointer' }}>
                <input type="radio" name="motivo-baja" value={m.v} checked={motivo === m.v} onChange={() => setMotivo(m.v)} data-testid={`motivo-${m.v}`} style={{ width: 16, height: 16, accentColor: V.grafito }} />
                {m.t}
              </label>
            ))}
          </div>
        </div>
        <textarea
          value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={400} rows={3}
          placeholder="Detalle: denuncia, a quién se vendió, desde cuándo falta"
          style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '10px', fontSize: '13px', resize: 'vertical' }}
        />
        <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.45 }}>Sale del inventario vivo. No se borra, conserva su historial y no puede moverse más.</div>
        <ErrorPanel texto={error} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" data-testid="confirmar-baja" disabled={!motivo || enviando} onClick={confirmar} style={{ ...botonPeligro, height: 34, padding: '0 13px', opacity: motivo ? 1 : 0.45 }}>
            {enviando ? 'Dando de baja…' : 'Dar de baja'}
          </button>
          <button type="button" onClick={cerrar} style={{ ...botonSecundarioGrande, height: 34, padding: '0 12px' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
