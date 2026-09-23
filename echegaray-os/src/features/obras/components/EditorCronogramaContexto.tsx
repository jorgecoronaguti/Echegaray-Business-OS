'use client'

// ═══ LAS ACCIONES DEL EDITOR DEL CRONOGRAMA VIVEN EN LA CABECERA (C06, 23/09/2026) ═══
//
// El diseño pone «Sellar línea base» y «Guardar fechas» arriba a la derecha, junto al nombre de la
// obra —en la cabecera, que es un server component que arma la página— y el estado que las
// enciende (cuántas fechas cambiaron, por qué Sellar está apagado, si hay una escritura en curso)
// lo tiene el editor, que es un client component montado más abajo.
//
// EL EDITOR ES EL ÚNICO DUEÑO DEL ESTADO. Acá no hay una segunda copia de las fechas ni de los
// cambios: el editor publica una FOTO (`EstadoEditorCronograma`) cada vez que cambia lo que los
// botones necesitan saber, y los botones la leen. Las funciones `sellar`/`guardar` son las del
// editor, entregadas en la misma foto. La página envuelve la cabecera y el editor en el mismo
// `EditorCronogramaProvider` sólo cuando `?editar=1`.
//
// SIN PROVIDER (un test, una página que monte el editor solo) el editor dibuja las mismas acciones
// en su banda: `AccionesEditorCronograma` acepta el estado por prop y no depende del contexto.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { C } from './canon/tokens'
import { Ico, P } from './canon/Ico'

export interface EstadoEditorCronograma {
  /** «Sellar está apagado: 3 ítems sin fechas.» · `null` = el checklist no traba. */
  motivo: string | null
  /** La página le dio la acción de sellar (Administración y jefatura). Sin acción, apagado. */
  puedeSellar: boolean
  /** Cuántas actividades tienen fechas editadas y sin guardar. */
  cambios: number
  pendiente: boolean
  sellar: () => void
  guardar: () => void
}

interface Contexto {
  estado: EstadoEditorCronograma | null
  publicar: (estado: EstadoEditorCronograma | null) => void
}

const Ctx = createContext<Contexto | null>(null)

export function EditorCronogramaProvider({ children }: { children: ReactNode }) {
  const [estado, publicar] = useState<EstadoEditorCronograma | null>(null)
  return <Ctx.Provider value={{ estado, publicar }}>{children}</Ctx.Provider>
}

/** `null` cuando la página no envolvió la pantalla: el editor entonces dibuja sus acciones solo. */
export function useEditorCronograma(): Contexto | null {
  return useContext(Ctx)
}

/**
 * «Sellar línea base» + «Guardar fechas», medidos en C06:
 *   Sellar apagado   32px · `padding:0 14px` · fondo line · texto faint · 600 · ícono 14
 *   Guardar fechas   32px · `padding:0 12px` · borde line-strong · fondo blanco · texto ink-soft · 13px
 * Sellar encendido no está dibujado: se conserva la forma con borde de la versión anterior. Guardar
 * sin nada que guardar se apaga con los mismos colores que Sellar apagado.
 *
 * Sin estado todavía (antes de que el editor hidrate) las dos se dibujan apagadas: la cabecera no
 * puede prometer una escritura que nadie va a recibir.
 */
export function AccionesEditorCronograma({ estado }: { estado?: EstadoEditorCronograma }) {
  const ctx = useContext(Ctx)
  const e = estado ?? ctx?.estado ?? null
  const sellarApagado = e == null || e.motivo != null || !e.puedeSellar || e.pendiente
  const guardarApagado = e == null || e.cambios === 0 || e.pendiente
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} data-testid="acciones-editor-cronograma">
      <button type="button" data-testid="sellar-linea-base" disabled={sellarApagado}
        title={e?.motivo ?? 'Sellar la línea base de toda la obra'} onClick={() => e?.sellar()} style={{
          height: '32px', padding: '0 14px', border: 0, borderRadius: '6px', font: 'inherit', fontSize: '13px', fontWeight: 600,
          background: sellarApagado ? C.borde : C.superficie, color: sellarApagado ? C.tenue : C.tinta,
          cursor: sellarApagado ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px',
          boxShadow: sellarApagado ? 'none' : `inset 0 0 0 1px ${C.bordeFuerte}`,
        }}><Ico d={P.base} s={14} />Sellar línea base</button>
      <button type="button" data-testid="guardar-fechas" disabled={guardarApagado} onClick={() => e?.guardar()} style={{
        height: '32px', padding: '0 12px', borderRadius: '6px', font: 'inherit', fontSize: '13px', fontWeight: 400,
        border: `1px solid ${guardarApagado ? C.borde : C.bordeFuerte}`,
        background: guardarApagado ? C.borde : C.superficie, color: guardarApagado ? C.tenue : C.tintaMedia,
        cursor: guardarApagado ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
      }}><Ico d={P.ok} s={13} />{e?.pendiente ? 'Guardando…' : 'Guardar fechas'}</button>
    </div>
  )
}
