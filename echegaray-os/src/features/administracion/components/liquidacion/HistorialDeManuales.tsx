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
//   Escape y clic afuera cierran siempre, SALVO mientras se escribe una nota (02/10/2026): Escape cancela la nota
//   (el campo lo marca con `preventDefault`), un clic afuera sólo saca el foco del campo —y eso la guarda— y escribir
//   deja el cuadro fijo, así perder el hover no se lleva lo que se está tipeando.
//   teclado  Tab desde el punto abierto entra al cuadro (vive en un portal al final de la página: sin esto no se llega).

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import { claveDeCelda } from '../../services/historialDeManuales'
import { detalleDePagoEnEfectivo } from '../../services/detalleDePagoEnEfectivo'
import { ALTO_BARRA } from '../../../../shared/components/movil/tokens'
import { DetalleDePagoEnEfectivo } from './DetalleDePagoEnEfectivo'
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

export interface CeldaDeHistorial {
  grupo: string
  personaId: string
  campo: CampoEditable
  /** Para titular el detalle de «Pagado en efectivo»: de quién es la celda, su importe de hoy y la cuenta guardada. */
  persona?: string
  valor?: number | null
  cuenta?: string | null
}

const ES_TELEFONO = '(max-width: 767px)'
/** La cabecera de la app (`h-12` + su borde): el cuadro no puede quedar debajo de ella. */
const ALTO_CABECERA = 49

const ANCHO_DEL_PANEL = 320
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
  const editando = useRef(false)
  const alEditar = useCallback((si: boolean) => { editando.current = si; if (si) setFijo(true) }, [])
  const fijoAhora = useRef(false)
  useEffect(() => { fijoAhora.current = fijo }, [fijo])

  const cerrar = useCallback(() => { editando.current = false; setAbierto(false); setFijo(false); setLugar(null) }, [])
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
      // En el teléfono la barra inferior de contextos (64 px) también ocupa la ventana, y no hay lugar al costado.
      ventana: {
        ancho: window.innerWidth, alto: window.innerHeight, reservaArriba: ALTO_CABECERA,
        reservaAbajo: window.matchMedia(ES_TELEFONO).matches ? ALTO_BARRA : 0,
      },
      preferirCostado: !window.matchMedia(ES_TELEFONO).matches,
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
      if (boton.current?.contains(t) || panel.current?.contains(t) || editando.current) return
      cerrar()
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
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

  const clave = claveDeCelda(celda.grupo, celda.personaId, celda.campo)
  const detalle = detalleDePagoEnEfectivo({
    campo: celda.campo, persona: celda.persona ?? null, quincena: lectura.quincena, valor: celda.valor ?? null,
    cuentaActual: celda.cuenta ?? null, anotaciones: lectura.detalles[clave],
  })

  return (
    <>
      {/* El hit del punto crece con padding y margen negativo: no mueve el layout ni cambia el alto de la fila. En el teléfono
          crece sólo hacia arriba y abajo: hacia los costados llegaba bajo la columna fija de «Pagar» y un toque podía
          caer en ese botón, que escribe. */}
      <button
        ref={boton}
        type="button"
        data-testid="marca-manual-historial"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={`${detalle.rotulo}, escrito a mano: ver qué se anotó`}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { cancelarCierre(); setAbierto(true) } }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') cierraSiNoEstaFijo() }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setAbierto(true) }}
        onBlur={(e) => { if (!fijo && !panel.current?.contains(e.relatedTarget as Node | null)) cerrar() }}
        onKeyDown={(e) => {
          const primero = panel.current?.querySelector<HTMLElement>('button:not([disabled]), input')
          if (e.key !== 'Tab' || e.shiftKey || !abierto || !primero) return
          e.preventDefault(); setFijo(true); primero.focus()
        }}
        onClick={() => {
          if (abierto && fijo) { cerrar(); return }
          setAbierto(true); setFijo(true)
        }}
        className="-m-1 inline-flex cursor-pointer items-center justify-center rounded-full bg-transparent p-1 max-md:-mx-1 max-md:-my-3 max-md:px-1 max-md:py-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink"
      >
        {children}
      </button>
      {abierto && typeof document !== 'undefined' && createPortal(
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={detalle.titulo}
          data-testid="historial-de-manuales"
          onPointerEnter={cancelarCierre}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') cierraSiNoEstaFijo() }}
          style={{
            position: 'fixed', zIndex: 60, visibility: lugar ? 'visible' : 'hidden',
            left: lugar?.left ?? 0, top: lugar?.top ?? 0, width: lugar?.ancho ?? ANCHO_DEL_PANEL, maxHeight: lugar?.altoMaximo,
          }}
          className="overflow-y-auto rounded-card border border-line bg-canvas p-3 text-left text-[12px] leading-4 tabular-nums text-ink shadow-card"
        >
          {lectura.error
            ? <p data-testid="historial-error" className="m-0 text-[11px] text-muted">No se pudo leer lo que se anotó.</p>
            : <DetalleDePagoEnEfectivo detalle={detalle} alEditar={alEditar} />}
        </div>,
        document.body,
      )}
    </>
  )
}
