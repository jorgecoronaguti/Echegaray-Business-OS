'use client'

// EL ÁRBOL DE LA SERIE B — porte de B02–B06 (escritorio) y MB1 (teléfono), también C07/C09.
//
//   escritorio  cabecera 34 mono 10,5: Ítem · Uni · cant · Costo MO · Peso · Plan · Días · Método
//               rubro 40 (12/600 uppercase .06em, línea line) · épica 40 (13/600) · historia 46 (13,5)
//               · tarea 46 · subtarea 46 con casilla y opacidad .85, sin columnas de datos
//               «sin hijas» itálica faint en Peso · historia sin costo: «sin costo de MO» / «no pesa»
//               itálica warn · «sin tareas» / «sin fechas» itálica faint en Plan
//               chips junto al nombre (11 faint): «2 épicas», «3 historias · 9 tareas» (plegada),
//               «⚲ 5 insumos», «2 subtareas», «tiempo técnico»
//               fila nueva en #FFF8D6 con el nombre subrayado 1,5px y las cifras en vivo del aside
//               «+ Nueva tarea en Zanjas   Enter · Tab baja a subtarea · Shift+Tab sube»
//   teléfono    MB1: rubro «$ 6,01 M · 32 %», historia en dos líneas («3 tareas · 24/08 → 28/08») y a la
//               derecha «$ 1.775.059 · 9,5 %» o «sin costo · no pesa» (warn); tarea con «uni · cant»

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Casilla } from './Piezas'
import { ROTULO_NIVEL, type NivelEstructura } from '../../../services/estructura'
import { filasVisiblesDelArbol, type Celda, type FilaArbol } from '../../../services/arbolEstructura'

export const GRID_ARBOL = 'minmax(0,1fr) 110px 104px 76px 128px 52px 76px'
const SANGRIA = [0, 18, 36, 54, 72, 90]
const SANGRIA_TEL = [0, 12, 24, 36, 48, 60]

export interface NuevoEnArbol { padreId: string | null; nombre: string }
/** Lo que el aside va cargando y la fila nueva muestra en vivo (B03 «$ 1.775.059 · 100 %», B05). */
export interface PreviaNuevo { uniCant?: string | null; costo?: Celda | null; peso?: Celda | null; plan?: string | null; dias?: number | null; metodo?: string | null }
export type Tecla = 'enter' | 'tab' | 'shiftTab' | 'escape'

/** «Nueva tarea en Zanjas» · «Nueva historia en Excavaciones» · «Nuevo rubro». */
export function rotuloNuevo(nivel: NivelEstructura, padre: string | null): string {
  if (!padre) return 'Nuevo rubro'
  return `${nivel === 'rubro' ? 'Nuevo' : 'Nueva'} ${ROTULO_NIVEL[nivel].toLowerCase()} en ${padre}`
}

const PISTA: Record<NivelEstructura, string> = {
  rubro: '· Tab baja a épica', epica: '· Tab baja a historia · Shift+Tab sube', historia: '· Tab baja a tarea · Shift+Tab sube',
  tarea: '· Tab baja a subtarea · Shift+Tab sube', subtarea: '· Shift+Tab sube',
}

