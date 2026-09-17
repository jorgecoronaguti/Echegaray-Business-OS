'use client'

// EL ANCHO DE PERSONA SE ARRASTRA (dueño, 16/09/2026: «permitime hacer más ancha la columna»), Y ES UNO SOLO PARA LOS
// DOS CUADROS: jornaleros y mensuales comparten la misma medida para que los nombres queden en la misma vertical.
//
// La medida se aplica IMPERATIVAMENTE a la variable CSS `--liq-persona` de cada caja registrada (cabecera y tabla de
// cada cuadro): no es estado de React —el servidor no sabe qué recordó este navegador y un estado hidrataría
// distinto—, es el DOM sincronizado con lo recordado y con el arrastre. Doble clic en el tirador vuelve al ancho
// por corte.

import { useCallback, useEffect, useRef } from 'react'
import { anchoArrastrado, anchoRecordado, CLAVE_ANCHO_PERSONA } from './anchoDePersona'
import { CANAL_SCROLL } from '../solapas/tabla'

export type Tirador = Pick<React.HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onDoubleClick'>

export function useAnchoDePersona(): { registrar: (el: HTMLElement | null) => void; tirador: Tirador } {
  const cajas = useRef(new Set<HTMLElement>())
  const actual = useRef<number | null>(null)
  const aplicar = useCallback((w: number | null) => {
    actual.current = w
    for (const caja of cajas.current) {
      if (!caja.isConnected) { cajas.current.delete(caja); continue }
      if (w == null) caja.style.removeProperty('--liq-persona')
      else caja.style.setProperty('--liq-persona', `${w}px`)
    }
  }, [])
  // Una caja que se monta después (la cabecera cambia de modo) recibe la medida vigente al registrarse.
  const registrar = useCallback((el: HTMLElement | null) => {
    if (!el) return
    cajas.current.add(el)
    if (actual.current != null) el.style.setProperty('--liq-persona', `${actual.current}px`)
  }, [])
  useEffect(() => { aplicar(anchoRecordado((k) => window.localStorage.getItem(k))) }, [aplicar])

  const arrastre = useRef<{ x0: number; w0: number; w: number } | null>(null)
  const tirador: Tirador = {
    onPointerDown: (e) => {
      const celda = e.currentTarget.parentElement
      if (!celda) return
      const w0 = celda.getBoundingClientRect().width - CANAL_SCROLL
      arrastre.current = { x0: e.clientX, w0, w: w0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    onPointerMove: (e) => {
      if (!arrastre.current) return
      arrastre.current.w = anchoArrastrado(arrastre.current.w0, e.clientX - arrastre.current.x0)
      aplicar(arrastre.current.w)
    },
    onPointerUp: (e) => soltar(e),
    onPointerCancel: (e) => soltar(e),
    onDoubleClick: () => { aplicar(null); try { window.localStorage.removeItem(CLAVE_ANCHO_PERSONA) } catch { /* sin storage */ } },
  }
  function soltar(e: React.PointerEvent<HTMLElement>) {
    if (!arrastre.current) return
    const w = arrastre.current.w
    arrastre.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    try { window.localStorage.setItem(CLAVE_ANCHO_PERSONA, String(w)) } catch { /* sin storage: vale hasta recargar */ }
  }
  return { registrar, tirador }
}
