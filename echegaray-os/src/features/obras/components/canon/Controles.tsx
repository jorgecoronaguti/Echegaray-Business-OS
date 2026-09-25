'use client'

// EL COMBO Y EL CAMPO DE FECHA DEL DISEÑO — porte de «De cero al final» (B03 · B05 · MB2 · 02b · M03 · 14).
//
//   combo   `height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;
//            border:1px solid #D7D5CF;border-radius:6px;font-size:13px` + chevron 12 `M6 9l6 6 6-6` #91918B.
//            Fondo blanco. En el teléfono 44px / 14px. Sin elegir: «elegir» o «sin cargar» en itálica faint.
//   fecha   el mismo campo, `font-family:'IBM Plex Mono'`, «01/09/2026» como texto: sin ícono de
//            calendario ni el formato del navegador (mm/dd/yyyy en una máquina en inglés).
//
// NO SON `<select>` NI `<input type=date>` NATIVOS: el nativo dibuja el fondo gris, la flecha del
// sistema y el formato del navegador, y el dueño lo marcó como «no es el diseño». Para los formularios
// que viajan por FormData cada control lleva un `<input type=hidden name=…>` con el valor canónico
// (la fecha en ISO `aaaa-mm-dd`), así la server action recibe exactamente lo mismo que antes.

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { C, MONO } from './tokens'
import { Ico, P } from './Ico'
import { isoADdmmaaaa, textoAIso } from '../../services/entradaTexto'

export interface OpcionCombo { valor: string; etiqueta: string; nota?: string | null }

type Alto = 26 | 28 | 32 | 34 | 44

function marco(alto: Alto, mono: boolean, apagado: boolean): CSSProperties {
  const grande = alto === 44
  return {
    height: `${alto}px`, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    padding: grande ? '0 12px' : '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
    fontSize: grande ? '14px' : alto <= 28 ? '12.5px' : '13px', fontFamily: mono ? MONO : 'inherit', color: C.tinta,
    background: apagado ? C.tenueFondo : C.superficie, boxSizing: 'border-box', outline: 'none', cursor: apagado ? 'default' : 'pointer',
    textAlign: 'left', lineHeight: 1.25,
  }
}

/**
 * El combo del diseño. `variante="texto"` es el conmutador sin borde (M06 «⌄ todo»): el mismo menú,
 * con el valor en 12px muted y el chevron a la izquierda.
 */
