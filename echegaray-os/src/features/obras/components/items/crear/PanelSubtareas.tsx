'use client'

// C08 · MC9 — SUBTAREAS · DESCOMPONER UNA TAREA. Porte literal del aside de `C08.html` (420) y de `MC9.html`.
//
//   escritorio  camino 11,5 faint · nombre 16/600 · «kg · 1.840 · 01/09 → 04/09 · Cuadrilla 1» 12,5 muted
//               eyebrow «Método de avance» + tres chips de 32 (Cantidad · Pasos · Manual) + la nota 12 faint
//               eyebrow «Subtareas» + «0 de 4 hechas»; filas de 44: casilla 14 · nombre 13,5 · fechas 12 muted ·
//               lápiz 12 faint; «Nueva subtarea · Enter» (40, campo en línea); al pie «Guardar» (primaria) y
//               «Dividir en frentes» (borde)
//   teléfono    a pantalla completa con chips de 36, filas de 52 (casilla 16), «Nueva subtarea» 48, la nota
//               «No pesan en el promedio ni entran al cronograma.» y la primaria «Guardar»

import { useState, type KeyboardEvent } from 'react'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { CabeceraTelefono, Casilla, Chip, Eyebrow, ESTILO_PRIMARIA_32, ESTILO_SECUNDARIA_32, PiePrimaria, Resultado } from './Piezas'
import { rotuloPlan, rotuloUniCant, textoDePasos } from '../../../services/estructura'
import type { NodoObra } from '../../../services/wbs'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

type Metodo = 'cantidad' | 'pasos' | 'manual'
const METODOS: { id: Metodo; label: string; icono: React.ReactNode }[] = [
  { id: 'cantidad', label: 'Cantidad', icono: <Ico d={P.cantidad} s={12} /> },
  { id: 'pasos', label: 'Pasos', icono: <Ico d={P.paso} s={12} /> },
  { id: 'manual', label: 'Manual', icono: <Ico d={P.editar} s={12} /> },
]

