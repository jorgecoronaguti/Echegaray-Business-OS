'use client'

// EL ÁRBOL DE LAS PANTALLAS DE ARMADO — porte literal de la grilla de `C04.html` (también C07, C08,
// C09) y de la lista de `MC2.html` (y MC10).
//
//   escritorio  `padding:12px 20px 30px`; grilla `minmax(0,1fr) 100px 80px 120px 80px 96px`, gap 16
//               cabecera 34: Ítem · Uni · cant · Pond. · Plan · Días · Método (eyebrow mono 10,5)
//               rubro 40: 12/600 uppercase .06em, línea line · épica 40: 13/600, línea tarjeta ·
//               historia 46: 13,5 · tarea 46, sangría 54 con un hueco de 12 y código de 52 ·
//               subtarea 46, sangría 72, opacidad .85; chevron 12 faint; código mono 11 faint
//               las celdas: mono 12,5 muted a la derecha; «sin fechas» en itálica faint
//               C04: fila nueva en `#FFF8D6` con el nombre subrayado 1,5px; «Nueva tarea en Platea» 40px
//               13 muted con «Enter · Tab baja a subtarea · Shift+Tab sube»; «Nuevo rubro» al final
//               C09: casilla de 14 delante del chevron; la fila elegida en `#FFF8D6`
//   teléfono    rubro 40 11,5/600 uppercase · épica 40 13/600 · historia y tarea 52 13,5; código mono
//               10,5 de 26 (44 en la tarea); el peso o «uni · cant» mono 12 a la derecha; «sin hijas»
//               itálica; «Nueva tarea en Platea» 44px; «Nuevo rubro» 44px
//               MC10: sólo las hojas, casilla 16, elegidas en `#FFF8D6` de borde a borde

import { useMemo, useState, type KeyboardEvent } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Casilla, Falta } from './Piezas'
import { filasVisiblesDelArbol, ROTULO_NIVEL, type FilaArbol, type NivelEstructura } from '../../../services/estructura'

export const GRID_ARBOL = 'minmax(0,1fr) 100px 80px 120px 80px 96px'
const SANGRIA: Record<number, number> = { 0: 0, 1: 18, 2: 36, 3: 54, 4: 72 }
const SANGRIA_TEL: Record<number, number> = { 0: 0, 1: 12, 2: 24, 3: 36, 4: 48 }

export interface NuevoEnArbol {
  /** Debajo de qué padre nace; null = un rubro nuevo. */
  padreId: string | null
  nombre: string
}

/** «Nueva tarea en Platea» · «Nueva historia en Fundaciones» · «Nuevo rubro». */
export function rotuloNuevo(nivel: NivelEstructura, padre: string | null): string {
  if (!padre) return 'Nuevo rubro'
  const r = ROTULO_NIVEL[nivel].toLowerCase()
  return `${nivel === 'rubro' ? 'Nuevo' : 'Nueva'} ${r} en ${padre}`
}

