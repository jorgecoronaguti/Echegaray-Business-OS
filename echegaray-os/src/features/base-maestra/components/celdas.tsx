// LAS CELDAS DE LA BASE MAESTRA — las cuatro maneras de decir un número, y las de decir que no hay.
//
// Existen para que ninguna pantalla de este módulo tenga que acordarse de las reglas: un número va
// en mono tabular, una ausencia va en `faint` con su nombre, y un precio viejo se ve viejo. Escritas
// una vez, se cumplen siempre.

import type { ReactNode } from 'react'
import { Estado, Nulo, type TonoEstado } from '@/shared/components/ds'
import {
  ETIQUETA_ANALISIS, fechaCorta, numero, pesos, porcentaje,
  type EstadoAnalisis, type Frescura,
} from '../services/reglas'

/** Un número. `falta` es lo que se escribe cuando no hay — nunca un cero. */
export function N({
  v, decimales = 2, falta = 'sin dato', className = '',
}: { v: number | null | undefined; decimales?: number; falta?: string; className?: string }) {
  const t = numero(v, decimales)
  if (t == null) return <Nulo>{falta}</Nulo>
  return <span className={`font-mono text-[12px] tabular-nums ${className}`}>{t}</span>
}

export function Plata({
  v, decimales = 0, falta = 'sin cargar', className = '',
}: { v: number | null | undefined; decimales?: number; falta?: string; className?: string }) {
  const t = pesos(v, decimales)
  if (t == null) return <Nulo>{falta}</Nulo>
  return <span className={`font-mono text-[12px] tabular-nums ${className}`}>{t}</span>
}

export function Pct({
  v, decimales = 2, falta = 'sin dato',
}: { v: number | null | undefined; decimales?: number; falta?: string }) {
  const t = porcentaje(v, decimales)
  if (t == null) return <Nulo>{falta}</Nulo>
  return <span className="font-mono text-[12px] tabular-nums">{t}</span>
}

// ═══ EL COSTO QUE NO SE PUEDE MOSTRAR ══════════════════════════════════════════════════════════
//
// ESTA ES LA CELDA QUE IMPIDE LA MENTIRA. `recurso_precio` sólo abre para `ve_economia()`, y un
// jefe de obra recibe cero filas SIN ERROR: todos los costos llegan en null, exactamente iguales a
// «nadie los cargó».
//
// Escribir «sin cargar» ahí sería afirmar que falta cargar 409 precios que están cargados, y mandar
// a alguien a cargarlos de nuevo. La pantalla dice lo que pasa de verdad: no tenés permiso.
//
// Lo correcto es no renderizar la columna —y las tablas de este módulo no la renderizan—; esto es
// la red por si alguna vez se cuela una.
export function SinPermiso() {
  return <span className="text-[12.5px] text-faint" data-sin-permiso="">sin permiso</span>
}

// ═══ LA FRESCURA DE UN PRECIO ══════════════════════════════════════════════════════════════════
//
// El color dice cuánto se puede confiar en el número de al lado: verde recién actualizado, warn
// cuando ya no sirve para cotizar. SIN FECHA no lleva color: no es viejo ni nuevo, es desconocido,
// y pintarlo de warn le inventaría una antigüedad que nadie midió.

const COLOR_FRESCURA: Record<Frescura, string> = {
  nueva: 'text-pos',
  ok: 'text-muted',
  vieja: 'text-warn',
  sin_fecha: 'text-faint',
}

export function FechaPrecio({ iso, frescura }: { iso: string | null; frescura: Frescura }) {
  const t = fechaCorta(iso)
  if (t == null) return <Nulo>sin fecha</Nulo>
  return (
    <span
      data-frescura={frescura}
      title={frescura === 'vieja' ? 'Precio vencido para cotizar' : undefined}
      className={`font-mono text-[11.5px] tabular-nums ${COLOR_FRESCURA[frescura]}`}
    >
      {t}
    </span>
  )
}

// ═══ EL ESTADO DEL ANÁLISIS ════════════════════════════════════════════════════════════════════

const TONO_ANALISIS: Record<EstadoAnalisis, TonoEstado> = {
  completo: 'pos',
  sin_revisar: 'warn',
  sin_analisis: 'neg',
}

export function EstadoAnalisisCelda({ estado, titulo }: { estado: EstadoAnalisis; titulo?: string | null }) {
  return (
    <span title={titulo ?? undefined}>
      <Estado tono={TONO_ANALISIS[estado]} clave={estado} testid="estado-analisis">
        {ETIQUETA_ANALISIS[estado]}
      </Estado>
    </span>
  )
}

/** Texto que puede faltar. `sin asignar`, `sin cargar`, `sin base`: la ausencia se nombra. */
export function Texto({
  v, falta, className = '',
}: { v: string | null | undefined; falta: string; className?: string }) {
  if (!v) return <Nulo>{falta}</Nulo>
  return <span className={`text-[12.5px] ${className}`}>{v}</span>
}

/** El rótulo de un bloque de ficha: 10px faint en versalitas. */
export function Rotulo({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-medium uppercase tracking-[0.05em] text-faint">{children}</div>
}
