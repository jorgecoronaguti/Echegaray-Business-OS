'use client'

// REPORTAR UNA FALLA MECÁNICA de un rodado o una máquina, dentro de su panel de Mantenimiento.
//
// Usa el circuito que ya existe (`reportar_problema_activo`): deja el reporte con su fecha y cambia el
// estado del activo, nunca su ubicación. Las dos respuestas son las que decide el taller: sigue en uso (queda
// «requiere mantenimiento») o no se puede usar (queda «fuera de servicio»). «No la encuentro» es otro aviso
// y no se ofrece acá.

import { useRef, useState } from 'react'
import { reportarProblemaAction } from '../services/acciones'
import { subirFotosDeActivo } from '../services/subida-foto'
import { rotuloElegidas, sumarElegidas } from '../logica/fotos'
import type { TipoIncidencia } from '../types'
import { V, botonPrimarioGrande, campo, eyebrow } from './estilo'

export const FALLAS: { v: Extract<TipoIncidencia, 'fallando' | 'no_anda'>; t: string; d: string }[] = [
  { v: 'fallando', t: 'Sigue en uso, pero falla', d: 'queda «requiere mantenimiento»' },
  { v: 'no_anda', t: 'No se puede usar', d: 'queda «fuera de servicio» hasta que vuelva' },
]

export function FormularioFalla({ activo, nombre, variasFotos, onHecho, onCancelar }: {
  activo: string
  nombre: string
  variasFotos: boolean
  onHecho: (texto: string) => void
  onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<(typeof FALLAS)[number]['v'] | null>(null)
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!tipo) return setError('Elegí si sigue en uso o si no se puede usar.')
    if (texto.trim().length < 3) return setError('Contá en una línea qué le pasa (3 letras o más).')
    setEnviando(true)
    setError(null)
    const s = await subirFotosDeActivo(fotos, `incidencias/${activo}`)
    if (!s.ok) { setEnviando(false); return setError(s.error) }
    const r = await reportarProblemaAction({ activo, tipo, texto, fotos: s.rutas }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'No se pudo reportar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    const queda = tipo === 'no_anda' ? 'queda fuera de servicio' : 'queda en «requiere mantenimiento»'
    onHecho(`Falla reportada: ${nombre} ${queda}. No se movió de lugar.${'mensaje' in r && r.mensaje ? ` ${r.mensaje}` : ''}`)
  }

  return (
    <div data-testid="formulario-falla" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={{ ...eyebrow, display: 'block', marginBottom: 4 }}>Cómo está</span>
        <div role="radiogroup">
          {FALLAS.map((t, i) => (
            <label key={t.v} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 52, borderBottom: i < FALLAS.length - 1 ? `1px solid ${V.linea}` : undefined, cursor: 'pointer' }}>
              <input type="radio" name="falla-tipo" checked={tipo === t.v} onChange={() => setTipo(t.v)} style={{ width: 16, height: 16, accentColor: V.grafito }} data-testid={`falla-${t.v}`} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px' }}>{t.t}</span>
                <span style={{ fontSize: '12.5px', color: V.apagado }}>{t.d}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label>
        <span style={{ ...eyebrow, display: 'block', marginBottom: 4 }}>Qué le pasa</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={400} rows={3} placeholder="Pierde aceite, no arranca en frío, hace ruido al frenar…"
          style={{ ...campo, height: 'auto', minHeight: 72, padding: 10, fontSize: '13.5px' }} data-testid="falla-texto" />
      </label>

      <button type="button" onClick={() => input.current?.click()} data-testid="falla-foto"
        style={{ height: 38, border: `1px dashed ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: fotos.length ? V.pos : V.tinta }}>
        {rotuloElegidas(fotos.length, variasFotos)}
      </button>
      <input ref={input} type="file" accept="image/*" multiple={variasFotos} hidden
        onChange={(e) => { const nuevas = Array.from(e.target.files ?? []); setFotos((antes) => sumarElegidas(antes, nuevas, variasFotos)); e.target.value = '' }} />

      {error && <div role="alert" style={{ fontSize: '12.5px', color: V.neg, lineHeight: 1.5 }} data-testid="falla-error">{error}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={enviar} disabled={enviando} data-testid="guardar-falla" style={{ ...botonPrimarioGrande, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Reportando…' : 'Reportar la falla'}
        </button>
        <button type="button" onClick={onCancelar} style={{ fontSize: '13px', color: V.apagado, padding: '0 10px' }}>Cancelar</button>
      </div>
    </div>
  )
}
