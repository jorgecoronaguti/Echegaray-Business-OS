'use client'

// «Sacar una foto» (M03): abre la cámara trasera y la sube al bucket `herramientas`. La foto se guarda
// en la ficha por `editar_activo` (no toca ubicación ni estado).

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { cambiarFotoAction } from '../../services/acciones'
import { V } from '../estilo'

export function SacarFoto({ activo }: { activo: string }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [estado, setEstado] = useState<string | null>(null)
  async function subir(f: File) {
    setEstado('Subiendo…')
    const fd = new FormData()
    fd.set('activo', activo)
    fd.set('foto', f)
    const r = await cambiarFotoAction(fd)
    setEstado(r.ok ? 'Foto guardada.' : r.error)
    if (r.ok) router.refresh()
  }
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} data-testid="sacar-foto"
        style={{ minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', width: '100%', textAlign: 'left' }}>
        Sacar una foto <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }} />
      {estado && <div role="status" style={{ fontSize: '12.5px', color: estado === 'Foto guardada.' ? V.pos : estado === 'Subiendo…' ? V.apagado : V.neg }}>{estado}</div>}
    </>
  )
}
