// LO QUE SE SUMA ENTRE OBRAS — y lo que NUNCA entra a una suma.
//
// Los cajones «sin obra asignada» se suman al gasto del cliente y a la cifra de la empresa, pero no
// entran a ningún ratio POR OBRA: repartirlos sería decidir a qué obra fue una compra que Compras no
// supo decir. Y un ratio sin sus dos patas no se publica: `queda` sólo existe con presupuesto Y gasto,
// `$/hora` sólo con mano de obra imputada Y horas. El contrato viaja como referencia, nunca como
// presupuesto (ver `obras.ts`).
import { rotuloEstimada, type ObraAnalitica } from './obras.ts'
import { SIN_PRESUPUESTO, SIN_PRESUPUESTO_RUBRO, type Rubro } from './presupuesto.ts'
import type { Ritmo } from './consumo.ts'

const sumaNula = (xs: (number | null)[]): number | null =>
  xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0)

export interface FilaCliente {
  clienteId: string
  slug: string
  nombre: string
  obras: ObraAnalitica[]
  gastado: number | null
  /** Σ del presupuesto comparable de sus obras; `null` = ninguna tiene presupuesto. */
  presupuestado: number | null
  /** Σ del precio de venta: referencia. */
  contratado: number | null
  /** presupuestado − consumido, rubro contra rubro, de las obras que tienen LAS DOS patas. */
  queda: number | null
  nConPresupuesto: number
  nConPrecio: number
  horas: number | null
  sinObra: number | null
  /** Parte del gasto total de la empresa (obras + sin obra). */
  parte: number | null
  /** Las tres partes del gasto en obras y el cajón sin obra, sobre el gasto del cliente (0–1). */
  partes: { manoObra: number; subcontratos: number; materiales: number; sinObra: number } | null
}

export function porCliente(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): FilaCliente[] {
  const m = new Map<string, ObraAnalitica[]>()
  for (const o of obras) m.set(o.clienteId, [...(m.get(o.clienteId) ?? []), o])
  const filas = [...m.entries()].map(([clienteId, lista]): FilaCliente => {
    const conDos = lista.filter((o) => o.presupuesto != null && o.consumoComparable != null)
    const so = sinObra.get(clienteId) ?? null
    const gastado = sumaNula([...lista.map((o) => o.gasto.total), so])
    const suma = (k: 'manoObra' | 'subcontratos' | 'materiales') => lista.reduce((x, o) => x + (o.gasto[k] ?? 0), 0)
    return {
      clienteId, slug: lista[0].clienteSlug, nombre: lista[0].clienteNombre, obras: lista, gastado,
      presupuestado: sumaNula(lista.map((o) => o.presupuesto)),
      contratado: sumaNula(lista.map((o) => o.precio)),
      queda: conDos.length ? conDos.reduce((x, o) => x + (o.presupuesto ?? 0) - (o.consumoComparable ?? 0), 0) : null,
      nConPresupuesto: lista.filter((o) => o.presupuesto != null).length,
      nConPrecio: lista.filter((o) => o.precio != null).length,
      horas: sumaNula(lista.map((o) => o.gasto.horas)),
      sinObra: so,
      parte: null,
      partes: gastado && gastado > 0
        ? { manoObra: suma('manoObra') / gastado, subcontratos: suma('subcontratos') / gastado, materiales: suma('materiales') / gastado, sinObra: (so ?? 0) / gastado }
        : null,
    }
  })
  const total = filas.reduce((x, f) => x + (f.gastado ?? 0), 0)
  for (const f of filas) f.parte = total > 0 && f.gastado != null ? f.gastado / total : null
  return filas.sort((x, y) => (y.gastado ?? -1) - (x.gastado ?? -1))
}

export interface CifrasResumen {
  /** Σ del costo cotizado total de las cotizaciones aprobadas. */
  costoCotizado: number | null
  /** Σ de lo comparable (MO+CS y MA): lo que se mide contra el gasto. */
  presupuestado: number | null
  contratadoConPapel: number | null
  gastadoEnObras: number | null
  sinObraAsignada: number | null
  horasEnObra: number | null
  obrasConHoras: number
  obrasSinPresupuesto: number
  /** Lo gastado por las obras sin presupuesto: lo que no se puede controlar. */
  gastoSinPresupuesto: number | null
}

