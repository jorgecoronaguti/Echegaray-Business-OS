// LO QUE SE SUMA ENTRE OBRAS — y lo que NUNCA entra a una suma.
//
// Los cajones «sin obra asignada» se suman al gasto del cliente y a la cifra de la empresa, pero no
// entran a ningún ratio POR OBRA: repartirlos sería decidir a qué obra fue una compra que Compras no
// supo decir. Y un ratio sin sus dos patas no se publica: `queda` sólo existe con contrato Y gasto,
// `$/hora` sólo con mano de obra imputada Y horas.
import type { ObraAnalitica } from './obras.ts'

const sumaNula = (xs: (number | null)[]): number | null =>
  xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0)

export interface FilaCliente {
  clienteId: string
  slug: string
  nombre: string
  obras: ObraAnalitica[]
  gastado: number | null
  contratado: number | null
  /** contratado − gastado de las obras que tienen LAS DOS patas. */
  queda: number | null
  horas: number | null
  sinObra: number | null
  /** Parte del gasto total de la empresa (obras + sin obra). */
  parte: number | null
}

export function porCliente(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): FilaCliente[] {
  const m = new Map<string, ObraAnalitica[]>()
  for (const o of obras) m.set(o.clienteId, [...(m.get(o.clienteId) ?? []), o])
  const filas = [...m.entries()].map(([clienteId, lista]): FilaCliente => {
    const conDos = lista.filter((o) => o.precio != null && o.gasto.total != null)
    return {
      clienteId, slug: lista[0].clienteSlug, nombre: lista[0].clienteNombre, obras: lista,
      gastado: sumaNula([...lista.map((o) => o.gasto.total), sinObra.get(clienteId) ?? null]),
      contratado: sumaNula(lista.map((o) => o.precio)),
      queda: conDos.length ? conDos.reduce((a, o) => a + (o.precio ?? 0) - (o.gasto.total ?? 0), 0) : null,
      horas: sumaNula(lista.map((o) => o.gasto.horas)),
      sinObra: sinObra.get(clienteId) ?? null,
      parte: null,
    }
  })
  const total = filas.reduce((a, f) => a + (f.gastado ?? 0), 0)
  for (const f of filas) f.parte = total > 0 && f.gastado != null ? f.gastado / total : null
  return filas.sort((a, b) => (b.gastado ?? -1) - (a.gastado ?? -1))
}

export interface CifrasResumen {
  contratadoConPapel: number | null
  gastadoEnObras: number | null
  sinObraAsignada: number | null
  horasEnObra: number | null
  obrasSinPrecio: number
}

export function cifrasResumen(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): CifrasResumen {
  return {
    contratadoConPapel: sumaNula(obras.filter((o) => o.contrato.conPapel).map((o) => o.contrato.total)),
    gastadoEnObras: sumaNula(obras.map((o) => o.gasto.total)),
    sinObraAsignada: sumaNula([...sinObra.values()]),
    horasEnObra: sumaNula(obras.map((o) => o.gasto.horas)),
    obrasSinPrecio: obras.filter((o) => o.precio == null).length,
  }
}

/** De qué está hecho el gasto EN OBRAS: tres partes que suman 1, o `null` si no hay gasto. */
export function composicion(obras: ObraAnalitica[]): { manoObra: number; subcontratos: number; materiales: number } | null {
  const mo = obras.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
  const sub = obras.reduce((a, o) => a + (o.gasto.subcontratos ?? 0), 0)
  const mat = obras.reduce((a, o) => a + (o.gasto.materiales ?? 0), 0)
  const t = mo + sub + mat
  return t > 0 ? { manoObra: mo / t, subcontratos: sub / t, materiales: mat / t } : null
}

/** «MO 62 % · sub 8 % · mat 30 %», o `null` sin gasto. */
export function textoComposicion(o: ObraAnalitica): string | null {
  const c = composicion([o])
  if (!c) return null
  const p = (x: number) => `${Math.round(x * 100)} %`
  return `MO ${p(c.manoObra)} · sub ${p(c.subcontratos)} · mat ${p(c.materiales)}`
}

export const masGastan = (obras: ObraAnalitica[], n = 8): ObraAnalitica[] =>
  obras.filter((o) => (o.gasto.total ?? 0) > 0).sort((a, b) => (b.gasto.total ?? 0) - (a.gasto.total ?? 0)).slice(0, n)

// ─── Contrato y gasto: la matriz obra × ítem ────────────────────────────────────────────────────

export type Item = 'manoObra' | 'subcontratos' | 'materiales' | 'horas'
export const ITEMS: { clave: Item; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'horas', rotulo: 'HH' },
]

export interface Celda {
  /** Lo gastado (pesos, u horas en HH). `null` = no hay registro. */
  gastado: number | null
  /** gastado ÷ cotizado; `null` sin cotizado o sin gasto. */
  pct: number | null
  /** La palabra de lo cotizado cuando no hay número. */
  cotizadoAusente: 'no es venta' | 'sin previsión' | 'el cliente' | 'sin desglose' | 'sin valuar' | 'sin precio' | null
  cotizado: number | null
  /** 0–3 según el %; 4 = excedido; `null` = sin fondo. */
  tono: 0 | 1 | 2 | 3 | 4 | null
}

