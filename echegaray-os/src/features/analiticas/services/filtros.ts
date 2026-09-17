// LOS FILTROS DE ANALÍTICAS VIVEN EN LA URL — y la URL sólo guarda lo que se aparta del defecto.
//
// ═══ POR QUÉ LA URL Y NO UN ESTADO ═══
//
// El dueño (17/09/2026) pidió que los filtros persistan entre vistas. Un estado de React se pierde al
// recargar y no viaja en un link pegado en el chat; la URL sí. Y como la URL la escribe cualquiera,
// entra por Zod: un `periodo=2026-13-45..ayer` no puede llegar a la base como fecha.
//
// ═══ QUÉ FILTRO APLICA A QUÉ VISTA ═══
//
// Resumen, Presupuesto y gasto y Gasto por obra son ACUMULADOS: el semáforo contra el presupuesto no
// tiene sentido con medio presupuesto gastado «en agosto». Nómina y Cobranza son de la empresa, no de
// una obra. El control que no aplica se APAGA con su razón —nunca se esconde—: si desapareciera, el
// dueño no sabría si el número que mira está filtrado o no.
//
// Rutas relativas con extensión: `node --test` no resuelve el alias `@/`.
import { z } from 'zod'

export const VISTAS = [
  { clave: 'resumen', rotulo: 'Resumen' },
  { clave: 'contrato', rotulo: 'Presupuesto y gasto' },
  { clave: 'obra', rotulo: 'Gasto por obra' },
  { clave: 'hora', rotulo: 'Costo por hora' },
  { clave: 'caja', rotulo: 'Caja' },
  { clave: 'nomina', rotulo: 'Nómina' },
  { clave: 'cobranza', rotulo: 'Cobranza' },
] as const

export type Vista = (typeof VISTAS)[number]['clave']
export type Preset = 'mes' | 'tri' | 'anio' | 'inicio'
export type EstadoObra = 'curso' | 'terminadas' | 'sinIniciar' | 'todas'
export type Control = 'periodo' | 'estado' | 'obras'

export type Periodo = { tipo: 'preset'; preset: Preset } | { tipo: 'rango'; desde: string; hasta: string }

export interface Filtros {
  vista: Vista
  periodo: Periodo
  estado: EstadoObra
  /** Vacío = todas las obras del estado. */
  obras: string[]
  cliente: string | null
  orden: string | null
}

export const PRESETS: { clave: Preset; rotulo: string }[] = [
  { clave: 'mes', rotulo: 'Este mes' },
  { clave: 'tri', rotulo: 'Este trimestre' },
  { clave: 'anio', rotulo: 'Este año' },
  { clave: 'inicio', rotulo: 'Desde el inicio' },
]

export const ESTADOS: { clave: EstadoObra; rotulo: string }[] = [
  { clave: 'curso', rotulo: 'En curso' },
  { clave: 'terminadas', rotulo: 'Terminadas' },
  { clave: 'sinIniciar', rotulo: 'Sin iniciar' },
  { clave: 'todas', rotulo: 'Todas' },
]

export const DEFECTO: Filtros = {
  vista: 'resumen', periodo: { tipo: 'preset', preset: 'inicio' }, estado: 'curso', obras: [], cliente: null, orden: null,
}

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
})
const SLUG = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/)
const VISTA = z.enum(VISTAS.map((v) => v.clave) as [Vista, ...Vista[]])
const PRESET = z.enum(['mes', 'tri', 'anio', 'inicio'])
const ESTADO = z.enum(['curso', 'terminadas', 'sinIniciar', 'todas'])

type Params = Record<string, string | string[] | undefined>
const uno = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/** `mes` · `tri` · `anio` · `inicio` · `AAAA-MM-DD..AAAA-MM-DD`. Lo que no se entiende es el defecto. */
export function leerPeriodo(crudo: string | undefined): Periodo {
  if (!crudo) return DEFECTO.periodo
  const p = PRESET.safeParse(crudo)
  if (p.success) return { tipo: 'preset', preset: p.data }
  const [a, b] = crudo.split('..')
  const desde = FECHA.safeParse(a)
  const hasta = FECHA.safeParse(b)
  if (!desde.success || !hasta.success || desde.data > hasta.data) return DEFECTO.periodo
  return { tipo: 'rango', desde: desde.data, hasta: hasta.data }
}

export function leerFiltros(params: Params): Filtros {
  const vista = VISTA.safeParse(uno(params.vista))
  const estado = ESTADO.safeParse(uno(params.estado))
  const obras = (uno(params.obras) ?? '').split(',').filter((s) => SLUG.safeParse(s).success)
  const cliente = SLUG.safeParse(uno(params.cliente))
  const orden = z.enum(['gastado', 'presupuesto', 'pct', 'horas', 'ritmo']).safeParse(uno(params.orden))
  return {
    vista: vista.success ? vista.data : DEFECTO.vista,
    periodo: leerPeriodo(uno(params.periodo)),
    estado: estado.success ? estado.data : DEFECTO.estado,
    obras: [...new Set(obras)],
    cliente: cliente.success ? cliente.data : null,
    orden: orden.success ? orden.data : null,
  }
}

