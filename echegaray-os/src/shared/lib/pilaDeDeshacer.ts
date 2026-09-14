// LA PILA DE DESHACER DE LA PLATAFORMA — pura: sin React, sin base, sin navegador.
//
// Dueño, 15/09/2026: *«tendria q funcionar el cmd + z (ctrl +z en windows) para deshacer cambio en la plataforma»*
// y *«Deshacer con Cmd/Ctrl+Z … en TODA la plataforma»*. Cada guardado exitoso apila un paso; Cmd/Ctrl+Z con el
// foco FUERA de un input lo deshace llamando a la MISMA acción del servidor con el valor anterior. El proveedor
// (`src/shared/components/deshacer/DeshacerProvider.tsx`) sólo conecta esto con el teclado y la pantalla.
//
// ═══ QUÉ PASA AL CAMBIAR DE PANTALLA (decisión documentada) ═══
//
// Cada paso guarda la RUTA COMPLETA donde se editó (path + query: la quincena, la obra, el filtro). Se deshace
// sólo lo que está en la pantalla actual: un Cmd+Z que modifique un valor que no se ve sería un cambio a ciegas.
// Al cambiar de path se descartan los pasos de otras rutas; al deshacer se vuelve a mirar la ruta completa.
//
// ═══ CONFLICTO ═══
//
// Si el valor que se ve ya no es el que se guardó (otra persona lo editó, o llegó otra lectura), no se pisa: se
// avisa «cambió desde tu edición, no se deshizo» y el paso se descarta. Donde la acción lo admite, el servidor
// hace la misma comprobación con `esperado`.

export const LIMITE_DE_PASOS = 50
export const MENSAJE_CONFLICTO = 'cambió desde tu edición, no se deshizo'

export interface PasoDeEdicion {
  id: string
  /** Qué celda o campo (el mismo en cada guardado de esa celda). */
  clave: string
  /** Cómo se nombra en el aviso: «Banco de Rosales». */
  rotulo: string
  /** Path + query donde se editó. */
  ruta: string
  /** Valor antes del guardado. `''` = vacío / sin corrección manual (vuelve al calculado). */
  anterior: string
  nuevo: string
  anteriorTexto: string
  nuevoTexto: string
}

export interface PilaDeDeshacer {
  deshacer: PasoDeEdicion[]
  rehacer: PasoDeEdicion[]
}

export type AccionDeDeshacer = 'deshacer' | 'rehacer'

export const pilaVacia = (): PilaDeDeshacer => ({ deshacer: [], rehacer: [] })

/** Un guardado nuevo: se apila (máximo 50) y lo que había para rehacer se pierde. Sin cambio real, no se apila. */
export function apilar(p: PilaDeDeshacer, paso: PasoDeEdicion): PilaDeDeshacer {
  if (paso.anterior === paso.nuevo) return p
  return { deshacer: [...p.deshacer, paso].slice(-LIMITE_DE_PASOS), rehacer: [] }
}

export function tomarParaDeshacer(p: PilaDeDeshacer): { paso: PasoDeEdicion; pila: PilaDeDeshacer } | null {
  const paso = p.deshacer.at(-1)
  if (!paso) return null
  return { paso, pila: { deshacer: p.deshacer.slice(0, -1), rehacer: [...p.rehacer, paso].slice(-LIMITE_DE_PASOS) } }
}

export function tomarParaRehacer(p: PilaDeDeshacer): { paso: PasoDeEdicion; pila: PilaDeDeshacer } | null {
  const paso = p.rehacer.at(-1)
  if (!paso) return null
  return { paso, pila: { deshacer: [...p.deshacer, paso].slice(-LIMITE_DE_PASOS), rehacer: p.rehacer.slice(0, -1) } }
}

/** Saca un paso de las dos pilas (conflicto, o ya no está en pantalla). */
export function quitarPaso(p: PilaDeDeshacer, id: string): PilaDeDeshacer {
  return { deshacer: p.deshacer.filter((x) => x.id !== id), rehacer: p.rehacer.filter((x) => x.id !== id) }
}

/** Sólo quedan los pasos de la pantalla actual. */
export function sinPasosDeOtraRuta(p: PilaDeDeshacer, ruta: string): PilaDeDeshacer {
  return { deshacer: p.deshacer.filter((x) => x.ruta === ruta), rehacer: p.rehacer.filter((x) => x.ruta === ruta) }
}

/**
 * ¿El valor que se ve ya no es el que se espera? `actual` indefinido = no hay celda viva que mirar: decide el
 * servidor (o se aplica).
 */
export function hayConflicto(actual: string | undefined, esperado: string): boolean {
  return actual !== undefined && actual !== esperado
}

/**
 * EL ATAJO. Cmd/Ctrl+Z deshace; Cmd/Ctrl+Shift+Z y Ctrl+Y rehacen. Con el foco dentro de un input, un textarea,
 * un select o un contenido editable, NO se intercepta: ahí deshace el texto el navegador.
 */
export function atajoDeDeshacer(e: {
  key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; enEditable: boolean
}): AccionDeDeshacer | null {
  if (e.enEditable || e.altKey || !(e.metaKey || e.ctrlKey)) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'rehacer' : 'deshacer'
  if (k === 'y' && e.ctrlKey && !e.metaKey) return 'rehacer'
  return null
}

export function destinoEditable(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false
  const t = (el.tagName ?? '').toUpperCase()
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable === true
}

/** «Deshecho: Banco de Rosales $250.000 → $230.240». */
export function textoDelAviso(accion: AccionDeDeshacer, paso: PasoDeEdicion): string {
  return accion === 'deshacer'
    ? `Deshecho: ${paso.rotulo} ${paso.nuevoTexto} → ${paso.anteriorTexto}`
    : `Rehecho: ${paso.rotulo} ${paso.anteriorTexto} → ${paso.nuevoTexto}`
}
