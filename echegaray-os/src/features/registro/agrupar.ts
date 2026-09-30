// LO QUE LA PANTALLA DEL REGISTRO CALCULA — puro, sin base, para poder probarlo.
//
// La firma de un error es LA MISMA que usa `orquestador/scripts/control-de-fallas.mjs` (SQL_FIRMA):
// el digest cuando lo hay, si no el mensaje con uuids y números cambiados por «#», cortado a 160.
// Si una cambia y la otra no, la pantalla y el aviso por bot agrupan distinto el mismo error.

export type FilaReg = {
  id: number
  en: string
  tipo: string
  perfil_id: string | null
  rol: string | null
  prestada: boolean
  metodo: string | null
  ruta: string
  consulta: string | null
  estado: number | null
  destino: string | null
  dispositivo: string | null
  despliegue: string | null
  digest: string | null
  mensaje: string | null
  detalle: Record<string, unknown> | null
}

export const TIPOS_ERROR = ['error_servidor', 'error_cliente'] as const

export function firma(f: Pick<FilaReg, 'digest' | 'mensaje' | 'estado'>): string {
  if (f.digest) return f.digest
  const base = f.mensaje ?? `estado ${f.estado}`
  return base.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/g, '#').slice(0, 160)
}

export type Grupo = {
  firma: string
  tipo: string
  veces: number
  primera: string
  ultima: string
  personas: string[]
  rutas: string[]
  despliegues: string[]
  mensaje: string | null
  digest: string | null
}

/** Agrupa por (tipo, firma), el más reciente primero. `quien` traduce un perfil a nombre. */
export function agrupar(filas: FilaReg[], quien: (id: string | null) => string): Grupo[] {
  const m = new Map<string, Grupo & { _p: Set<string>; _r: Set<string>; _d: Set<string> }>()
  for (const f of filas) {
    const k = `${f.tipo}|${firma(f)}`
    let g = m.get(k)
    if (!g) {
      g = { firma: firma(f), tipo: f.tipo, veces: 0, primera: f.en, ultima: f.en, personas: [], rutas: [], despliegues: [], mensaje: f.mensaje, digest: f.digest, _p: new Set(), _r: new Set(), _d: new Set() }
      m.set(k, g)
    }
    g.veces++
    if (f.en < g.primera) g.primera = f.en
    if (f.en > g.ultima) { g.ultima = f.en; g.mensaje = f.mensaje ?? g.mensaje }
    g._p.add(quien(f.perfil_id))
    g._r.add(f.ruta)
    if (f.despliegue) g._d.add(f.despliegue)
  }
  return [...m.values()]
    .map(({ _p, _r, _d, ...g }) => ({ ...g, personas: [..._p], rutas: [..._r], despliegues: [..._d] }))
    .sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
}

/** Rechazos y redirecciones agrupados por persona + ruta + destino: «a quién se le cerró qué». */
export type Rebote = { quien: string; rol: string | null; tipo: string; ruta: string; destino: string | null; veces: number; ultima: string }

export function rebotes(filas: FilaReg[], quien: (id: string | null) => string): Rebote[] {
  const m = new Map<string, Rebote>()
  for (const f of filas) {
    const q = quien(f.perfil_id)
    const k = `${q}|${f.tipo}|${f.ruta}|${f.destino ?? ''}`
    const r = m.get(k)
    if (r) {
      r.veces++
      if (f.en > r.ultima) r.ultima = f.en
    } else m.set(k, { quien: q, rol: f.rol, tipo: f.tipo, ruta: f.ruta, destino: f.destino, veces: 1, ultima: f.en })
  }
  return [...m.values()].sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
}

/** Ventanas que ofrece la pantalla, en horas. Una ventana pedida fuera de la lista cae en 24. */
export const VENTANAS = [1, 24, 72, 168, 720] as const
export function ventana(v: string | undefined): number {
  const n = Number(v)
  return (VENTANAS as readonly number[]).includes(n) ? n : 24
}
