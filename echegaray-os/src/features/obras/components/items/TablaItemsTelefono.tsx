'use client'

// LA TABLA DE ÍTEMS DEL TELÉFONO — PORTE LITERAL DE «M06 · Obra · Trabajo · Ítems» (390).
//
//   eyebrow   «Cód · ítem · peso · avance» mono 10,5/.06em faint · a la derecha «⌄ todo» 12 muted
//             (el nivel hasta el que se ve: Rubro · Épica · Historia · Tarea · todo)
//   fila      min 52, línea `#E7E6E2` abajo, gap 10, sangría 14 por nivel:
//             código mono 11 faint ancho 40 · nombre 13,5 (el rubro 14/600) · peso mono 11,5 muted
//             ancho 36 a la derecha · avance 13 ancho 40 a la derecha: verde completo, rojo
//             bloqueada, ámbar declarado a mano, tinta el resto
//   pie       «Un ítem sin peso no promedia.» 12 faint
//
// EL AVANCE DE CADA ÍTEM ES EL SUYO, MEDIDO POR TAREAS (dueño 25/09): no hay columna «Avance obra»
// (% × peso por costo de MO). El PESO es el del ítem sobre la obra, en %, sin decimales salvo < 10.
// No es la lista de Tareas (M05): no trae buscador, filtros ni «Nueva actividad».

import { C, MONO } from '../canon/tokens'
import { Combo } from '../canon/Controles'
import { textoPeso, type FilaItem, type NivelItem } from './filasDeItems'

export type NivelTelefono = 'rubro' | 'epica' | 'historia' | 'tarea' | 'todo'
const NIVELES: { valor: NivelTelefono; etiqueta: string }[] = [
  { valor: 'rubro', etiqueta: 'rubro' }, { valor: 'epica', etiqueta: 'épica' }, { valor: 'historia', etiqueta: 'historia' },
  { valor: 'tarea', etiqueta: 'tarea' }, { valor: 'todo', etiqueta: 'todo' },
]
const TOPE: Record<NivelTelefono, number> = { rubro: 0, epica: 1, historia: 2, tarea: 3, todo: 4 }
const PROF: Record<NivelItem, number> = { rubro: 0, epica: 1, historia: 2, tarea: 3, subtarea: 4 }


// Truncado debajo de 100: lo que no terminó no dice «100%».
const pct = (n: number) => `${(n < 100 ? Math.floor(n) : Math.round(n)).toLocaleString('es-AR')}%`

export function TablaItemsTelefono({ filas, nivel, alCambiarNivel, alAbrir }: {
  filas: FilaItem[]
  nivel: NivelTelefono
  alCambiarNivel: (n: NivelTelefono) => void
  alAbrir: (id: string) => void
}) {
  const visibles = filas.filter((f) => PROF[f.nivel] <= TOPE[nivel])
  return (
    <div data-testid="tabla-items-telefono" style={{ padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>Cód · ítem · peso · avance</div>
        <Combo variante="texto" valor={nivel} alCambiar={(v) => alCambiarNivel(v as NivelTelefono)} opciones={NIVELES}
          etiqueta="Ver hasta" testid="items-telefono-nivel" alinearMenu="derecha" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.length === 0 && <div style={{ fontSize: '12.5px', color: C.tintaSuave, padding: '12px 0' }}>Esta obra todavía no tiene trabajo cargado.</div>}
        {visibles.map((f) => {
          const rubro = f.nivel === 'rubro'
          const peso = textoPeso(f.peso)
          const color = f.pctItem == null ? C.tenue
            : f.estado === 'completado' ? C.pos
              : f.bloqueada ? C.neg
                : f.medicion.tono === 'warn' && f.puedeMedir && (f.nivel === 'tarea' || f.nivel === 'subtarea') ? C.warn : C.tinta
          return (
            <button key={f.id} type="button" onClick={() => alAbrir(f.id)} data-testid={`item-tel-${f.id}`} style={{
              font: 'inherit', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid ${C.borde}`, cursor: 'pointer',
              minHeight: '52px', display: 'flex', alignItems: 'center', gap: '10px', padding: `0 0 0 ${Math.min(4, PROF[f.nivel]) * 14}px`, color: C.tinta,
              lineHeight: 1.25,
            }}>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, width: '40px', flexShrink: 0 }}>{f.codigo}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: rubro ? '14px' : '13.5px', fontWeight: rubro ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
              <span style={{ fontFamily: MONO, fontSize: '11.5px', color: peso == null ? C.tenue : C.tintaSuave, width: '36px', textAlign: 'right', flexShrink: 0 }}>{peso ?? '—'}</span>
              <span style={{ fontSize: '13px', width: '40px', textAlign: 'right', color, flexShrink: 0 }}>{f.pctItem == null ? '—' : pct(f.pctItem)}</span>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: '12px', color: C.tenue }}>Un ítem sin peso no promedia.</div>
    </div>
  )
}
