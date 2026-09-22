'use client'

// M14 · ALTA RÁPIDA EN OBRA — tres datos y una foto. Entra operativa, donde se eligió, con el nombre de
// quien la carga, y marcada «alta desde obra» para que administración la revise (aparece en el Resumen).

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { darDeAltaAction } from '../../services/acciones'
import { MONO, V, eyebrow } from '../estilo'
import { primarioTelefono } from './MarcoTelefono'

const campoTel = { height: 52, padding: '0 14px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '15px', width: '100%', background: '#FFFFFF' }

export function AltaTelefono({ codigo, lugares, lugarInicial, en }: {
  codigo: string | null
  lugares: { clave: string; rotulo: string }[]
  lugarInicial: string | null
  en: string | null
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [cod, setCod] = useState(codigo ?? '')
  const [lugar, setLugar] = useState(lugarInicial ?? '')
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const puede = nombre.trim().length >= 2 && !enviando

  async function enviar() {
    setEnviando(true)
    setError(null)
    const fd = new FormData()
    fd.set('clase', 'herramienta')
    fd.set('nombre', nombre)
    if (cod.trim()) fd.set('codigo', cod)
    if (lugar) fd.set('destino', lugar)
    fd.set('desde_obra', '1')
    if (foto) fd.set('foto', foto)
    const r = await darDeAltaAction(fd)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    const q = en ? `?en=${encodeURIComponent(en)}` : ''
    router.push(`/campo/herramientas/a/${encodeURIComponent(r.dato.codigo)}${q}`)
    router.refresh()
  }

  const rotuloLugar = lugares.find((l) => l.clave === lugar)?.rotulo
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600 }}>Tres datos</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>El resto lo completa administración.</div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>Qué es</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={160} autoFocus placeholder="Escalera de aluminio 7 tramos" style={{ ...campoTel, borderColor: V.grafito }} data-testid="alta-nombre" />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>{codigo ? 'Código leído' : 'Código (si tiene etiqueta)'}</span>
        <input value={cod} onChange={(e) => setCod(e.target.value)} maxLength={40} placeholder="se asigna solo" style={{ ...campoTel, fontFamily: MONO }} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>Dónde queda</span>
        <select value={lugar} onChange={(e) => setLugar(e.target.value)} style={campoTel} data-testid="alta-lugar">
          <option value="">Sin ubicación cargada</option>
          {lugares.map((l) => <option key={l.clave} value={l.clave}>{l.rotulo}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => input.current?.click()} style={{ height: 52, border: `1px dashed ${V.lineaFuerte}`, borderRadius: 6, fontSize: '14px', color: foto ? V.pos : V.tinta }}>
        {foto ? 'Foto lista · cambiar' : 'Sacar una foto'}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
      <div style={{ fontSize: '13px', color: V.apagado, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12, lineHeight: 1.5 }}>
        Entra como operativa{rotuloLugar ? `, en ${rotuloLugar}` : ''}, con tu nombre. Queda marcada «alta desde obra» para que administración la revise.
      </div>
      {error && <div role="alert" style={{ fontSize: '13px', color: V.neg }}>{error}</div>}
      <div style={{ position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex' }}>
        <button type="button" onClick={enviar} disabled={!puede} style={{ ...primarioTelefono, opacity: puede ? 1 : 0.45 }} data-testid="alta-confirmar">
          {enviando ? 'Guardando…' : 'Dar de alta'}
        </button>
      </div>
    </>
  )
}
