'use client'

// M02 · ESCANEAR — en serie: cada lectura se apila abajo y la cámara sigue abierta.
//
// Lector: `BarcodeDetector` si el navegador lo tiene (Chrome de Android); si no, `jsqr` sobre el cuadro
// de la cámara (Safari de iPhone). Y SIEMPRE el camino manual: tipear el código impreso en la etiqueta.
// El QR acelera; nada depende de él.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { codigoDeLectura, normalizarCodigo } from '../../logica/codigo'
import { MONO, V } from '../estilo'
import { primarioTelefono } from './MarcoTelefono'

export interface ItemCatalogo { id: string; codigo: string; nombre: string; baja: boolean }

interface Lectura { codigo: string; item: ItemCatalogo | null }
interface Detector { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type ConstructorDetector = new (o: { formats: string[] }) => Detector

const GRIS = '#C9C4C2'
const FILO = '#6B6B67'

export function Escaner({ catalogo, en }: { catalogo: ItemCatalogo[]; en: string | null }) {
  const video = useRef<HTMLVideoElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const pista = useRef<MediaStreamTrack | null>(null)
  const ultimo = useRef<{ t: string; en: number }>({ t: '', en: 0 })
  const [leidas, setLeidas] = useState<Lectura[]>([])
  const [camara, setCamara] = useState<'pidiendo' | 'andando' | 'sin'>('pidiendo')
  const [linterna, setLinterna] = useState(false)
  const [manual, setManual] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const q = en ? `en=${encodeURIComponent(en)}` : ''

  const agregar = useCallback((texto: string, desdeCamara: boolean) => {
    const c = desdeCamara ? codigoDeLectura(texto) : normalizarCodigo(texto)
    if (!c) {
      setAviso('Ese QR no es una etiqueta de Echegaray.')
      return
    }
    const ahora = Date.now()
    if (ultimo.current.t === c && ahora - ultimo.current.en < 2500) return
    ultimo.current = { t: c, en: ahora }
    setAviso(null)
    if (navigator.vibrate) navigator.vibrate(60)
    setLeidas((l) => (l.some((x) => x.codigo === c) ? l : [...l, { codigo: c, item: catalogo.find((x) => x.codigo === c) ?? null }]))
  }, [catalogo])

  useEffect(() => {
    let vivo = true
    let flujo: MediaStream | null = null
    let reloj: ReturnType<typeof setTimeout> | null = null
    const Ctor = (globalThis as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector
    const detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null
    async function leer() {
      const v = video.current
      const cv = lienzo.current
      if (!vivo || !v || !cv || v.readyState < 2) { reloj = setTimeout(leer, 300); return }
      try {
        if (detector) {
          const r = await detector.detect(v)
          if (r[0]?.rawValue) agregar(r[0].rawValue, true)
        } else {
          const w = 480
          const h = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w) || 480
          cv.width = w
          cv.height = h
          const ctx = cv.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h)
            const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
            if (r?.data) agregar(r.data, true)
          }
        }
      } catch { /* un cuadro que no se pudo leer no es un error: se prueba el siguiente */ }
      reloj = setTimeout(leer, 250)
    }
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin cámara')
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (!vivo) { flujo.getTracks().forEach((t) => t.stop()); return }
        pista.current = flujo.getVideoTracks()[0] ?? null
        if (video.current) {
          video.current.srcObject = flujo
          await video.current.play().catch(() => undefined)
        }
        setCamara('andando')
        leer()
      } catch {
        setCamara('sin')
      }
    })()
    return () => {
      vivo = false
      if (reloj) clearTimeout(reloj)
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [agregar])

  async function alternarLinterna() {
    const t = pista.current
    if (!t) return
    try {
      await t.applyConstraints({ advanced: [{ torch: !linterna } as MediaTrackConstraintSet] })
      setLinterna(!linterna)
    } catch {
      setAviso('Este teléfono no deja prender la linterna desde el navegador.')
    }
  }

  const conocidas = leidas.filter((x) => x.item && !x.item.baja)
  const primera = leidas.length === 1 ? leidas[0] : null
  const ficha = (c: string) => `/campo/herramientas/a/${encodeURIComponent(c)}${q ? `?${q}` : ''}`
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="escaner">
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 18 }}>
        {camara === 'andando' && <button type="button" onClick={alternarLinterna} style={{ fontSize: '13px', color: GRIS }}>{linterna ? 'Apagar linterna' : 'Linterna'}</button>}
      </div>
      <div style={{ alignSelf: 'center', width: 254, height: 254, border: `2px solid ${V.marca}`, borderRadius: 12, overflow: 'hidden', background: V.grafito, position: 'relative' }}>
        <video ref={video} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: camara === 'andando' ? 'block' : 'none' }} />
        {camara !== 'andando' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', fontSize: '13px', color: GRIS }}>
            {camara === 'pidiendo' ? 'Abriendo la cámara…' : 'Sin cámara: tipeá el código de la etiqueta abajo.'}
          </div>
        )}
        <canvas ref={lienzo} hidden />
      </div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: '14px' }}>Apuntá al código QR</div>
        <div style={{ fontSize: '12.5px', color: GRIS }}>Uno tras otro: cada lectura se apila abajo.</div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); agregar(manual, false); setManual('') }} style={{ display: 'flex', gap: 8 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="o tipeá el código: AMO-007" aria-label="Código de la etiqueta" data-testid="codigo-manual"
          style={{ flex: 1, minWidth: 0, height: 46, padding: '0 12px', borderRadius: 6, border: `1px solid ${FILO}`, background: V.grafito, color: '#FFFFFF', fontFamily: MONO, fontSize: '15px' }} />
        <button type="submit" style={{ height: 46, padding: '0 14px', borderRadius: 6, border: `1px solid ${FILO}`, color: '#FFFFFF', fontSize: '14px' }}>Agregar</button>
      </form>
      {aviso && <div role="status" style={{ fontSize: '13px', color: V.marca }}>{aviso}</div>}

      <div style={{ margin: 'auto -16px -18px', background: '#2A2A29', borderTop: `1px solid ${V.grafito}`, padding: '12px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', bottom: 0 }}>
        {leidas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="leidas">
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{leidas.length} {leidas.length === 1 ? 'leída' : 'leídas'}</div>
            {leidas.map((l) => (
              <Link key={l.codigo} href={ficha(l.codigo)} prefetch={false} style={{ fontSize: '13px', color: l.item ? '#FFFFFF' : V.marca, display: 'flex', gap: 8 }}>
                <span style={{ fontFamily: MONO, color: GRIS }}>{l.codigo}</span>
                <span>{l.item ? `${l.item.nombre}${l.item.baja ? ' · dada de baja' : ''}` : 'no está en el sistema ›'}</span>
              </Link>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          {conocidas.length > 0 ? (
            <Link href={`/campo/herramientas/mover?ids=${conocidas.map((x) => x.item!.id).join(',')}${q ? `&${q}` : ''}`} prefetch={false} style={primarioTelefono} data-testid="mover-leidas">
              {conocidas.length === 1 ? 'Mover 1' : `Mover las ${conocidas.length}`}
            </Link>
          ) : primera ? (
            <Link href={ficha(primera.codigo)} prefetch={false} style={primarioTelefono}>Ver qué es</Link>
          ) : (
            <span style={{ ...primarioTelefono, opacity: 0.35 }}>Mover</span>
          )}
          <Link href={`/campo/herramientas/buscar${q ? `?${q}` : ''}`} prefetch={false} style={{ height: 52, padding: '0 24px', display: 'flex', alignItems: 'center', borderRadius: 6, border: `1px solid ${FILO}`, color: '#FFFFFF', fontSize: '15px' }}>
            Buscar
          </Link>
        </div>
      </div>
    </div>
  )
}