const textoPeriodo = (p: Periodo): string => (p.tipo === 'preset' ? p.preset : `${p.desde}..${p.hasta}`)
const esDefectoPeriodo = (p: Periodo): boolean => p.tipo === 'preset' && p.preset === 'inicio'

/**
 * LA URL DE UNOS FILTROS: sólo lo que se aparta del defecto. `cliente` y `orden` son de UNA vista y no
 * viajan a las otras: el cliente elegido en Contrato y gasto no tiene significado en Caja.
 */
export function aUrl(f: Filtros): string {
  const q = new URLSearchParams()
  if (f.vista !== DEFECTO.vista) q.set('vista', f.vista)
  if (f.cliente && f.vista === 'contrato') q.set('cliente', f.cliente)
  if (f.orden && f.vista === 'obra') q.set('orden', f.orden)
  if (!esDefectoPeriodo(f.periodo)) q.set('periodo', textoPeriodo(f.periodo))
  if (f.estado !== DEFECTO.estado) q.set('estado', f.estado)
  if (f.obras.length) q.set('obras', f.obras.join(','))
  const s = q.toString().replaceAll('%2C', ',')
  return s ? `/analiticas?${s}` : '/analiticas'
}

/** ¿Se aparta del defecto? Es lo que pinta el botón en amarillo y lo que ofrece «Restablecer». */
export function apartado(f: Filtros, c: Control): boolean {
  if (c === 'periodo') return !esDefectoPeriodo(f.periodo)
  if (c === 'estado') return f.estado !== DEFECTO.estado
  return f.obras.length > 0
}

export const cuantosApartados = (f: Filtros): number =>
  (['periodo', 'estado', 'obras'] as const).filter((c) => apartado(f, c)).length

// GASTO POR OBRA TAMBIÉN (auditoría 17/09/2026, D3): su «% del presupuesto» pone el gasto contra el
// presupuesto ENTERO; con el gasto de un mes contra el de toda la obra, el % no significa nada.
const ACUMULADAS: ReadonlySet<Vista> = new Set(['resumen', 'contrato', 'obra'])
const DE_EMPRESA: ReadonlySet<Vista> = new Set(['nomina', 'cobranza'])

/** POR QUÉ un control no aplica en una vista, o `null` si aplica. La razón va al `title` del control. */
export function razonNoAplica(vista: Vista, c: Control): string | null {
  if (c === 'periodo' && ACUMULADAS.has(vista)) {
    return 'Esta vista compara lo gastado contra el presupuesto: es acumulada a la fecha.'
  }
  if (c !== 'periodo' && DE_EMPRESA.has(vista)) {
    return vista === 'nomina' ? 'La nómina es de la empresa: no se abre por obra.' : 'La cobranza es por cliente: no se abre por obra.'
  }
  // EGRESOS NO TRAE LA OBRA COMO IDENTIDAD: sólo el texto que se escribió en Compras. Filtrar por un
  // texto sería afirmar que dos rótulos parecidos son la misma obra.
  if (c !== 'periodo' && vista === 'caja') return 'La caja se lee por destino del egreso, no por obra.'
  return null
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * EL RANGO DE FECHAS QUE VIAJA A LA BASE, inclusive en los dos bordes. `null` = sin borde.
 * Los presets son el período EN CURSO hasta hoy (mes, trimestre calendario, año), no «los últimos N días»:
 * un mes que empieza el 1 se compara con el recibo de sueldo del mes, que es como la empresa lo mira.
 */
export function rangoDe(p: Periodo, hoyISO: string): { desde: string | null; hasta: string | null } {
  if (p.tipo === 'rango') return { desde: p.desde, hasta: p.hasta }
  if (p.preset === 'inicio') return { desde: null, hasta: null }
  const hoy = new Date(`${hoyISO}T00:00:00Z`)
  const y = hoy.getUTCFullYear()
  const m = hoy.getUTCMonth()
  const inicio = p.preset === 'mes' ? new Date(Date.UTC(y, m, 1))
    : p.preset === 'tri' ? new Date(Date.UTC(y, m - (m % 3), 1))
      : new Date(Date.UTC(y, 0, 1))
  return { desde: iso(inicio), hasta: hoyISO }
}

/** El rango efectivo para una vista: el período sólo viaja si aplica. */
export function rangoParaVista(f: Filtros, hoyISO: string): { desde: string | null; hasta: string | null } {
  return razonNoAplica(f.vista, 'periodo') ? { desde: null, hasta: null } : rangoDe(f.periodo, hoyISO)
}

const ddmm = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`

/** El valor que dibuja el botón: «Este mes», «01/08/26 – 31/08/26». */
export function rotuloPeriodo(p: Periodo): string {
  if (p.tipo === 'rango') return `${ddmm(p.desde)} – ${ddmm(p.hasta)}`
  return PRESETS.find((x) => x.clave === p.preset)?.rotulo ?? ''
}
