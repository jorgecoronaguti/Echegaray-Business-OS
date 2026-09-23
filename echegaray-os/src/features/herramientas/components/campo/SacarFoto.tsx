'use client'

// «Sacar una foto» (M03): abre la cámara trasera, sube la foto al bucket `herramientas` DESDE EL
// NAVEGADOR (`services/subida-foto.ts`) y la guarda en la ficha por `editar_activo` con la ruta.
// No toca ubicación ni estado.
//
// La misma pieza sirve en la ficha de escritorio (`variante="escritorio"`): ahí no hay cámara trasera
// —`capture` se ignora— y el botón elige un archivo. Una sola implementación para las dos caras: la
// foto de la ficha se cambia igual desde la obra y desde la oficina (paridad, dueño 23/09).

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { cambiarFotoAction, quitarFotoAction } from '../../services/acciones'
import { subirFotoDeActivo } from '../../services/subida-foto'
import { V } from '../estilo'

const GUARDADA = 'Foto guardada.'
const SUBIENDO = 'Subiendo…'

export function SacarFoto({ activo, variante = 'telefono', onGuardada, tieneFoto = false }: {
  activo: string
  variante?: 'telefono' | 'escritorio'
  /** Con foto puesta se ofrece «Quitar la foto»: la ficha queda sin foto (dueño, 23/09/2026). */
  tieneFoto?: boolean
  /** Escritorio: qué hacer después de guardar (refrescar el parque del espacio). */
  onGuardada?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [estado, setEstado] = useState<string | null>(null)
  async function subir(f: File) {
    setEstado(SUBIENDO)
    const s = await subirFotoDeActivo(f, activo)
    if (!s.ok) return setEstado(s.error)
    try {
      const r = await cambiarFotoAction({ activo, ruta: s.ruta })
      setEstado(r.ok ? GUARDADA : r.error)
      if (r.ok) (onGuardada ?? router.refresh)()
    } catch (e) {
      setEstado(e instanceof Error ? e.message : 'No se pudo guardar la foto')
    }
  }
  async function quitar() {
    setEstado('Quitando…')
    const r = await quitarFotoAction({ activo })
    setEstado(r.ok ? 'Foto quitada.' : r.error)
    if (r.ok) (onGuardada ?? router.refresh)()
  }
  const telefono = variante === 'telefono'
  const colorEstado = estado === GUARDADA || estado === 'Foto quitada.' ? V.pos : estado === SUBIENDO ? V.apagado : V.neg
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} data-testid="sacar-foto"
        style={telefono
          ? { minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', width: '100%', textAlign: 'left' }
          : { fontSize: '12px', color: V.apagado, textAlign: 'left' }}>
        {telefono ? <>Sacar una foto <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span></> : 'Cambiar la foto'}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="sacar-foto-archivo"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      {tieneFoto && (
        <button type="button" onClick={quitar} data-testid="quitar-foto"
          style={telefono
            ? { minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', width: '100%', textAlign: 'left', color: V.neg }
            : { fontSize: '12px', color: V.neg, textAlign: 'left' }}>
          Quitar la foto{telefono && <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>}
        </button>
      )}
      {estado && <div role="status" style={{ fontSize: telefono ? '12.5px' : '12px', color: colorEstado }}>{estado}</div>}
    </>
  )
}
