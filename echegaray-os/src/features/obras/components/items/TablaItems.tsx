'use client'

// LA TABLA DE ÍTEMS — PORTE LITERAL DE «04b · Obra · Trabajo · Ítems» (1440).
//
//   columnas   `minmax(0,1fr) 104px 70px 94px 100px 66px 92px` · gap 16 (las del 04b; el costo de MO va
//              al lado del nombre de la historia, no en una columna propia)
//              Ítem · Uni · cant · Pond. · Plan · Días real/teór · % ítem · Avance obra
//   cabecera   32px, eyebrow mono 10,5/.06em faint, línea abajo
//   rubro      38px, 11,5px/600 uppercase .06em, el número en mono faint a la izquierda; sin línea
//   épica      32px, 12px muted, sangría 16
//   historia   30px, 12px faint, sangría 32; «$ costo · peso %» mono a la derecha del nombre, o
//              «sin costo de MO · no pesa» en warn
//   tarea      44px (48 con bajada), 13,5px, sangría 48, línea abajo; la bajada de subtareas o de
//              partes en 11,5 faint; «· tiempo técnico» en 11,5 muted al lado del nombre
//   subtarea   como fila: 12px faint, sangría 64
//   parte hoy  `box-shadow: inset 3px 0 0 #FDC900`
//   días       real > teórico y no completado → warn
//   pie        «Rubro › Épica › Historia › Tarea › Subtarea · N ítems · cada historia pesa por su
//              costo de MO; sus tareas, parejas. El estado se deriva de los partes»
//
// NULL nunca es 0: «sin cargar», «sin plan», «— / —», «sin registrar», «—».

import { C, MONO } from '../canon/tokens'
import { contarItems, type FilaItem } from './filasDeItems'

export const COLS_ITEMS = 'minmax(0,1fr) 104px 70px 94px 100px 66px 92px'
const SANGRIA: Record<FilaItem['nivel'], number> = { rubro: 0, epica: 16, historia: 32, tarea: 48, subtarea: 64 }

