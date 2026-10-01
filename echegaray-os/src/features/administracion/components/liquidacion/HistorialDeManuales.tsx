'use client'

// EL PUNTO ÁMBAR COMO LOG (dueño, 01/10/2026): al pasar el mouse, enfocar con teclado o tocar, muestra cada carga de
// esa celda con fecha, valor escrito, cuenta y quién. El hecho lo anota la base (`liquidacion_cambio`); la traducción
// es `historialDeManuales.ts`; acá sólo se dibuja.
//
// ═══ POR QUÉ UN PORTAL Y NO UN PANEL JUNTO AL PUNTO ═══
//
// La celda corta lo que desborda y la tabla scrollea de costado: un panel hijo del punto quedaba cortado o llevaba la
// tabla a scrollear. Va a `document.body` con `position: fixed` y se ubica contra la ventana (`ubicarPanel.ts`).
//
// ═══ CÓMO SE ABRE ═══
//
//   mouse   al pasar; un clic lo FIJA (para leerlo con calma o copiar un número) y otro clic lo cierra.
//   teclado al enfocar (sólo `:focus-visible`: un clic de mouse también enfoca y no debe abrir dos veces).
//   toque   un toque abre fijo; tocar afuera cierra. No existe el hover en el teléfono.
//   Escape y clic afuera cierran siempre.

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import { claveDeCelda, type EntradaDeHistorial } from '../../services/historialDeManuales'
import { ubicarPanel, type Ubicacion } from './ubicarPanel'

import type { LecturaDelHistorial } from '../../services/historialDeManualesService'

const Contexto = createContext<LecturaDelHistorial | null>(null)

export function ProveedorDeHistorial({ lectura, children }: { lectura: LecturaDelHistorial; children: ReactNode }) {
  return <Contexto.Provider value={lectura}>{children}</Contexto.Provider>
}

/** `null` cuando la pantalla no está envuelta o la base no tiene el log: el punto se dibuja como siempre. */
export const useHistorialDeManuales = (): LecturaDelHistorial | null => {
  const l = useContext(Contexto)
  return l && (l.historial !== null || l.error !== null) ? l : null
}

export interface CeldaDeHistorial { grupo: string; personaId: string; campo: CampoEditable }

const ANCHO_DEL_PANEL = 280
const DEMORA_AL_SALIR = 150

export function PuntoConHistorial({ celda, lectura, children }: {
  celda: CeldaDeHistorial
  lectura: LecturaDelHistorial
  /** El punto ya dibujado: acá no se vuelve a definir cómo se ve «manual». */
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const [fijo, setFijo] = useState(false)
  const [lugar, setLugar] = useState<Ubicacion | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  // El temporizador de salida corre después del render que lo programó: lee el valor de ahora, no el de entonces.
  const fijoAhora = useRef(false)
  useEffect(() => { fijoAhora.current = fijo }, [fijo])

  const cerrar = useCallback(() => { setAbierto(false); setFijo(false); setLugar(null) }, [])
  const cancelarCierre = () => { if (temporizador.current) clearTimeout(temporizador.current) }
  const cierraSiNoEstaFijo = () => {
    cancelarCierre()
    temporizador.current = setTimeout(() => { if (!fijoAhora.current) cerrar() }, DEMORA_AL_SALIR)
  }

  const ubicar = useCallback(() => {
    if (!boton.current) return
    const r = boton.current.getBoundingClientRect()
    setLugar(ubicarPanel({
      ancla: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      ventana: { ancho: window.innerWidth, alto: window.innerHeight },
      panel: { ancho: ANCHO_DEL_PANEL, alto: panel.current?.scrollHeight ?? 160 },
    }))
  }, [])

  // Se mide con el panel ya en el DOM: el alto real depende de cuántas cargas tenga la celda.
  useLayoutEffect(() => { if (abierto) ubicar() }, [abierto, ubicar, lectura])
  useEffect(() => () => cancelarCierre(), [])

  useEffect(() => {
    if (!abierto) return
    const alClicAfuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (boton.current?.contains(t) || panel.current?.contains(t)) return
      cerrar()
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cerrar()
      boton.current?.focus()
    }
    // La tabla scrollea de costado: el panel sigue al punto en vez de quedar flotando donde estaba.
    document.addEventListener('pointerdown', alClicAfuera)
    document.addEventListener('keydown', alTeclear)
    window.addEventListener('scroll', ubicar, true)
    window.addEventListener('resize', ubicar)
    return () => {
      document.removeEventListener('pointerdown', alClicAfuera)
      document.removeEventListener('keydown', alTeclear)
      window.removeEventListener('scroll', ubicar, true)
      window.removeEventListener('resize', ubicar)
    }
  }, [abierto, cerrar, ubicar])

  const entradas = lectura.historial?.[claveDeCelda(celda.grupo, celda.personaId, celda.campo)]?.entradas ?? []

  return (
    <>
      {/* El hit del punto crece con padding y margen negativo: no mueve el layout ni cambia el alto de la fila. */}
      <button
        ref={boton}
        type="button"
        data-testid="marca-manual-historial"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label="Escrito a mano: ver historial de cargas"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { cancelarCierre(); setAbierto(true) } }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') cierraSiNoEstaFijo() }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setAbierto(true) }}
        onBlur={() => { if (!fijo) cerrar() }}
        onClick={() => {
          if (abierto && fijo) { cerrar(); return }
          setAbierto(true); setFijo(true)
        }}
        className="-m-1 inline-flex cursor-pointer items-center justify-center rounded-full bg-transparent p-1 max-md:-m-2.5 max-md:p-2.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink"
      >
        {children}
      </button>
      {abierto && typeof document !== 'undefined' && createPortal(
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label="Historial de cargas de esta celda"
          data-testid="historial-de-manuales"
          onPointerEnter={cancelarCierre}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') cierraSiNoEstaFijo() }}
          style={{
            position: 'fixed', zIndex: 60, visibility: lugar ? 'visible' : 'hidden',
            left: lugar?.left ?? 0, top: lugar?.top ?? 0, width: lugar?.ancho ?? ANCHO_DEL_PANEL, maxHeight: lugar?.altoMaximo,
          }}
          className="overflow-y-auto rounded-card border border-line bg-canvas p-3 text-left text-[12px] leading-4 tabular-nums text-ink shadow-card"
        >
          <CuerpoDelHistorial entradas={entradas} error={lectura.error} />
        </div>,
        document.body,
      )}
    </>
  )
}

function CuerpoDelHistorial({ entradas, error }: { entradas: EntradaDeHistorial[]; error: string | null }) {
  if (error) return <p data-testid="historial-error" className="m-0 text-[11px] text-muted">No se pudo leer el historial.</p>
  if (entradas.length === 0) return <p className="m-0 text-[11px] text-muted">Sin registro de cargas.</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {entradas.map((e, i) => (
        <li key={e.id} className={i === 0 ? 'flex flex-col gap-1' : 'flex flex-col gap-1 border-t border-line pt-2'}>
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-faint">{e.cuando}</span>
            <span className="min-w-0 truncate text-muted">{e.quien}</span>
          </div>
          <div className="text-[12.5px]">
            {e.esBase ? e.despues : <>{e.antes} <span className="text-faint">→</span> {e.despues}</>}
          </div>
          {e.cuenta && <div className="break-all text-[11px] text-muted">{e.cuenta}</div>}
          {e.nota && <div className="text-[11px] text-faint">{e.nota}</div>}
        </li>
      ))}
    </ol>
  )
}