export function PanelSubtareas({ nodo, camino, subtareas, estados, guardar, alCerrar, alGuardado, alDividir }: {
  nodo: NodoObra
  camino: string
  subtareas: NodoObra[]
  /** id → estado («hecha» = tildada). */
  estados: Record<string, string | null>
  guardar: AccionFormulario
  alCerrar: () => void
  alGuardado: () => void
  alDividir: () => void
}) {
  const inicial: Metodo = nodo.metodo_avance === 'cantidad' || nodo.metodo_avance === 'pasos' ? nodo.metodo_avance : 'manual'
  const [metodo, setMetodo] = useState<Metodo>(inicial)
  const [hechas, setHechas] = useState<Set<string>>(() => new Set(subtareas.filter((s) => estados[s.id] === 'hecha').map((s) => s.id)))
  const [nuevas, setNuevas] = useState<string[]>([])
  const [borrador, setBorrador] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const total = subtareas.length + nuevas.length
  const sub = [rotuloUniCant(nodo.unidad, nodo.cantidad_objetivo), rotuloPlan(nodo.inicio_plan, nodo.fin_plan), nodo.cuadrilla].filter(Boolean).join(' · ')

  const alternar = (id: string) => setHechas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const agregar = () => { const t = borrador.trim(); if (t.length >= 2) { setNuevas((p) => [...p, t]); setBorrador('') } }
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }

  const enviar = async () => {
    if (pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('metodo', metodo)
    if (borrador.trim().length >= 2) form.append('nueva', borrador.trim())
    for (const n of nuevas) form.append('nueva', n)
    for (const id of hechas) form.append('hecha', id)
    const r = await guardar(form)
    setPendiente(false)
    if (r.ok) { setResultado({ ok: true, texto: r.mensaje ?? 'Guardado.' }); setNuevas([]); setBorrador(''); alGuardado() }
    else setResultado({ ok: false, texto: r.error })
  }

  const lista = (alto: 44 | 52, tam: 14 | 16) => (
    <>
      {subtareas.map((s) => (
        <div key={s.id} data-testid={`subtarea-${s.id}`} style={{ minHeight: `${alto}px`, display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: alto === 44 ? '13.5px' : '14px', color: C.tinta }}>
          <Casilla marcada={hechas.has(s.id)} onClick={() => alternar(s.id)} etiqueta={`${s.nombre} hecha`} tam={tam} testid={`hecha-${s.id}`} />
          {alto === 44
            ? <><span style={{ flex: 1 }}>{s.nombre}</span><span style={{ fontSize: '12px', color: C.tintaSuave }}>{rotuloPlan(s.inicio_plan, s.fin_plan) ?? ''}</span></>
            : <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre}</div>
              <div style={{ fontSize: '12px', color: C.tintaSuave }}>{rotuloPlan(s.inicio_plan, s.fin_plan) ?? 'sin fechas'}</div>
            </div>}
          <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.editar} s={alto === 44 ? 12 : 13} /></span>
        </div>
      ))}
      {nuevas.map((n, i) => (
        <div key={`nueva-${i}`} data-testid={`subtarea-nueva-${i}`} style={{ minHeight: `${alto}px`, display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: alto === 44 ? '13.5px' : '14px', color: C.tinta, background: C.marcaFila }}>
          <Casilla marcada={false} onClick={() => undefined} etiqueta={n} tam={tam} apagada />
          <span style={{ flex: 1 }}>{n}</span>
          <span style={{ fontSize: '12px', color: C.tenue }}>nueva</span>
          <button type="button" onClick={() => setNuevas((p) => p.filter((_, k) => k !== i))} aria-label={`Quitar ${n}`} style={{ color: C.tenue, display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}><Ico d={P.cerrar} s={12} /></button>
        </div>
      ))}
      <div style={{ height: alto === 44 ? '40px' : '48px', display: 'flex', alignItems: 'center', gap: alto === 44 ? '9px' : '8px', fontSize: alto === 44 ? '13px' : '13.5px', color: C.tintaSuave }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={alto === 44 ? 12 : 13} /></span>
        <input value={borrador} onChange={(e) => setBorrador(e.target.value)} onKeyDown={teclas} onBlur={agregar} placeholder="Nueva subtarea" aria-label="Nueva subtarea" data-testid={alto === 44 ? 'campo-nueva-subtarea' : 'campo-nueva-subtarea-telefono'}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: C.tinta, padding: 0 }} />
        {alto === 44 && <span style={{ fontFamily: 'var(--font-plex-mono), monospace', fontSize: '11px', color: C.tenue }}>Enter</span>}
      </div>
    </>
  )

  return (
    <>
      {/* ═══ ESCRITORIO (C08) ═══ */}
      <aside className="hidden md:flex" data-testid="panel-subtareas" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '18px', minHeight: '560px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>{camino}</span>
            <button type="button" onClick={alCerrar} aria-label="Cerrar" data-testid="cerrar-subtareas" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.tinta }}>{nodo.nombre}</div>
          {sub && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{sub}</div>}
        </div>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Eyebrow>Método de avance</Eyebrow>
          <div style={{ display: 'flex', gap: '6px' }}>
            {METODOS.map((m) => <Chip key={m.id} activo={metodo === m.id} onClick={() => setMetodo(m.id)} icono={m.icono} testid={`metodo-${m.id}`}>{m.label}</Chip>)}
          </div>
          <div style={{ fontSize: '12px', color: C.tenue }}>{metodo === 'pasos' ? textoDePasos(total, true) : metodo === 'cantidad' ? 'Cantidad: el avance sale de lo ejecutado sobre la cantidad objetivo.' : 'Manual: el avance lo declara una persona, con su criterio escrito.'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Eyebrow derecha={`${hechas.size} de ${total} hechas`}>Subtareas</Eyebrow>
          {lista(44, 14)}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button type="button" onClick={enviar} disabled={pendiente} data-testid="guardar-subtareas" style={ESTILO_PRIMARIA_32}><Ico d={P.ok} s={13} />{pendiente ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={alDividir} data-testid="ir-a-frentes" style={ESTILO_SECUNDARIA_32}>Dividir en frentes</button>
        </div>
      </aside>

      {/* ═══ TELÉFONO (MC9) ═══ */}
      <div className="flex md:hidden" data-testid="panel-subtareas-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        <CabeceraTelefono miga={camino} titulo={nodo.nombre} alVolver={alCerrar} />
        <div style={{ padding: '16px 16px 110px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Eyebrow>Método de avance</Eyebrow>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', scrollbarWidth: 'none' }}>
              {METODOS.map((m) => <Chip key={m.id} activo={metodo === m.id} onClick={() => setMetodo(m.id)} icono={m.id === 'cantidad' ? undefined : m.icono} alto={36} testid={`metodo-telefono-${m.id}`}>{m.label}</Chip>)}
            </div>
            <div style={{ fontSize: '12px', color: C.tenue }}>{metodo === 'pasos' ? textoDePasos(total, false) : metodo === 'cantidad' ? 'El avance sale de lo ejecutado.' : 'El avance lo declara una persona.'}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Eyebrow derecha={`${hechas.size} de ${total}`}>Subtareas</Eyebrow>
            {lista(52, 16)}
          </div>
          <div style={{ fontSize: '12px', color: C.tenue }}>No pesan en el promedio ni entran al cronograma.</div>
        </div>
      </div>
      <PiePrimaria rotulo="Guardar" icono={<Ico d={P.ok} s={15} />} onClick={enviar} testid="guardar-subtareas-telefono" pendiente={pendiente} />
    </>
  )
}