export function ArbolEstructura({
  filas, modo, foco = null, nuevo = null, nivelNuevo = 'tarea', alCambiarNuevo, alConfirmarNuevo, alPedirNuevo, alTab,
  sel, alAlternarSel, alAbrir, query = '',
}: {
  filas: FilaArbol[]
  modo: 'mano' | 'foco' | 'sel'
  /** La fila que el panel está mirando (C07/C08): en amarillo. */
  foco?: string | null
  nuevo?: NuevoEnArbol | null
  nivelNuevo?: NivelEstructura
  alCambiarNuevo?: (nombre: string) => void
  alConfirmarNuevo?: () => void
  alPedirNuevo?: (padreId: string | null) => void
  /** Tab baja un nivel (la nueva cuelga de la última hermana); Shift+Tab sube. */
  alTab?: (direccion: 'bajar' | 'subir') => void
  sel?: ReadonlySet<string>
  alAlternarSel?: (id: string) => void
  alAbrir?: (id: string) => void
  query?: string
}) {
  const [plegados, setPlegados] = useState<Set<string>>(new Set())
  const plegar = (id: string) => setPlegados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const q = query.trim().toLowerCase()
  const visibles = useMemo(() => {
    const v = filasVisiblesDelArbol(filas, plegados)
    if (!q) return v
    const coinciden = new Set(filas.filter((f) => f.nombre.toLowerCase().includes(q)).map((f) => f.id))
    const conAncestros = new Set<string>()
    const porId = new Map(filas.map((f) => [f.id, f]))
    for (const id of coinciden) {
      let f: FilaArbol | undefined = porId.get(id)
      while (f) { conAncestros.add(f.id); f = f.padreId ? porId.get(f.padreId) : undefined }
    }
    return v.filter((f) => conAncestros.has(f.id))
  }, [filas, plegados, q])
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas])

  // Después de cada contenedor y de su última descendiente visible va su «Nueva … en X».
  const ultimaDescendiente = useMemo(() => {
    const ultima = new Map<string, string>()
    for (const f of visibles) {
      let p = f.padreId
      while (p) { ultima.set(p, f.id); p = porId.get(p)?.padreId ?? null }
    }
    return ultima
  }, [visibles, porId])
  const contenedoresConAgregar = useMemo(() => {
    const salida = new Map<string, FilaArbol[]>()
    if (modo !== 'mano') return salida
    for (const c of visibles) {
      if (!c.esContenedor || plegados.has(c.id)) continue
      const ancla = ultimaDescendiente.get(c.id) ?? c.id
      const l = salida.get(ancla) ?? []
      l.push(c)
      salida.set(ancla, l)
    }
    return salida
  }, [visibles, modo, plegados, ultimaDescendiente])

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); alConfirmarNuevo?.() }
    else if (e.key === 'Tab') { e.preventDefault(); alTab?.(e.shiftKey ? 'subir' : 'bajar') }
    else if (e.key === 'Escape') { e.preventDefault(); alPedirNuevo?.(null) }
  }

  const filaNueva = (padreId: string | null, escritorio: boolean) => {
    const padre = padreId ? porId.get(padreId) ?? null : null
    const activa = nuevo != null && nuevo.padreId === padreId
    const rotulo = rotuloNuevo(nivelNuevo, padre?.nombre ?? null)
    const sangria = padre ? SANGRIA[Math.min(4, padre.profundidad + 1)] : 0
    const sangriaTel = padre ? SANGRIA_TEL[Math.min(4, padre.profundidad + 1)] : 0
    if (activa) {
      return escritorio ? (
        <div key={`nuevo-${padreId ?? 'raiz'}`} data-testid="fila-nueva" style={{ display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', minHeight: '46px', alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`, background: C.marcaFila, fontSize: '13.5px' }}>
          <div style={{ paddingLeft: `${sangria}px`, display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span style={{ width: '12px' }} />
            <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, width: '52px' }}>{padre ? `${padre.codigo}.${(filas.filter((f) => f.padreId === padreId).length + 1)}` : String(filas.filter((f) => !f.padreId).length + 1)}</span>
            <input autoFocus value={nuevo?.nombre ?? ''} onChange={(e) => alCambiarNuevo?.(e.target.value)} onKeyDown={teclas} data-testid="campo-nuevo-nombre"
              placeholder={rotulo} aria-label={rotulo}
              style={{ border: 'none', borderBottom: `1.5px solid ${C.grafito}`, paddingBottom: '1px', background: 'transparent', font: 'inherit', color: C.tinta, outline: 'none', minWidth: '240px' }} />
          </div>
          <div /><div /><div /><div /><div />
        </div>
      ) : (
        <div key={`nuevo-tel-${padreId ?? 'raiz'}`} data-testid="fila-nueva-telefono" style={{ minHeight: '52px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: `${sangriaTel}px`, borderBottom: `1px solid ${C.bordeTarjeta}`, background: C.marcaFila, fontSize: '13.5px' }}>
          <span style={{ width: '12px' }} />
          <input autoFocus value={nuevo?.nombre ?? ''} onChange={(e) => alCambiarNuevo?.(e.target.value)} onKeyDown={teclas} placeholder={rotulo} aria-label={rotulo}
            style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: `1.5px solid ${C.grafito}`, background: 'transparent', font: 'inherit', color: C.tinta, outline: 'none' }} />
        </div>
      )
    }
    return escritorio ? (
      <button key={`agregar-${padreId ?? 'raiz'}`} type="button" onClick={() => alPedirNuevo?.(padreId)} data-testid={`agregar-en-${padreId ?? 'raiz'}`}
        style={{ font: 'inherit', height: '40px', display: 'flex', alignItems: 'center', gap: '9px', paddingLeft: `${sangria}px`, fontSize: '13px', color: C.tintaSuave, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        <span style={{ width: '12px' }} />
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>
        <span>{rotulo}</span>
        {nuevo == null && padreId != null && (
          <><span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, marginLeft: '8px' }}>Enter</span><span style={{ color: C.tenue, fontSize: '12px' }}>· Tab baja a subtarea · Shift+Tab sube</span></>
        )}
      </button>
    ) : (
      <button key={`agregar-tel-${padreId ?? 'raiz'}`} type="button" onClick={() => alPedirNuevo?.(padreId)} data-testid={`agregar-telefono-en-${padreId ?? 'raiz'}`}
        style={{ font: 'inherit', height: '44px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: `${sangriaTel}px`, fontSize: '13px', color: C.tintaSuave, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>{rotulo}
      </button>
    )
  }

  const celda = (v: string | null, italica = false, color: string = C.tintaSuave) => (
    <div style={{ fontSize: '12.5px', color, textAlign: 'right', fontFamily: MONO }}>
      {v == null ? '' : italica ? <Falta>{v}</Falta> : v}
    </div>
  )

  return (
    <>
      {/* ═══ ESCRITORIO ═══ */}
      {/* La grilla declara 476px que no ceden: por debajo de eso scrollea por dentro (`overflowX` + `minWidth`). */}
      <div className="hidden md:flex" data-testid="arbol-estructura" style={{ padding: '12px 20px 30px', flexDirection: 'column', minWidth: 0, overflowX: 'auto' }}>
      <div style={{ minWidth: '760px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
          <div>Ítem</div><div style={{ textAlign: 'right' }}>Uni · cant</div><div style={{ textAlign: 'right' }}>Pond.</div>
          <div style={{ textAlign: 'right' }}>Plan</div><div style={{ textAlign: 'right' }}>Días</div><div style={{ textAlign: 'right' }}>Método</div>
        </div>
        {visibles.length === 0 && modo !== 'mano' && (
          <div style={{ padding: '24px 0', fontSize: '12.5px', color: C.tintaSuave }}>{q ? `Nada coincide con «${query}».` : 'Esta obra todavía no tiene trabajo cargado.'}</div>
        )}
        {visibles.map((f) => {
          const rubro = f.profundidad === 0
          const epica = f.profundidad === 1
          const elegida = sel?.has(f.id) ?? false
          const enFoco = foco === f.id || elegida
          const abierto = !plegados.has(f.id)
          return (
            <div key={f.id}>
              <div role="row" data-testid={`arbol-${f.id}`} onClick={() => (modo === 'sel' ? alAlternarSel?.(f.id) : alAbrir?.(f.id))} style={{
                display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', minHeight: rubro || epica ? '40px' : '46px', alignItems: 'center',
                borderBottom: `1px solid ${rubro ? C.borde : C.bordeTarjeta}`, cursor: 'pointer',
                fontSize: rubro ? '12px' : epica ? '13px' : '13.5px', fontWeight: rubro || epica ? 600 : 400, color: C.tinta,
                letterSpacing: rubro ? '.06em' : undefined, textTransform: rubro ? 'uppercase' : undefined,
                background: enFoco ? C.marcaFila : 'transparent', opacity: f.profundidad === 4 ? 0.85 : 1,
              }}>
                <div style={{ paddingLeft: `${SANGRIA[f.profundidad]}px`, display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                  {modo === 'sel' && <Casilla marcada={elegida} onClick={() => alAlternarSel?.(f.id)} etiqueta={`Seleccionar ${f.nombre}`} testid={`sel-${f.id}`} />}
                  {f.esContenedor
                    ? <button type="button" onClick={(e) => { e.stopPropagation(); plegar(f.id) }} aria-label={abierto ? 'Plegar' : 'Desplegar'} style={{ color: C.tenue, display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}><Ico d={abierto ? P.abajo : P.derecha} s={12} /></button>
                    : <span style={{ width: '12px', flexShrink: 0 }} />}
                  <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, letterSpacing: 0, textTransform: 'none', fontWeight: 400, width: f.profundidad >= 3 ? '52px' : '34px', flexShrink: 0 }}>{f.codigo}</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                  {f.nSubtareas > 0 && <span style={{ fontSize: '11px', color: C.tenue, marginLeft: '6px', letterSpacing: 0, textTransform: 'none', fontWeight: 400, whiteSpace: 'nowrap' }}>{f.nSubtareas} {f.nSubtareas === 1 ? 'subtarea' : 'subtareas'}</span>}
                </div>
                {celda(f.uniCant)}
                {f.pond ? celda(f.pond.texto, false, f.pond.tono === 'warn' ? C.warn : C.tintaSuave) : celda(null)}
                {f.plan ? celda(f.plan) : f.esContenedor && !f.tieneHijas ? celda(null) : celda('sin fechas', true)}
                {celda(f.dias == null ? null : String(f.dias))}
                {f.esContenedor ? celda(null) : f.metodo ? celda(f.metodo) : celda('sin método', true, C.warn)}
              </div>
              {(contenedoresConAgregar.get(f.id) ?? []).map((c) => filaNueva(c.id, true))}
            </div>
          )
        })}
        {modo === 'mano' && filaNueva(null, true)}
      </div>
      </div>

      {/* ═══ TELÉFONO (MC2 · MC10) ═══ */}
      <div className="flex md:hidden" data-testid="arbol-estructura-telefono" style={{ flexDirection: 'column' }}>
        {visibles.length === 0 && modo !== 'mano' && (
          <div style={{ padding: '12px 0', fontSize: '12.5px', color: C.tintaSuave }}>{q ? `Nada coincide con «${query}».` : 'Todavía no hay trabajo cargado'}</div>
        )}
        {visibles.filter((f) => modo !== 'sel' || !f.esContenedor).map((f) => {
          const rubro = f.profundidad === 0
          const epica = f.profundidad === 1
          const elegida = sel?.has(f.id) ?? false
          const enFoco = foco === f.id || elegida
          const abierto = !plegados.has(f.id)
          const derecha = modo === 'sel' || !f.esContenedor
            ? (f.uniCant ?? null)
            : f.pond ? f.pond.texto : !f.tieneHijas ? 'sin hijas' : null
          return (
            <div key={f.id}>
              <div role="row" data-testid={`arbol-telefono-${f.id}`} onClick={() => (modo === 'sel' ? alAlternarSel?.(f.id) : alAbrir?.(f.id))} style={{
                minHeight: rubro || epica ? '40px' : '52px', display: 'flex', alignItems: 'center', gap: modo === 'sel' ? '12px' : '8px',
                paddingLeft: modo === 'sel' ? '16px' : `${SANGRIA_TEL[f.profundidad]}px`, paddingRight: modo === 'sel' ? '16px' : 0,
                margin: modo === 'sel' ? '0 -16px' : 0,
                borderBottom: `1px solid ${rubro ? C.borde : C.bordeTarjeta}`, cursor: 'pointer', color: C.tinta,
                fontSize: rubro ? '11.5px' : epica ? '13px' : modo === 'sel' ? '14px' : '13.5px', fontWeight: rubro || epica ? 600 : 400,
                letterSpacing: rubro ? '.06em' : undefined, textTransform: rubro ? 'uppercase' : undefined,
                background: enFoco ? C.marcaFila : 'transparent',
              }}>
                {modo === 'sel'
                  ? <Casilla marcada={elegida} onClick={() => alAlternarSel?.(f.id)} etiqueta={`Seleccionar ${f.nombre}`} tam={16} testid={`sel-telefono-${f.id}`} />
                  : f.esContenedor
                    ? <button type="button" onClick={(e) => { e.stopPropagation(); plegar(f.id) }} aria-label={abierto ? 'Plegar' : 'Desplegar'} style={{ color: C.tenue, display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}><Ico d={abierto ? P.abajo : P.derecha} s={12} /></button>
                    : <span style={{ width: '12px', flexShrink: 0 }} />}
                {modo === 'sel'
                  ? <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tenue, marginRight: '8px' }}>{f.codigo}</span>{f.nombre}</div>
                  : <>
                    <span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tenue, letterSpacing: 0, textTransform: 'none', fontWeight: 400, width: f.profundidad >= 3 ? '44px' : '26px', flexShrink: 0 }}>{f.codigo}</span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                  </>}
                <span style={{ fontFamily: MONO, fontSize: '12px', color: f.pond?.tono === 'warn' && f.esContenedor ? C.warn : C.tintaSuave, whiteSpace: 'nowrap', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>
                  {derecha === 'sin hijas' ? <Falta>sin hijas</Falta> : derecha ?? ''}
                </span>
              </div>
              {(contenedoresConAgregar.get(f.id) ?? []).map((c) => filaNueva(c.id, false))}
            </div>
          )
        })}
        {modo === 'mano' && filaNueva(null, false)}
      </div>
    </>
  )
}
