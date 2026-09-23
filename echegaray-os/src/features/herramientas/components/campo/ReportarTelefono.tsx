'use client'

// M07 · REPORTAR UN PROBLEMA — cambia el estado, no la ubicación. «No la encuentro» no da de baja.

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { reportarProblemaAction } from '../../services/acciones'
import { subirFotoDeActivo } from '../../services/subida-foto'
import type { TipoIncidencia } from '../../types'
import { TIPOS } from '../PanelReportar'
import { V, eyebrow } from '../estilo'
import { primarioTelefono } from './MarcoTelefono'

export function ReportarTelefono({ activo, nombre, volverA }: { activo: string; nombre: string; volverA: string }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoIncidencia | null>(null)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!tipo) return
    setEnviando(true)
    setError(null)
    // La foto va del teléfono al bucket; a la acción llega sólo la ruta (`logica/foto.ts`).
    let ruta: string | undefined
    if (foto) {
      const s = await subirFotoDeActivo(foto, `incidencias/${activo}`)
      if (!s.ok) { setEnviando(false); return setError(s.error) }
      ruta = s.ruta
    }
    const r = await reportarProblemaAction({ activo, tipo, texto, foto: ruta }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'No se pudo reportar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    router.push(volverA)
    router.refresh()
  }

  return (
    <>
      <h1 style={{ fontSize: '18px', fontWeight: 600 }}>{nombre}</h1>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={eyebrow}>Qué le pasa</div>
        {TIPOS.map((t, i) => (
          <label key={t.v} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 59, borderBottom: i < TIPOS.length - 1 ? `1px solid ${V.linea}` : undefined, cursor: 'pointer' }}>
            <input type="radio" name="tipo" checked={tipo === t.v} onChange={() => setTipo(t.v)} style={{ width: 22, height: 22, accentColor: V.grafito }} data-testid={`tipo-${t.v}`} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '15px' }}>{t.t}</span>
              <span style={{ fontSize: '12.5px', color: V.apagado }}>{t.d}</span>
            </span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
        <div style={eyebrow}>Contalo en una línea</div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={400} rows={3} data-testid="texto-reporte"
          style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: 12, fontSize: '15px', minHeight: 96 }} />
        <button type="button" onClick={() => input.current?.click()} style={{ height: 52, border: `1px dashed ${V.lineaFuerte}`, borderRadius: 6, fontSize: '14px', color: foto ? V.pos : V.tinta }}>
          {foto ? 'Foto lista · cambiar' : 'Agregar foto'}
        </button>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        <div style={{ fontSize: '13px', color: V.apagado, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12, lineHeight: 1.5 }}>No se mueve: sigue donde está. El taller decide si la retira.</div>
      </div>
      {error && <div role="alert" style={{ fontSize: '13px', color: V.neg }}>{error}</div>}
      <div style={{ position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex' }}>
        <button type="button" onClick={enviar} disabled={!tipo || enviando} style={{ ...primarioTelefono, opacity: tipo ? 1 : 0.45 }} data-testid="enviar-reporte">
          {enviando ? 'Reportando…' : 'Reportar'}
        </button>
      </div>
    </>
  )
}