export function Combo({
  valor, opciones, alCambiar, name, alto = 32, vacio = 'elegir', testid, etiqueta, mono = false, apagado = false,
  variante = 'campo', ancho, alinearMenu = 'izquierda', abiertoInicial = false, alCerrar,
}: {
  valor: string
  opciones: readonly OpcionCombo[]
  alCambiar?: (v: string) => void
  /** Viaja en el FormData como un input oculto. */
  name?: string
  alto?: Alto
  /** Lo que dice sin elegir (itálica faint). */
  vacio?: string
  testid?: string
  etiqueta?: string
  mono?: boolean
  apagado?: boolean
  variante?: 'campo' | 'texto'
  ancho?: string
  alinearMenu?: 'izquierda' | 'derecha'
  /** Se monta abierto (una celda que pasa a edición al tocarla). */
  abiertoInicial?: boolean
  /** Se cerró sin elegir o después de elegir. */
  alCerrar?: () => void
}) {
  const [abierto, setAbiertoCrudo] = useState(abiertoInicial)
  const setAbierto = (v: boolean) => { setAbiertoCrudo(v); if (!v) alCerrar?.() }
  const [activo, setActivo] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const id = useId()
  const elegida = opciones.find((o) => o.valor === valor) ?? null

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent | TouchEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera) }
  }, [abierto])

  const abrir = () => {
    if (apagado) return
    setActivo(Math.max(0, opciones.findIndex((o) => o.valor === valor)))
    setAbierto(true)
  }
  const elegir = (v: string) => { setAbierto(false); if (v !== valor) alCambiar?.(v) }
  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (apagado) return
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); return }
    if (!abierto) return
    if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => Math.min(opciones.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = opciones[activo]; if (o) elegir(o.valor) }
    else if (e.key === 'Tab') setAbierto(false)
  }

  const texto = variante === 'texto'
  const boton: CSSProperties = texto
    ? { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.tintaSuave, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', lineHeight: 1.25 }
    : marco(alto, mono, apagado)

  return (
    <div ref={raiz} style={{ position: 'relative', width: texto ? undefined : ancho ?? '100%', display: texto ? 'inline-block' : 'block' }}>
      {name && <input type="hidden" name={name} value={valor} />}
      <button type="button" onClick={() => (abierto ? setAbierto(false) : abrir())} onKeyDown={teclas} disabled={apagado}
        aria-haspopup="listbox" aria-expanded={abierto} aria-controls={`${id}-lista`} aria-label={etiqueta}
        data-testid={testid} data-valor={valor} style={boton}>
        {texto && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.abajo} s={12} /></span>}
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          ...(elegida ? {} : { fontStyle: 'italic', color: C.tenue, fontFamily: 'inherit' }),
        }}>{elegida?.etiqueta ?? vacio}</span>
        {!texto && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.abajo} s={12} /></span>}
      </button>
      {abierto && (
        <ul role="listbox" id={`${id}-lista`} aria-label={etiqueta} style={{
          position: 'absolute', top: 'calc(100% + 4px)', [alinearMenu === 'derecha' ? 'right' : 'left']: 0, zIndex: 60,
          minWidth: texto ? '160px' : '100%', maxWidth: '320px', maxHeight: '264px', overflowY: 'auto', margin: 0, padding: '4px 0',
          listStyle: 'none', background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '8px',
          boxShadow: '0 6px 20px rgba(31,31,30,.10)', fontFamily: 'inherit',
        }}>
          {opciones.map((o, i) => {
            const sel = o.valor === valor
            return (
              <li key={o.valor || `vacio-${i}`} role="option" aria-selected={sel} data-testid={testid ? `${testid}-op-${o.valor || 'vacio'}` : undefined}
                onMouseDown={(e) => { e.preventDefault(); elegir(o.valor) }} onMouseEnter={() => setActivo(i)}
                style={{
                  minHeight: alto === 44 ? '44px' : '32px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: alto === 44 ? '14px' : '13px', color: o.valor === '' ? C.tintaSuave : C.tinta, cursor: 'pointer',
                  background: i === activo ? C.tenueFondo : 'transparent', fontWeight: sel ? 500 : 400, lineHeight: 1.25,
                }}>
                <span style={{ width: '12px', display: 'flex', color: C.tinta, flexShrink: 0 }}>{sel && <Ico d={P.ok} s={12} />}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: mono ? MONO : 'inherit' }}>{o.etiqueta}</span>
                {o.nota && <span style={{ fontSize: '11.5px', color: C.tenue, whiteSpace: 'nowrap' }}>{o.nota}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── LA FECHA ────────────────────────────────────────────────────────────────

/**
 * El campo de fecha del diseño: texto mono «dd/mm/aaaa». Controlado (`valor` ISO + `alCambiar`) o no
 * controlado (`valorInicial` + `name`, para los formularios de server action).
 */
export function CampoFecha({
  valor, valorInicial, alCambiar, name, alto = 32, testid, etiqueta, anioBase, apagado = false, placeholder = 'dd/mm/aaaa',
}: {
  valor?: string
  valorInicial?: string | null
  alCambiar?: (iso: string) => void
  name?: string
  alto?: Alto
  testid?: string
  etiqueta?: string
  anioBase?: number
  apagado?: boolean
  placeholder?: string
}) {
  const controlado = valor !== undefined
  const [iso, setIso] = useState<string>(controlado ? valor ?? '' : valorInicial ?? '')
  const [texto, setTexto] = useState<string>(isoADdmmaaaa(controlado ? valor : valorInicial))
  const [error, setError] = useState(false)
  // Si el valor controlado cambia desde afuera (precarga, «Limpiar»), el texto lo sigue.
  const [visto, setVisto] = useState(valor)
  if (controlado && valor !== visto) { setVisto(valor); setIso(valor ?? ''); setTexto(isoADdmmaaaa(valor)); setError(false) }

  const confirmar = (t: string) => {
    if (!t.trim()) { setError(false); setIso(''); alCambiar?.(''); return }
    const r = textoAIso(t, anioBase)
    if (!r) { setError(true); return }
    setError(false); setIso(r); setTexto(isoADdmmaaaa(r)); alCambiar?.(r)
  }
  const grande = alto === 44
  return (
    <>
      {name && <input type="hidden" name={name} value={iso} />}
      <input type="text" inputMode="numeric" autoComplete="off" value={texto} placeholder={placeholder} disabled={apagado}
        aria-label={etiqueta} aria-invalid={error || undefined} data-testid={testid} data-iso={iso}
        onChange={(e) => {
          // Las barras se ponen solas mientras se tipea: «0109» → «01/09», «010926» → «01/09/26».
          let v = e.target.value
          if (/^\d{3,8}$/.test(v)) v = v.length <= 4 ? `${v.slice(0, 2)}/${v.slice(2)}` : `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`
          setTexto(v)
          const r = v.length >= 8 ? textoAIso(v, anioBase) : null
          if (r) { setError(false); setIso(r); alCambiar?.(r) }
        }}
        onBlur={(e) => confirmar(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') confirmar((e.target as HTMLInputElement).value) }}
        style={{
          height: `${alto}px`, width: '100%', padding: grande ? '0 12px' : '0 10px', boxSizing: 'border-box',
          border: `1px solid ${error ? C.neg : C.bordeFuerte}`, borderRadius: '6px', outline: 'none',
          // 16px en el teléfono: con menos, Safari de iOS agranda la página al enfocar (regla del proyecto).
          fontSize: grande ? '16px' : alto <= 28 ? '12.5px' : '13px', fontFamily: MONO, color: C.tinta,
          background: apagado ? C.tenueFondo : C.superficie, lineHeight: 1.25,
        }} />
    </>
  )
}