export function cifrasResumen(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): CifrasResumen {
  const sinPres = obras.filter((o) => o.presupuesto == null)
  return {
    costoCotizado: sumaNula(obras.map((o) => o.costoCotizado)),
    presupuestado: sumaNula(obras.map((o) => o.presupuesto)),
    contratadoConPapel: sumaNula(obras.filter((o) => o.contrato.conPapel).map((o) => o.contrato.total)),
    gastadoEnObras: sumaNula(obras.map((o) => o.gasto.total)),
    sinObraAsignada: sumaNula([...sinObra.values()]),
    horasEnObra: sumaNula(obras.map((o) => o.gasto.horas)),
    obrasConHoras: obras.filter((o) => (o.gasto.horas ?? 0) > 0).length,
    obrasSinPresupuesto: sinPres.length,
    gastoSinPresupuesto: sumaNula(sinPres.map((o) => o.gasto.total)),
  }
}

/** De qué está hecho el gasto EN OBRAS: tres partes que suman 1, o `null` si no hay gasto. */
export function composicion(obras: ObraAnalitica[]): { manoObra: number; subcontratos: number; materiales: number } | null {
  const mo = obras.reduce((x, o) => x + (o.gasto.manoObra ?? 0), 0)
  const sub = obras.reduce((x, o) => x + (o.gasto.subcontratos ?? 0), 0)
  const mat = obras.reduce((x, o) => x + (o.gasto.materiales ?? 0), 0)
  const t = mo + sub + mat
  return t > 0 ? { manoObra: mo / t, subcontratos: sub / t, materiales: mat / t } : null
}

/** La mano de obra de varias obras sumada, con su parte estimada: para rotular un total. */
export function manoObraDe(obras: ObraAnalitica[]): { manoObra: number | null; manoObraEstimada: number | null } {
  const con = obras.filter((o) => o.gasto.manoObra != null)
  if (!con.length) return { manoObra: null, manoObraEstimada: null }
  const est = con.reduce((x, o) => x + (o.gasto.manoObraEstimada ?? 0), 0)
  return { manoObra: con.reduce((x, o) => x + (o.gasto.manoObra ?? 0), 0), manoObraEstimada: est > 0 ? est : null }
}

/** «MO 62 % (80 % estimada) · sub 8 % · mat 30 %», o `null` sin gasto. */
export function textoComposicion(o: ObraAnalitica): string | null {
  const c = composicion([o])
  if (!c) return null
  const p = (x: number) => `${Math.round(x * 100)} %`
  const est = rotuloEstimada(o.gasto)
  return `MO ${p(c.manoObra)}${est ? ` (${est})` : ''} · sub ${p(c.subcontratos)} · mat ${p(c.materiales)}`
}

export const masGastan = (obras: ObraAnalitica[], n = 8): ObraAnalitica[] =>
  obras.filter((o) => (o.gasto.total ?? 0) > 0).sort((x, y) => (y.gasto.total ?? 0) - (x.gasto.total ?? 0)).slice(0, n)

// ─── Presupuesto y gasto: obra × rubro ──────────────────────────────────────────────────────────

export type Item = Rubro | 'horas'
export const ITEMS: { clave: Item; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'otros', rotulo: 'Otros' },
  { clave: 'horas', rotulo: 'HH' },
]

export interface Celda {
  /** Lo gastado (pesos, u horas en HH). `null` = no hay registro. */
  gastado: number | null
  /** Por qué no hay gastado: «otros» no tiene fuente de consumo. */
  gastadoAusente: 'sin registrar' | null
  /** `true` = el presupuesto de este rubro es INFERENCIA. */
  estimado: boolean
  cotizado: number | null
  /** La palabra de lo cotizado cuando no hay número. */
  cotizadoAusente: string | null
  /** gastado ÷ cotizado; `null` sin las dos patas. */
  pct: number | null
  lectura: { tipo: 'queda' | 'excedido' | 'sinMovimiento' | 'sinPresupuesto' | 'sinConsumo'; monto: number | null } | null
}