const pct = (n: number | null, dec = 1) => n == null ? null : `${n.toLocaleString('es-AR', { maximumFractionDigits: dec })}%`
const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`

function Faint({ children }: { children: React.ReactNode }) {
  return <span style={{ color: C.tenue }}>{children}</span>
}

function celdasVacias(n: number) {
  return Array.from({ length: n }, (_, i) => <div key={i} />)
}

function FilaContenedor({ f, alAbrir, abierta }: { f: FilaItem; alAbrir: () => void; abierta: boolean }) {
  const rubro = f.nivel === 'rubro'
  const epica = f.nivel === 'epica'
  const alto = rubro ? 38 : epica ? 32 : 30
  const color = rubro ? C.tinta : epica ? C.tintaSuave : C.tenue
  const sangria = f.profundidad === 0 ? 0 : f.profundidad === 1 ? 16 : SANGRIA[f.nivel]
  const avance = pct(f.avanceObra, 2)
  return (
    <div role="row" data-testid={`item-${f.id}`} onClick={alAbrir} style={{
      display: 'grid', gridTemplateColumns: COLS_ITEMS, gap: '16px', height: `${alto}px`, alignItems: 'center',
      fontSize: rubro ? '11.5px' : '12px', color, cursor: 'pointer',
      ...(rubro ? { letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 } : {}),
      background: abierta ? C.marcaSuave : 'transparent',
    }}>
      <div style={{ paddingLeft: `${sangria}px`, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {rubro && <span style={{ fontFamily: MONO, fontWeight: 400, letterSpacing: 0, color: C.tenue }}>{f.codigo}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
        {f.nivel === 'historia' && (
          f.sinCosto
            ? <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: C.warn, whiteSpace: 'nowrap', letterSpacing: 0, textTransform: 'none' }}>sin costo de MO · no pesa</span>
            : f.costoMo != null && (
              <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '11.5px', color: C.tenue, whiteSpace: 'nowrap' }}>
                {pesos(f.costoMo)}{f.peso != null ? ` · ${pct(f.peso * 100)}` : ''}
              </span>
            )
        )}
      </div>
      {celdasVacias(1)}
      <div style={{ textAlign: 'right', fontSize: '12px', color: C.tenue, letterSpacing: 0, textTransform: 'none', fontVariantNumeric: 'tabular-nums' }}>
        {f.nivel === 'historia' && f.peso != null ? pct(f.peso * 100) : ''}
      </div>
      {celdasVacias(2)}
      <div style={{ textAlign: 'right', fontSize: '12px', letterSpacing: 0, textTransform: 'none', fontVariantNumeric: 'tabular-nums', color: f.pctItem != null && f.pctItem < 100 ? C.curso : color }}>
        {!rubro && f.pctItem != null ? pct(f.pctItem, 0) : ''}
      </div>
      <div style={{ textAlign: 'right', letterSpacing: 0, textTransform: 'none', fontSize: '12.5px', color: rubro ? C.tinta : color, fontVariantNumeric: 'tabular-nums' }}>
        {avance ?? ''}
      </div>
    </div>
  )
}

function FilaHoja({ f, alAbrir, abierta }: { f: FilaItem; alAbrir: () => void; abierta: boolean }) {
  const sub = f.nivel === 'subtarea'
  const bajada = f.subtareas.length > 0
    ? `${f.subtareas.length} ${f.subtareas.length === 1 ? 'subtarea' : 'subtareas'}: ${f.subtareas.join(' · ')}`
    : null
  const alto = bajada ? 48 : sub ? 36 : 44
  const sangria = f.profundidad <= 1 && f.nivel === 'tarea' ? 16 : SANGRIA[f.nivel]
  const gris = { fontSize: '12.5px', color: C.tintaSuave } as const
  const sinDato = { fontSize: '12.5px', color: C.tenue } as const
  return (
    <div role="row" data-testid={`item-${f.id}`} onClick={alAbrir} style={{
      display: 'grid', gridTemplateColumns: COLS_ITEMS, gap: '16px', height: `${alto}px`, alignItems: 'center',
      borderBottom: `1px solid ${C.borde}`, fontSize: sub ? '12px' : '13.5px', color: sub ? C.tenue : C.tinta, cursor: 'pointer',
      boxShadow: f.parteHoy ? `inset 3px 0 0 ${C.marca}` : 'none',
      background: abierta ? C.marcaSuave : 'transparent', fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ paddingLeft: `${sangria}px`, display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f.bloqueada ? C.neg : undefined }}>
          {f.nombre}
          {f.tiempoTecnico && <span style={{ fontSize: '11.5px', color: C.tintaSuave }}> · tiempo técnico</span>}
          {f.bloqueada && <span style={{ fontSize: '11.5px', color: C.neg, fontWeight: 500 }}> · bloqueada</span>}
        </span>
        {bajada && <span style={{ fontSize: '11.5px', color: C.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bajada}</span>}
      </div>
      <div style={f.uniCant ? gris : sinDato}>{f.uniCant ?? 'sin cargar'}</div>
      <div style={{ ...(f.peso != null ? gris : sinDato), textAlign: 'right' }}>{f.peso != null ? pct(f.peso * 100) : '—'}</div>
      <div style={f.plan ? gris : sinDato}>{f.plan ?? 'sin plan'}</div>
      <div style={{ fontSize: '12.5px', color: f.diasWarn ? C.warn : f.diasReales == null && f.diasTeoricos == null ? C.tenue : f.diasReales == null ? C.tenue : C.tinta }}>
        {f.diasReales ?? '—'} / {f.diasTeoricos ?? '—'}
      </div>
      <div style={{ textAlign: 'right', fontSize: '12.5px', whiteSpace: 'nowrap', color: f.pctItem == null ? C.tenue : f.pctItem < 100 ? C.curso : C.tinta }}>
        {f.pctItem == null ? 'sin registrar' : pct(f.pctItem, 1)}
      </div>
      <div style={{ textAlign: 'right', fontSize: '12.5px', color: f.avanceObra == null ? C.tenue : C.tinta }}>
        {f.avanceObra == null ? '—' : pct(f.avanceObra, 2)}
      </div>
    </div>
  )
}

export function TablaItems({ filas, abierta, alAbrir, vacio }: {
  filas: FilaItem[]
  abierta: string | null
  alAbrir: (id: string) => void
  /** Qué decir cuando no hay filas (sin estructura · nada coincide). */
  vacio: React.ReactNode
}) {
  return (
    // La grilla declara 620px que no ceden: por debajo de 1180px la tabla scrollea por dentro
    // (`overflowX: 'auto'` + `minWidth`) en vez de aplastar la columna del ítem.
    <div style={{ padding: '16px 30px 30px', display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'auto' }} data-testid="tabla-items">
    <div style={{ minWidth: '960px', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: COLS_ITEMS, gap: '16px', height: '32px', alignItems: 'center',
        borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em',
        color: C.tenue, textTransform: 'uppercase',
      }} role="row">
        <div>Ítem</div><div>Uni · cant</div><div style={{ textAlign: 'right' }}>Pond.</div><div>Plan</div>
        <div>Días real/teór</div><div style={{ textAlign: 'right' }}>% ítem</div><div style={{ textAlign: 'right' }}>Avance obra</div>
      </div>
      {filas.length === 0 && <div style={{ padding: '24px 0', fontSize: '12.5px', color: C.tintaSuave }} data-testid="wbs-vacio">{vacio}</div>}
      {filas.map((f) => f.esContenedor || f.nivel === 'historia' || f.nivel === 'epica' || f.nivel === 'rubro'
        ? <FilaContenedor key={f.id} f={f} abierta={abierta === f.id} alAbrir={() => alAbrir(f.id)} />
        : <FilaHoja key={f.id} f={f} abierta={abierta === f.id} alAbrir={() => alAbrir(f.id)} />)}
      <div style={{ paddingTop: '18px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="pie-items">
        Rubro › Épica › Historia › Tarea › Subtarea · {contarItems(filas)} ítems · cada historia pesa por su costo de MO;
        sus tareas, parejas. El estado se deriva de los partes
      </div>
    </div>
    </div>
  )
}

/** Un valor «—» faint para quien lo necesite fuera de la tabla. */
export function Guion() {
  return <Faint>—</Faint>
}