export function tonoDe(pct: number | null): Celda['tono'] {
  if (pct == null) return null
  if (pct > 1) return 4
  return pct >= UMBRAL_TONOS[2] ? 3 : pct >= UMBRAL_TONOS[1] ? 2 : pct >= UMBRAL_TONOS[0] ? 1 : 0
}
const UMBRAL_TONOS = [0.25, 0.5, 0.8] as const

export function celda(o: ObraAnalitica, item: Item): Celda {
  const g = item === 'horas' ? o.gasto.horas : o.gasto[item]
  if (item === 'subcontratos') return { gastado: g, pct: null, cotizado: null, cotizadoAusente: 'no es venta', tono: null }
  if (item === 'horas') return { gastado: g, pct: null, cotizado: null, cotizadoAusente: 'sin previsión', tono: null }
  const cot = item === 'manoObra' ? o.contrato.manoObra : o.contrato.materiales
  let ausente: Celda['cotizadoAusente'] = null
  if (item === 'materiales' && o.contrato.materialesDelCliente) ausente = 'el cliente'
  else if (cot == null) ausente = o.ausencia === 'sin valuar' ? 'sin valuar' : o.precio != null ? 'sin desglose' : 'sin precio'
  const pct = ausente == null && cot != null && cot > 0 && g != null ? g / cot : null
  return { gastado: g, pct, cotizado: ausente == null ? cot : null, cotizadoAusente: ausente, tono: tonoDe(pct) }
}

/** Los cuatro anillos de un cliente: % gastado del cotizado por ítem, `null` donde no hay cotizado. */
export function anillosDeCliente(obras: ObraAnalitica[]): { item: Item; gastado: number | null; cotizado: number | null }[] {
  return ITEMS.map(({ clave }) => {
    const celdas = obras.map((o) => celda(o, clave))
    const conCot = celdas.filter((c) => c.cotizado != null)
    return {
      item: clave,
      gastado: sumaNula(celdas.map((c) => c.gastado)),
      cotizado: conCot.length ? conCot.reduce((a, c) => a + (c.cotizado ?? 0), 0) : null,
    }
  })
}

// ─── Costo por hora ─────────────────────────────────────────────────────────────────────────────

export const UMBRAL_HORA_CARA = 0.2

export interface PuntoHora { obra: ObraAnalitica; porHora: number; contraEmpresa: number }

/**
 * $/HORA = mano de obra imputada ÷ horas valorizadas, SÓLO con las dos. Es COSTO de la hora, no
 * productividad: una obra cara por hora puede ser la que más avanzó por hora. La empresa es el
 * cociente de las sumas —no el promedio de cocientes—, para que una obra de 10 h no pese como una de 3.000.
 */
export function costoPorHora(obras: ObraAnalitica[]): { empresa: number | null; puntos: PuntoHora[] } {
  const con = obras.filter((o) => (o.gasto.manoObra ?? 0) > 0 && (o.gasto.horasValorizadas ?? 0) > 0)
  const mo = con.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
  const h = con.reduce((a, o) => a + (o.gasto.horasValorizadas ?? 0), 0)
  const empresa = h > 0 ? mo / h : null
  const puntos = con.map((o) => {
    const porHora = (o.gasto.manoObra ?? 0) / (o.gasto.horasValorizadas ?? 1)
    return { obra: o, porHora, contraEmpresa: empresa ? porHora / empresa - 1 : 0 }
  })
  return { empresa, puntos: puntos.sort((a, b) => b.porHora - a.porHora) }
}

// ─── Gasto por obra ─────────────────────────────────────────────────────────────────────────────

export interface CifrasGastoPorObra { conAmbas: number; gastanSinPrecio: number; conPrecioSinMovimiento: number; excedidas: number }

export function cifrasGastoPorObra(obras: ObraAnalitica[]): CifrasGastoPorObra {
  const gasta = (o: ObraAnalitica) => (o.gasto.total ?? 0) > 0
  return {
    conAmbas: obras.filter((o) => o.precio != null && gasta(o)).length,
    gastanSinPrecio: obras.filter((o) => o.precio == null && gasta(o)).length,
    conPrecioSinMovimiento: obras.filter((o) => o.precio != null && !gasta(o)).length,
    excedidas: obras.filter((o) => o.precio != null && (o.gasto.total ?? 0) > o.precio).length,
  }
}

export type Orden = 'gastado' | 'contrato' | 'pct' | 'horas' | 'hora'

/** Orden de la tabla: sólo por números, y lo que no tiene el número va al final (nunca como cero). */
export function ordenar(obras: ObraAnalitica[], orden: Orden): ObraAnalitica[] {
  const v = (o: ObraAnalitica): number | null => {
    if (orden === 'gastado') return o.gasto.total
    if (orden === 'contrato') return o.precio
    if (orden === 'pct') return o.precio && o.gasto.total != null ? o.gasto.total / o.precio : null
    if (orden === 'horas') return o.gasto.horas
    return o.gasto.manoObra && o.gasto.horasValorizadas ? o.gasto.manoObra / o.gasto.horasValorizadas : null
  }
  return [...obras].sort((a, b) => {
    const x = v(a)
    const y = v(b)
    if (x == null && y == null) return a.nombre.localeCompare(b.nombre)
    if (x == null) return 1
    if (y == null) return -1
    return y - x
  })
}
