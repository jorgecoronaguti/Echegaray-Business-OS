// LAS CELDAS DE LA BASE MAESTRA — las cuatro maneras de decir un número, y las de decir que no hay.
//
// Existen para que ninguna pantalla de este módulo tenga que acordarse de las reglas: un número va
// en mono tabular, una ausencia va en `faint` con su nombre, y un precio viejo se ve viejo. Escritas
// una vez, se cumplen siempre.

import type { ReactNode } from 'react'
import { Estado, Nulo, type TonoEstado } from '@/shared/components/ds'
import {
  ETIQUETA_ANALISIS, desvioObservado, fechaCorta, numero, pesos, porcentaje,
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

// ═══ LO QUE PASÓ EN OBRA, AL LADO DE LA BASE ═══════════════════════════════════════════════════
//
// El número es el esfuerzo observado y el `×` es su cociente contra la base. Van juntos porque
// separados no se pueden leer: 44,88 hs/m³ no dice nada hasta que se sabe que la base decía 34.
//
// LA DIRECCIÓN LA DICE EL COCIENTE, NO UNA FLECHA. El diseño canónico dibuja ↑/↓, pero la
// iconografía del OS no tiene ese par y redibujarlo acá lo convertiría en el trigésimo tercer
// icono del sistema — además de que `1,32×` es más informativo que una flecha, que sólo dice el
// signo. El color sigue la banda de `desvioObservado`: warn cuando la obra pidió más horas.
export function EsfuerzoObservado({
  base, observado,
}: { base: number | null | undefined; observado: number | null | undefined }) {
  const t = numero(observado, 2)
  // «sin medir» y no «sin dato»: la tarea puede estar perfectamente cargada; lo que falta es que
  // alguien la haya ejecutado y le haya imputado horas.
  if (t == null) return <Nulo>sin medir</Nulo>
  const d = desvioObservado(base, observado)
  const color = d == null ? 'text-ink-soft' : d.direccion === 'peor' ? 'text-warn' : d.direccion === 'mejor' ? 'text-pos' : 'text-ink-soft'
  return (
    <span
      data-desvio={d?.direccion ?? 'sin-base'}
      title={d == null ? 'Medido en obra, pero la tarea no tiene esfuerzo base para comparar' : undefined}
      className={`whitespace-nowrap font-mono text-[12px] tabular-nums ${color}`}
    >
      {t}
      {d && <span className="ml-1.5 text-[11px]">{numero(d.ratio, 2)}×</span>}
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
