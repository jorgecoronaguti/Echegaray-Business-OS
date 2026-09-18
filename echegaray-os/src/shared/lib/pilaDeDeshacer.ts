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
// avisa «la celda la cambió otra persona: no se deshizo» y el paso se descarta. TODA escritura de deshacer o
// rehacer viaja con `esperado` (lo que esta persona vio) y el servidor hace la misma comprobación contra la
// base: la pantalla puede estar atrasada, la base no.
//
// ═══ NUNCA SE VACÍA UNA CELDA (auditoría del 18/09/2026) ═══
//
// Regla de la casa: ninguna escritura puede vaciar una celda cargada por otra persona. Un paso cuyo valor
// anterior es `''` no tiene nada que restaurar: deshacerlo escribiría NULL, y si ese `''` era una pantalla
// atrasada —otra persona había cargado la celda y este control no lo había visto— el NULL borra lo ajeno. Se
// vio en Pedidos: otra persona asignó la actividad X, el refresco llegó pero el select seguía en `''`, esta
// persona eligió Y y Cmd+Z dejó la celda en NULL. Por eso deshacer hacia `''` se rechaza en la plataforma,
// con el mismo aviso que ya tenía `CeldaTarifa`: «no había un valor anterior que restaurar».
//
// La única excepción es declarada por la celda (`vacioRestaurable`): cuando `''` NO deja la celda vacía sino
// que la devuelve a un valor calculado (Liquidación: «sin corrección manual») y el servidor verifica
// `esperado`. Ahí el vacío es un estado con contenido, no una celda borrada.

export const LIMITE_DE_PASOS = 50
export const MENSAJE_CONFLICTO = 'la celda la cambió otra persona: no se deshizo'
export const MENSAJE_SIN_ANTERIOR = 'no había un valor anterior que restaurar: no se deshizo'

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
  /**
   * `''` es un valor con contenido para esta celda (vuelve al calculado) y el servidor verifica `esperado`.
   * Sin esto, deshacer hacia `''` se rechaza: sería vaciar la celda.
   */
  vacioRestaurable?: boolean
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
 * ¿POR QUÉ NO SE PUEDE RESTAURAR ESTE PASO? `null` = se puede. Deshacer hacia `''` sólo si la celda declaró que
 * el vacío es un valor (`vacioRestaurable`). Rehacer no entra en la regla: rehacer un vaciado es repetir lo que
 * esta misma persona hizo, con `esperado` = lo que ella acaba de restaurar.
 */
export function motivoParaNoRestaurar(accion: AccionDeDeshacer, paso: PasoDeEdicion): string | null {
  if (accion === 'deshacer' && paso.anterior === '' && !paso.vacioRestaurable) return MENSAJE_SIN_ANTERIOR
  return null
}

/**
 * LA COMPROBACIÓN DEL SERVIDOR: ¿lo que hay hoy en la base es lo que esta persona vio (`esperado`)? Una sola
 * regla para todas las acciones que reciben `esperado`. NULL y `''` son el mismo vacío; un número se compara
 * como número (la pantalla dibuja «123,5» y la base guarda 123.5); el texto, sin espacios en las puntas.
 */
export function coincideConLoEsperado(hoy: unknown, esperado: string): boolean {
  const e = esperado.trim()
  if (hoy == null) return e === ''
  if (typeof hoy === 'number') {
    const n = Number(e.replace(',', '.'))
    return e !== '' && Number.isFinite(n) && n === hoy
  }
  return String(hoy).trim() === e
}

/**
 * EL ATAJO. Cmd/Ctrl+Z deshace; Cmd/Ctrl+Shift+Z y Cmd/Ctrl+Y rehacen. Con el foco dentro de un input, un textarea
 * o un contenido editable, NO se intercepta: ahí deshace el texto el navegador. Un `<select>` NO es editable
 * (18/09/2026): el navegador no tiene nada que deshacer en un desplegable, y como el foco se queda en él después
 * de elegir, Cmd+Z no hacía nada hasta clicar afuera.
 *
 * `Y` TAMBIÉN CON CMD (dueño, 17/09/2026: *«tiene que estar el rehacer en toda la plataforma»*). Hasta hoy `Cmd+Y`
 * caía al navegador y no rehacía nada; quien viene de Windows lo teclea igual en la Mac. `Cmd+A` NO se toca: es
 * «seleccionar todo» y robarlo rompe algo que todo el mundo usa.
 */
export function atajoDeDeshacer(e: {
  key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; enEditable: boolean
}): AccionDeDeshacer | null {
  if (e.enEditable || e.altKey || !(e.metaKey || e.ctrlKey)) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'rehacer' : 'deshacer'
  if (k === 'y') return 'rehacer'
  return null
}

/**
 * CÓMO SE TECLEA REHACER, PARA ESCRIBIRLO EN EL AVISO. Dueño, 17/09/2026: el botón «Rehacer» ya estaba y nadie
 * sabía que además hay un atajo. Un atajo que no se dice no existe, así que el aviso lo dice cada vez que se
 * deshace algo — con el teclado de quien está mirando, no con el del que programó.
 */
export function textoDelAtajoDeRehacer(esMac: boolean): string {
  return esMac ? '\u2318\u21e7Z' : 'Ctrl+Shift+Z'
}

/** ¿Teclado de Mac? Se mira el userAgent/plataforma; fuera del navegador, no. */
export function esTecladoMac(plataforma: string | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(plataforma ?? '')
}

export function destinoEditable(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false
  const t = (el.tagName ?? '').toUpperCase()
  return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable === true
}

/** «Deshecho: Banco de Rosales $250.000 → $230.240». */
export function textoDelAviso(accion: AccionDeDeshacer, paso: PasoDeEdicion): string {
  return accion === 'deshacer'
    ? `Deshecho: ${paso.rotulo} ${paso.nuevoTexto} → ${paso.anteriorTexto}`
    : `Rehecho: ${paso.rotulo} ${paso.anteriorTexto} → ${paso.nuevoTexto}`
}