/** Una celda armada con sus dos patas: lo que queda, lo excedido o por qué no se puede decir. */
export function lecturaDe(cotizado: number | null, gastado: number | null): Celda['lectura'] {
  if (cotizado == null || cotizado <= 0) return gastado != null && gastado > 0 ? { tipo: 'sinPresupuesto', monto: null } : null
  if (gastado == null || gastado <= 0) return { tipo: 'sinMovimiento', monto: null }
  return gastado > cotizado ? { tipo: 'excedido', monto: gastado - cotizado } : { tipo: 'queda', monto: cotizado - gastado }
}

export function celda(o: ObraAnalitica, item: Item): Celda {
  if (item === 'horas') {
    return { gastado: o.gasto.horas, gastadoAusente: null, estimado: false, cotizado: null, cotizadoAusente: 'sin previsión', pct: null, lectura: null }
  }
  const g = item === 'otros' ? null : o.gasto[item]
  const cot = o.presupuestoRubros?.[item] ?? null
  // SIN PRESUPUESTO APROBADO se dice el motivo de la obra; CON presupuesto y sin este rubro, que el
  // rubro no se cotizó aparte (Quattropani: sólo MO+CS; subcontratos van dentro de MA en la plantilla).
  const desglosado = Object.values(o.presupuestoRubros ?? {}).some((v) => v != null)
  const ausente = cot != null ? null : desglosado ? SIN_PRESUPUESTO_RUBRO : (o.motivoPresupuesto ?? SIN_PRESUPUESTO)
  return {
    gastado: g, gastadoAusente: item === 'otros' ? 'sin registrar' : null, estimado: o.rubrosEstimados.includes(item),
    cotizado: cot, cotizadoAusente: ausente,
    pct: cot != null && cot > 0 && g != null ? g / cot : null,
    lectura: item === 'otros' && cot != null ? { tipo: 'sinConsumo', monto: null } : lecturaDe(cot, g),
  }
}

/** Los totales de un cliente por rubro: Σ gastado y Σ cotizado de las obras que lo tienen. */
export function totalesPorRubro(obras: ObraAnalitica[]): (Celda & { item: Item })[] {
  return ITEMS.map(({ clave }) => {
    const celdas = obras.map((o) => celda(o, clave))
    const gastado = sumaNula(celdas.map((x) => x.gastado))
    const cotizado = sumaNula(celdas.map((x) => x.cotizado))
    // EL TOTAL DEL CLIENTE COMPARA SÓLO LO COMPARABLE: el gastado de un rubro suma únicamente las obras
    // que lo presupuestaron. Sumar el material de Quattropani (sin presupuesto de materiales) contra el
    // de otra obra que sí lo tiene daría un excedido que no existe.
    const conCot = celdas.filter((x) => x.cotizado != null)
    const gastadoComparable = conCot.length ? sumaNula(conCot.map((x) => x.gastado)) : null
    return {
      item: clave, gastado, gastadoAusente: clave === 'otros' ? 'sin registrar' : null, estimado: celdas.some((x) => x.estimado),
      cotizado, cotizadoAusente: cotizado == null ? (clave === 'horas' ? 'sin previsión' : SIN_PRESUPUESTO_RUBRO) : null,
      pct: cotizado != null && cotizado > 0 && gastadoComparable != null ? gastadoComparable / cotizado : null,
      lectura: clave === 'horas' ? null : clave === 'otros' && cotizado != null ? { tipo: 'sinConsumo', monto: null } : lecturaDe(cotizado, cotizado != null ? gastadoComparable : gastado),
    }
  })
}

// ─── Costo por hora ─────────────────────────────────────────────────────────────────────────────

export const UMBRAL_HORA_CARA = 0.2

export interface PuntoHora { obra: ObraAnalitica; porHora: number; contraEmpresa: number }

