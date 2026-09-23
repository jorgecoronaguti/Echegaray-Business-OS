'use client'

// LO QUE LA CABECERA DE LA OBRA DIBUJA Y LA PANTALLA DECIDE — un almacén chico compartido.
//
// El diseño pone en la cabecera (Server Component) cifras que cambian con lo que la persona hace
// abajo («Elegidas: 14», «Filas pegadas: 41», «Seleccionadas: 6») y la primaria de la pantalla
// («Convertir 14 partidas en plan», «Guardar el reparto», «Sellar línea base»). La cabecera no se
// toca; la página monta ahí dos piezas cliente (`CifraViva`, `PrimariaViva`) que leen de acá, y cada
// pantalla publica lo suyo. Es `useSyncExternalStore`: sin contexto que envolver, sin prop drilling.

import { useSyncExternalStore } from 'react'

export interface PrimariaViva {
  rotulo: string
  icono: 'mas' | 'flecha' | 'ok'
  apagada: boolean
  /** Por qué está apagada, para quien la mira (C10 «4 pendientes»). */
  motivo: string | null
  testid: string
  alPulsar: () => void
  pendiente?: boolean
}

/** Una cifra publicada: texto, o texto con tono (C04 «Fundaciones 65 %» en ámbar). */
export type CifraPublicada = string | { texto: string; tono: 'warn' | 'pos' } | null | undefined

interface Estado {
  cifras: Readonly<Record<string, CifraPublicada>>
  primaria: PrimariaViva | null
}

let estado: Estado = { cifras: {}, primaria: null }
const oyentes = new Set<() => void>()
const avisar = () => { for (const o of oyentes) o() }
const suscribir = (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o) } }

const VACIO: Estado = { cifras: {}, primaria: null }

export function publicarCifras(cifras: Readonly<Record<string, CifraPublicada>>) {
  estado = { ...estado, cifras: { ...estado.cifras, ...cifras } }
  avisar()
}

export function publicarPrimaria(primaria: PrimariaViva | null) {
  estado = { ...estado, primaria }
  avisar()
}

/** Al desmontar una pantalla, lo suyo se retira: la siguiente no hereda una primaria ajena. */
export function retirar() {
  estado = VACIO
  avisar()
}

export function useCifra(clave: string): CifraPublicada {
  return useSyncExternalStore(suscribir, () => estado.cifras[clave], () => undefined)
}

export function usePrimaria(): PrimariaViva | null {
  return useSyncExternalStore(suscribir, () => estado.primaria, () => null)
}

/** Las cifras que salen del árbol (C01 · C04 · C05 · C07–C09): las publica quien lo tiene en la mano. */
export function cifrasDelArbol(r: {
  nItems: number; sinMetodo: number; sinFechas: number; hhPlan: number | null; problema: string | null
  costoMo: string | null; costoTeorico: string | null; diasHabiles: number | null; seleccionadas?: number
}): Record<string, CifraPublicada> {
  return {
    items: r.nItems > 0 ? String(r.nItems) : null,
    ponderacion: r.problema ? { texto: r.problema, tono: 'warn' } : r.nItems > 0 ? { texto: '100 %', tono: 'pos' } : null,
    sin_metodo: r.nItems > 0 ? (r.sinMetodo > 0 ? { texto: String(r.sinMetodo), tono: 'warn' } : '0') : null,
    sin_fechas: r.nItems > 0 ? (r.sinFechas > 0 ? { texto: String(r.sinFechas), tono: 'warn' } : '0') : null,
    hh_plan: r.hhPlan == null ? null : Math.round(r.hhPlan).toLocaleString('es-AR'),
    mano_de_obra: r.costoMo,
    costo_teorico: r.costoTeorico,
    dias_habiles: r.diasHabiles == null ? null : String(r.diasHabiles),
    seleccionadas: r.seleccionadas == null ? null : String(r.seleccionadas),
  }
}
