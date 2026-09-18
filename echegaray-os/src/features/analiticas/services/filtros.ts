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
// Resumen y Obras son ACUMULADOS: el presupuesto contra lo consumido no tiene sentido con medio
// presupuesto gastado «en agosto». Nómina y Cobranza son de la empresa, no de
// una obra. El control que no aplica se APAGA con su razón —nunca se esconde—: si desapareciera, el
// dueño no sabría si el número que mira está filtrado o no.
//
// Rutas relativas con extensión: `node --test` no resuelve el alias `@/`.
import { z } from 'zod'

// LAS CINCO VISTAS (dueño, 17/09/2026: «pedí primero Resumen; hay datos que se repiten en todas,
// hacer más fácil»). Contrato y gasto, Gasto por obra y Costo por hora se fundieron en Obras.
export const VISTAS = [
  { clave: 'resumen', rotulo: 'Resumen' },
  { clave: 'obras', rotulo: 'Obras' },
  { clave: 'caja', rotulo: 'Caja' },
  { clave: 'nomina', rotulo: 'Nómina' },
  { clave: 'cobranza', rotulo: 'Cobranza' },
] as const

export type Vista = (typeof VISTAS)[number]['clave']
export type Preset = 'mes' | 'mesAnt' | '30d' | 'tri' | 'anio' | 'inicio'
export type EstadoObra = 'curso' | 'terminadas' | 'sinIniciar' | 'todas'
export type Control = 'periodo' | 'estado' | 'obras'

export type Periodo = { tipo: 'preset'; preset: Preset } | { tipo: 'rango'; desde: string; hasta: string }

export interface Filtros {
  vista: Vista
  periodo: Periodo
  estado: EstadoObra
  /** Vacío = todas las obras del estado. */
  obras: string[]
  /** La obra elegida en la vista Obras. `null` = la que más consumió. */
  obra: string | null
}

/**
 * LAS VISTAS RETIRADAS SIGUEN ABRIENDO ALGO: un link viejo pegado en el chat no puede dar un error.
 * Lo que era de una obra va a Obras; «Estado del gasto» era el semáforo de la cartera y va a Resumen.
 */
export const VISTAS_RETIRADAS: Readonly<Record<string, Vista>> = {
  contrato: 'obras', obra: 'obras', hora: 'obras', estado: 'resumen',
}

export const PRESETS: { clave: Preset; rotulo: string }[] = [
  { clave: 'mes', rotulo: 'Este mes' },
  // LOS ATAJOS DE CAJA (dueño, 18/09/2026: «quiero filtro de fechas para determinar lo que quiero ver»):
  // el mes cerrado anterior y los últimos 30 días, que son como se mira lo que salió.
  { clave: 'mesAnt', rotulo: 'Mes anterior' },
  { clave: '30d', rotulo: 'Últimos 30 días' },
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
  vista: 'resumen', periodo: { tipo: 'preset', preset: 'inicio' }, estado: 'curso', obras: [], obra: null,
}

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
})
const SLUG = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/)
const VISTA = z.enum(VISTAS.map((v) => v.clave) as [Vista, ...Vista[]])
const PRESET = z.enum(['mes', 'mesAnt', '30d', 'tri', 'anio', 'inicio'])
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
  const crudo = uno(params.vista)
  const vista = VISTA.safeParse(crudo != null && crudo in VISTAS_RETIRADAS ? VISTAS_RETIRADAS[crudo] : crudo)
  const estado = ESTADO.safeParse(uno(params.estado))
  const obras = (uno(params.obras) ?? '').split(',').filter((s) => SLUG.safeParse(s).success)
  const obra = SLUG.safeParse(uno(params.obra))
  return {
    vista: vista.success ? vista.data : DEFECTO.vista,
    periodo: leerPeriodo(uno(params.periodo)),
    estado: estado.success ? estado.data : DEFECTO.estado,
    obras: [...new Set(obras)],
    obra: obra.success ? obra.data : null,
  }
}

const textoPeriodo = (p: Periodo): string => (p.tipo === 'preset' ? p.preset : `${p.desde}..${p.hasta}`)
const esDefectoPeriodo = (p: Periodo): boolean => p.tipo === 'preset' && p.preset === 'inicio'

/**
 * LA URL DE UNOS FILTROS: sólo lo que se aparta del defecto. `obra` es de la vista Obras y no viaja
 * a las otras: la obra elegida no tiene significado en Caja.
 */
export function aUrl(f: Filtros): string {
  const q = new URLSearchParams()
  if (f.vista !== DEFECTO.vista) q.set('vista', f.vista)
  if (f.obra && f.vista === 'obras') q.set('obra', f.obra)
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

// OBRAS TAMBIÉN (auditoría 17/09/2026, D3): su «% del presupuesto» pone el gasto contra el presupuesto
// ENTERO; con el gasto de un mes contra el de toda la obra, el % no significa nada.
const ACUMULADAS: ReadonlySet<Vista> = new Set(['resumen', 'obras'])
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
  // El mes anterior es un mes CERRADO: del 1 al último día, sin llegar a hoy.
  if (p.preset === 'mesAnt') return { desde: iso(new Date(Date.UTC(y, m - 1, 1))), hasta: iso(new Date(Date.UTC(y, m, 0))) }
  if (p.preset === '30d') return { desde: iso(new Date(hoy.getTime() - 29 * 86400000)), hasta: hoyISO }
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

/**
 * ¿HAY QUE REDIRIGIR? Sí cuando la URL trae una vista retirada o que no existe: la página responde con
 * la URL normalizada (`aUrl`), así la barra de direcciones dice la vista que se está mirando.
 */
export function redireccionDe(params: Params): string | null {
  const crudo = uno(params.vista)
  if (crudo == null || VISTA.safeParse(crudo).success) return null
  return aUrl(leerFiltros(params))
}