/**
 * $/HORA = mano de obra imputada ÷ horas valorizadas, SÓLO con las dos y SÓLO si la mano de obra es
 * toda con recibo. Es COSTO de la hora, no productividad. La empresa es el cociente de las sumas —no
 * el promedio de cocientes—, para que una obra de 10 h no pese como una de 3.000.
 *
 * UNA MANO DE OBRA ESTIMADA NO MIDE NADA (auditoría 17/09/2026, D2): la estimación ES horas × tarifa,
 * así que dividirla por las horas devuelve la tarifa. Esas obras salen en `noMedidas`, con su parte
 * estimada, y no entran ni a los puntos ni a la línea de la empresa.
 */
export function costoPorHora(obras: ObraAnalitica[]): { empresa: number | null; puntos: PuntoHora[]; noMedidas: ObraAnalitica[] } {
  const con = obras.filter((o) => (o.gasto.manoObra ?? 0) > 0 && (o.gasto.horasValorizadas ?? 0) > 0)
  const medidas = con.filter((o) => (o.gasto.manoObraEstimada ?? 0) <= 0)
  const mo = medidas.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
  const h = medidas.reduce((a, o) => a + (o.gasto.horasValorizadas ?? 0), 0)
  const empresa = h > 0 ? mo / h : null
  const puntos = medidas.map((o) => {
    const porHora = (o.gasto.manoObra ?? 0) / (o.gasto.horasValorizadas ?? 1)
    return { obra: o, porHora, contraEmpresa: empresa ? porHora / empresa - 1 : 0 }
  })
  return { empresa, puntos: puntos.sort((a, b) => b.porHora - a.porHora), noMedidas: con.filter((o) => !medidas.includes(o)) }
}

/** El $/hora de UNA obra para la tabla: `null` si falta una pata o si la mano de obra tiene parte estimada. */
export function porHoraMedido(o: ObraAnalitica): number | null {
  if (!o.gasto.manoObra || !o.gasto.horasValorizadas || (o.gasto.manoObraEstimada ?? 0) > 0) return null
  return o.gasto.manoObra / o.gasto.horasValorizadas
}

// ─── Gasto por obra ─────────────────────────────────────────────────────────────────────────────

export interface CifrasGastoPorObra {
  conAmbas: number
  gastanSinPresupuesto: number
  conPresupuestoSinMovimiento: number
  /** ≥ 80 % del presupuesto y sin pasarse. */
  cerca: number
  excedidas: number
}

export function cifrasGastoPorObra(obras: ObraAnalitica[]): CifrasGastoPorObra {
  const gasta = (o: ObraAnalitica) => (o.gasto.total ?? 0) > 0
  return {
    conAmbas: obras.filter((o) => o.presupuesto != null && (o.consumoComparable ?? 0) > 0).length,
    gastanSinPresupuesto: obras.filter((o) => o.presupuesto == null && gasta(o)).length,
    conPresupuestoSinMovimiento: obras.filter((o) => o.presupuesto != null && !((o.consumoComparable ?? 0) > 0)).length,
    cerca: obras.filter((o) => o.grupo === 'cerca').length,
    excedidas: obras.filter((o) => o.grupo === 'pasadas').length,
  }
}

export type Orden = 'gastado' | 'presupuesto' | 'pct' | 'horas' | 'ritmo'

/** Orden de la tabla: sólo por números, y lo que no tiene el número va al final (nunca como cero). */
export function ordenar(obras: ObraAnalitica[], orden: Orden, ritmos: ReadonlyMap<string, Ritmo> = new Map()): ObraAnalitica[] {
  const v = (o: ObraAnalitica): number | null => {
    if (orden === 'gastado') return o.gasto.total
    if (orden === 'presupuesto') return o.presupuesto
    if (orden === 'pct') return o.avanceGasto
    if (orden === 'horas') return o.gasto.horas
    return ritmos.get(o.id)?.porMes ?? null
  }
  return [...obras].sort((x, y) => {
    const a = v(x)
    const b = v(y)
    if (a == null && b == null) return x.nombre.localeCompare(y.nombre)
    if (a == null) return 1
    if (b == null) return -1
    return b - a
  })
}