function CeldaTexto({ c, mono = true }: { c: Celda | null | undefined; mono?: boolean }) {
  if (!c) return <div />
  const color = c.tono === 'warn' ? C.warn : c.tono === 'falta' ? C.tenue : C.tintaSuave
  const italica = c.tono !== 'normal'
  return (
    <div style={{ fontSize: italica ? '12.5px' : '12.5px', color, textAlign: 'right', fontFamily: italica ? 'inherit' : mono ? MONO : 'inherit', fontStyle: italica ? 'italic' : 'normal', whiteSpace: 'nowrap', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>
      {c.texto}
    </div>
  )
}
const texto = (t: string | null | undefined): Celda | null => (t == null ? null : { texto: t, tono: 'normal' })

function Chip({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: '11px', color: C.tenue, marginLeft: '8px', letterSpacing: 0, textTransform: 'none', fontWeight: 400, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{children}</span>
}

export function ArbolEstructura({
  filas, modo, foco = null, nuevo = null, nivelNuevo = 'tarea', previa = null, alCambiarNuevo, alTecla, alPedirNuevo,
  sel, alAlternarSel, alAbrir, alAlternarSubtarea, query = '', angosto = false,
}: {
  filas: FilaArbol[]
  modo: 'mano' | 'foco' | 'sel'
  foco?: string | null
  nuevo?: NuevoEnArbol | null
  nivelNuevo?: NivelEstructura
  previa?: PreviaNuevo | null
  alCambiarNuevo?: (nombre: string) => void
  alTecla?: (t: Tecla) => void
  alPedirNuevo?: (padreId: string | null) => void
  sel?: ReadonlySet<string>
  alAlternarSel?: (id: string) => void
  alAbrir?: (f: FilaArbol) => void
  alAlternarSubtarea?: (id: string, hecha: boolean) => void
  query?: string
  /** Con aside al lado la grilla ocupa todo; sin aside, el diseño la corta en 1120. */
  angosto?: boolean
}) {
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas])
  // B04: armando a mano, las historias arrancan plegadas (se ve «sin tareas» o «6 tareas»), salvo la
  // rama donde se está trabajando: la de la fila nueva o la del panel abierto.
  const ancestros = (id: string | null | undefined): Set<string> => {
    const s = new Set<string>()
    let p = id ? porId.get(id) : undefined
    while (p) { s.add(p.id); p = p.padreId ? porId.get(p.padreId) : undefined }
    return s
  }
  const [plegados, setPlegados] = useState<Set<string>>(() => {
    if (modo !== 'mano') return new Set()
    const abiertos = ancestros(nuevo?.padreId ?? foco)
    return new Set(filas.filter((f) => f.nivel === 'historia' && !abiertos.has(f.id)).map((f) => f.id))
  })
  const [ramaVista, setRamaVista] = useState<string | null>(nuevo?.padreId ?? foco ?? null)
  const rama = nuevo?.padreId ?? foco ?? null
  if (rama !== ramaVista) {
    // La fila nueva se mudó (Tab, clic en otra rama): su rama se despliega.
    setRamaVista(rama)
    const abrir = ancestros(rama)
    if ([...abrir].some((id) => plegados.has(id))) setPlegados((s) => new Set([...s].filter((id) => !abrir.has(id))))
  }
  const plegar = (id: string) => setPlegados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const q = query.trim().toLowerCase()
  const visibles = useMemo(() => {
    const v = filasVisiblesDelArbol(filas, plegados)
    if (!q) return v
    const dentro = new Set<string>()
    for (const f of filas) {
      if (!f.nombre.toLowerCase().includes(q)) continue
      let x: FilaArbol | undefined = f
      while (x) { dentro.add(x.id); x = x.padreId ? porId.get(x.padreId) : undefined }
    }
    return v.filter((f) => dentro.has(f.id))
  }, [filas, plegados, q, porId])

  // Después de la última descendiente visible de cada contenedor va su «+ Nueva … en X».
  const agregarDespues = useMemo(() => {
    const salida = new Map<string, FilaArbol[]>()
    if (modo !== 'mano') return salida
    const ultima = new Map<string, string>()
    for (const f of visibles) { let p = f.padreId; while (p) { ultima.set(p, f.id); p = porId.get(p)?.padreId ?? null } }
    for (const c of visibles) {
      if (plegados.has(c.id) || c.nivel === 'subtarea') continue
      if (!(c.esContenedor || c.nivel === 'tarea')) continue
      // Una tarea sólo ofrece «Nueva subtarea» cuando ya tiene alguna o está elegida para una nueva.
      if (c.nivel === 'tarea' && !c.esContenedor && c.nSubtareas === 0 && nuevo?.padreId !== c.id) continue
      const ancla = ultima.get(c.id) ?? c.id
      const l = salida.get(ancla) ?? []
      l.push(c)
      salida.set(ancla, l)
    }
    // Con el mismo ancla, primero la del contenedor más hondo: la fila nueva de una épica vacía va
    // pegada a la épica, y después el «+ Nueva épica en <rubro>».
    for (const l of salida.values()) l.sort((a, b) => b.profundidad - a.profundidad)
    return salida
  }, [visibles, modo, plegados, porId, nuevo])

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); alTecla?.('enter') }
    else if (e.key === 'Tab') { e.preventDefault(); alTecla?.(e.shiftKey ? 'shiftTab' : 'tab') }
    else if (e.key === 'Escape') { e.preventDefault(); alTecla?.('escape') }
  }

  const filaNueva = (padreId: string | null, escritorio: boolean) => {
    const padre = padreId ? porId.get(padreId) ?? null : null
    const activa = nuevo != null && nuevo.padreId === padreId
    const nivel: NivelEstructura = padre ? nivelNuevo : 'rubro'
    const rotulo = rotuloNuevo(activa ? nivelNuevo : nivelDeHija(padre), padre?.nombre ?? null)
    const prof = padre ? Math.min(5, padre.profundidad + 1) : 0
    const hermanas = filas.filter((f) => f.padreId === padreId && f.nivel !== 'subtarea').length
    const codigo = nivel === 'subtarea' ? '' : padre ? `${padre.codigo}.${hermanas + 1}` : String(hermanas + 1)
    if (activa) {
      const input = (
        <input autoFocus value={nuevo?.nombre ?? ''} onChange={(e) => alCambiarNuevo?.(e.target.value)} onKeyDown={teclas}
          data-testid={escritorio ? 'campo-nuevo-nombre' : 'campo-nuevo-nombre-telefono'} placeholder={rotulo} aria-label={rotulo}
          className="focus:outline-none focus-visible:outline-none focus:ring-0"
          style={{ border: 'none', borderBottom: `1.5px solid ${C.grafito}`, borderRadius: 0, boxShadow: 'none', paddingBottom: '1px', background: 'transparent', font: 'inherit', color: C.tinta, outline: 'none', minWidth: 0, width: escritorio ? '240px' : undefined, flex: escritorio ? undefined : 1, fontWeight: nivel === 'rubro' || nivel === 'epica' ? 600 : 400, textTransform: nivel === 'rubro' ? 'uppercase' : undefined, letterSpacing: nivel === 'rubro' ? '.06em' : undefined, fontSize: nivel === 'rubro' ? '12px' : undefined }} />
      )
      return escritorio ? (
        <div key={`nuevo-${padreId ?? 'raiz'}`} data-testid="fila-nueva" style={{ display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', minHeight: '46px', alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`, background: C.marcaFila, fontSize: '13.5px' }}>
          <div style={{ paddingLeft: `${SANGRIA[prof]}px`, display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span style={{ width: '12px', flexShrink: 0 }} />
            {nivel === 'subtarea'
              ? <Casilla marcada={false} onClick={() => undefined} etiqueta="nueva subtarea" apagada />
              : <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, minWidth: prof >= 3 ? '52px' : '34px' }}>{codigo}</span>}
            {input}
          </div>
          <CeldaTexto c={texto(previa?.uniCant)} /><CeldaTexto c={previa?.costo ?? null} /><CeldaTexto c={previa?.peso ?? null} />
          <CeldaTexto c={texto(previa?.plan)} /><CeldaTexto c={texto(previa?.dias == null ? null : String(previa.dias))} /><CeldaTexto c={texto(previa?.metodo)} />
          {padreId == null && (
            // B01: debajo de la fila del rubro que se escribe, la pista de lo que hacen las teclas.
            <div style={{ gridColumn: '1 / -1', height: '40px', display: 'flex', alignItems: 'center', gap: '9px', paddingLeft: '21px', fontSize: '13px', color: C.tintaSuave, background: C.superficie, margin: '0 0 -1px' }}>
              <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>Nuevo rubro
              <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, marginLeft: '8px' }}>Enter</span><span style={{ color: C.tenue, fontSize: '12px' }}>{PISTA.rubro}</span>
            </div>
          )}
        </div>
      ) : (
        <div key={`nuevo-tel-${padreId ?? 'raiz'}`} data-testid="fila-nueva-telefono" style={{ minHeight: '52px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: `${SANGRIA_TEL[prof]}px`, borderBottom: `1px solid ${C.bordeTarjeta}`, background: C.marcaFila, fontSize: '13.5px' }}>
          <span style={{ width: '12px' }} />{input}
        </div>
      )
    }
    const nivelHija = nivelDeHija(padre)
    return escritorio ? (
      <button key={`agregar-${padreId ?? 'raiz'}`} type="button" onClick={() => alPedirNuevo?.(padreId)} data-testid={`agregar-en-${padreId ?? 'raiz'}`}
        style={{ font: 'inherit', height: '40px', display: 'flex', alignItems: 'center', gap: '9px', paddingLeft: `${SANGRIA[prof]}px`, fontSize: '13px', color: C.tintaSuave, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        <span style={{ width: '12px' }} />
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>
        <span>{rotulo}</span>
        {(padreId == null || nivelHija === 'tarea' || nivelHija === 'subtarea') && (
          <><span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, marginLeft: '8px' }}>Enter</span><span style={{ color: C.tenue, fontSize: '12px' }}>{PISTA[nivelHija]}</span></>
        )}
      </button>
    ) : (
      <button key={`agregar-tel-${padreId ?? 'raiz'}`} type="button" onClick={() => alPedirNuevo?.(padreId)} data-testid={`agregar-telefono-en-${padreId ?? 'raiz'}`}
        style={{ font: 'inherit', height: '44px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: `${SANGRIA_TEL[prof]}px`, fontSize: '13px', color: C.tintaSuave, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>{rotulo}
      </button>
    )
  }

  const chevron = (f: FilaArbol, abierto: boolean) => f.esContenedor || f.nSubtareas > 0
    ? <button type="button" onClick={(e) => { e.stopPropagation(); plegar(f.id) }} aria-label={abierto ? 'Plegar' : 'Desplegar'} style={{ color: C.tenue, display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}><Ico d={abierto ? P.abajo : P.derecha} s={12} /></button>
    : <span style={{ width: '12px', flexShrink: 0 }} />

  const chips = (f: FilaArbol, abierto: boolean) => (
    <>
      {!abierto && f.resumenHijas && <Chip>{f.resumenHijas}</Chip>}
      {f.nSubtareas > 0 && <Chip>{f.nSubtareas} {f.nSubtareas === 1 ? 'subtarea' : 'subtareas'}</Chip>}
      {f.nInsumos > 0 && <Chip><Ico d={P.herramienta} s={11} />{f.nInsumos} {f.nInsumos === 1 ? 'insumo' : 'insumos'}</Chip>}
      {f.tiempoTecnico && <Chip>tiempo técnico</Chip>}
      {f.sinHistoria && <Chip><span style={{ color: C.warn }}>sin historia · revisar</span></Chip>}
    </>
  )

  return (
    <>
      {/* ═══ ESCRITORIO ═══ */}
      <div className="hidden md:flex" data-testid="arbol-estructura" style={{ padding: '12px 20px 30px', flexDirection: 'column', minWidth: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: '860px', maxWidth: angosto ? undefined : '1120px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
            <div>Ítem</div><div style={{ textAlign: 'right' }}>Uni · cant</div><div style={{ textAlign: 'right' }}>Costo MO</div><div style={{ textAlign: 'right' }}>Peso</div>
            <div style={{ textAlign: 'right' }}>Plan</div><div style={{ textAlign: 'right' }}>Días</div><div style={{ textAlign: 'right' }}>Método</div>
          </div>
          {visibles.length === 0 && modo !== 'mano' && (
            <div style={{ padding: '24px 0', fontSize: '12.5px', color: C.tintaSuave }}>{q ? `Nada coincide con «${query}».` : 'Esta obra todavía no tiene trabajo cargado.'}</div>
          )}
          {visibles.map((f) => {
            const rubro = f.nivel === 'rubro'
            const epica = f.nivel === 'epica'
            const sub = f.nivel === 'subtarea'
            const elegida = sel?.has(f.id) ?? false
            const abierto = !plegados.has(f.id)
            return (
              <div key={f.id}>
                <div role="row" data-testid={`arbol-${f.id}`} data-nivel={f.nivel} onClick={() => (modo === 'sel' ? alAlternarSel?.(f.id) : alAbrir?.(f))} style={{
                  display: 'grid', gridTemplateColumns: GRID_ARBOL, gap: '16px', minHeight: rubro || epica ? '40px' : '46px', alignItems: 'center',
                  borderBottom: `1px solid ${rubro ? C.borde : C.bordeTarjeta}`, cursor: 'pointer',
                  fontSize: rubro ? '12px' : epica ? '13px' : '13.5px', fontWeight: rubro || epica ? 600 : 400, color: C.tinta,
                  letterSpacing: rubro ? '.06em' : undefined, textTransform: rubro ? 'uppercase' : undefined,
                  background: foco === f.id || elegida ? C.marcaFila : 'transparent', opacity: sub ? 0.85 : 1,
                }}>
                  <div style={{ paddingLeft: `${SANGRIA[Math.min(5, f.profundidad)]}px`, display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    {modo === 'sel' && !sub && <Casilla marcada={elegida} onClick={() => alAlternarSel?.(f.id)} etiqueta={`Seleccionar ${f.nombre}`} testid={`sel-${f.id}`} />}
                    {sub ? <><span style={{ width: '12px', flexShrink: 0 }} /><Casilla marcada={f.hecha} onClick={() => alAlternarSubtarea?.(f.id, !f.hecha)} etiqueta={`${f.nombre} hecha`} testid={`subtarea-arbol-${f.id}`} apagada={!alAlternarSubtarea} /></> : chevron(f, abierto)}
                    {!sub && <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, letterSpacing: 0, textTransform: 'none', fontWeight: 400, minWidth: f.profundidad >= 3 ? '52px' : '34px', flexShrink: 0 }}>{f.codigo}</span>}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.nombre}</span>
                    {chips(f, abierto)}
                  </div>
                  {sub ? <><div /><div /><div /><div /><div /><div /></> : <>
                    <CeldaTexto c={texto(f.uniCant)} />
                    <CeldaTexto c={f.costo} />
                    <CeldaTexto c={f.peso} />
                    <CeldaTexto c={f.plan} />
                    <CeldaTexto c={texto(f.dias == null ? null : String(f.dias))} />
                    {f.metodo ? <CeldaTexto c={texto(f.metodo)} /> : f.metodoFalta ? <CeldaTexto c={{ texto: 'sin método', tono: 'warn' }} /> : <div />}
                  </>}
                </div>
                {(agregarDespues.get(f.id) ?? []).map((c) => filaNueva(c.id, true))}
              </div>
            )
          })}
          {modo === 'mano' && filaNueva(null, true)}
        </div>
      </div>

      {/* ═══ TELÉFONO (MB1 · MC10) ═══ */}
      <div className="flex md:hidden" data-testid="arbol-estructura-telefono" style={{ flexDirection: 'column' }}>
        {visibles.length === 0 && modo !== 'mano' && (
          <div style={{ padding: '12px 0', fontSize: '12.5px', color: C.tintaSuave }}>{q ? `Nada coincide con «${query}».` : 'Todavía no hay trabajo cargado'}</div>
        )}
        {visibles.filter((f) => modo !== 'sel' || !f.esContenedor).map((f) => {
          const rubro = f.nivel === 'rubro'
          const epica = f.nivel === 'epica'
          const historia = f.nivel === 'historia'
          const sub = f.nivel === 'subtarea'
          const elegida = sel?.has(f.id) ?? false
          const abierto = !plegados.has(f.id)
          const derecha: ReactNode = modo === 'sel' || f.nivel === 'tarea' ? f.uniCant
            : f.peso?.texto === 'sin hijas' ? <span style={{ fontStyle: 'italic', color: C.tenue }}>sin hijas</span>
              : f.peso?.tono === 'warn' ? <span style={{ fontStyle: 'italic', color: C.warn, fontFamily: 'inherit' }}>{historia || f.costo?.tono === 'warn' ? 'sin costo · no pesa' : 'no pesa'}</span>
                : rubro || historia ? [f.costo?.tono === 'normal' ? (rubro ? millonesCorto(f.costo.texto) : f.costo.texto) : null, f.peso?.texto].filter(Boolean).join(' · ')
                  : f.peso?.texto ?? null
          const bajada = historia
            ? [f.resumenHijas ?? (f.tieneHijas ? null : 'sin tareas'), f.plan && f.plan.tono === 'normal' ? f.plan.texto : null].filter(Boolean).join(' · ') || (f.uniCant ?? null)
            : f.nivel === 'tarea' && f.nInsumos > 0 ? `${f.nInsumos} ${f.nInsumos === 1 ? 'insumo' : 'insumos'}` : null
          return (
            <div key={f.id}>
              <div role="row" data-testid={`arbol-telefono-${f.id}`} onClick={() => (modo === 'sel' ? alAlternarSel?.(f.id) : alAbrir?.(f))} style={{
                minHeight: rubro || epica ? '40px' : '52px', display: 'flex', alignItems: 'center', gap: modo === 'sel' ? '12px' : '8px',
                paddingLeft: modo === 'sel' ? '16px' : `${SANGRIA_TEL[Math.min(5, f.profundidad)]}px`, paddingRight: modo === 'sel' ? '16px' : 0,
                margin: modo === 'sel' ? '0 -16px' : 0, borderBottom: `1px solid ${rubro ? C.borde : C.bordeTarjeta}`, cursor: 'pointer', color: C.tinta,
                fontSize: rubro ? '11.5px' : epica ? '13px' : '13.5px', fontWeight: rubro || epica ? 600 : 400,
                letterSpacing: rubro ? '.06em' : undefined, textTransform: rubro ? 'uppercase' : undefined,
                background: foco === f.id || elegida ? C.marcaFila : 'transparent', opacity: sub ? 0.85 : 1,
              }}>
                {modo === 'sel'
                  ? <Casilla marcada={elegida} onClick={() => alAlternarSel?.(f.id)} etiqueta={`Seleccionar ${f.nombre}`} tam={16} testid={`sel-telefono-${f.id}`} />
                  : sub ? <Casilla marcada={f.hecha} onClick={() => alAlternarSubtarea?.(f.id, !f.hecha)} etiqueta={`${f.nombre} hecha`} tam={16} apagada={!alAlternarSubtarea} />
                    : chevron(f, abierto)}
                {!sub && <span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tenue, letterSpacing: 0, textTransform: 'none', fontWeight: 400, minWidth: f.profundidad >= 3 ? '44px' : '26px', flexShrink: 0 }}>{f.codigo}</span>}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: historia ? 500 : undefined }}>{f.nombre}</span>
                  {bajada && <span style={{ fontSize: '11.5px', color: C.tintaSuave, fontWeight: 400, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nivel === 'tarea' && <Ico d={P.herramienta} s={10} />}{bajada}</span>}
                </div>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: C.tintaSuave, whiteSpace: 'nowrap', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>{derecha ?? ''}</span>
              </div>
              {(agregarDespues.get(f.id) ?? []).map((c) => filaNueva(c.id, false))}
            </div>
          )
        })}
        {modo === 'mano' && filaNueva(null, false)}
      </div>
    </>
  )
}

/** El nivel de una hija nueva de una FILA del árbol (la misma escalera que `nivelDeHijaNueva`). */
export function nivelDeHija(padre: FilaArbol | null): NivelEstructura {
  if (!padre) return 'rubro'
  if (padre.nivel === 'rubro') return 'epica'
  if (padre.nivel === 'epica') return 'historia'
  if (padre.nivel === 'historia') return 'tarea'
  if (padre.nivel === 'tarea') return padre.esContenedor ? 'tarea' : 'subtarea'
  return 'subtarea'
}

/** «$ 6.006.310» → «$ 6,01 M» (MB1: el rubro va en millones). */
function millonesCorto(pesos: string): string {
  const n = Number(pesos.replace(/[^0-9]/g, ''))
  if (!Number.isFinite(n) || n < 1_000_000) return pesos
  return `$ ${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`
}
