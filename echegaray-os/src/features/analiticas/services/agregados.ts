// LO QUE SE SUMA ENTRE OBRAS — y lo que NUNCA entra a una suma.
//
// Los cajones «sin obra asignada» se suman a lo que salió para obras, pero no entran a ningún ratio POR
// OBRA: repartirlos sería decidir a qué obra fue una compra que Compras no supo decir. Un ratio sin sus
// dos patas no se publica: `queda` sólo existe con presupuesto Y consumo del MISMO rubro, `$/hora` sólo
// con mano de obra imputada Y horas. El contrato viaja como referencia, nunca como presupuesto.
import { rotuloEstimada, type ObraAnalitica } from './obras.ts'
import { jerarquiaDeObras } from '../../clientes/services/obrasAdicionales.ts'
import { SIN_PRESUPUESTO, SIN_PRESUPUESTO_RUBRO, type Rubro } from './presupuesto.ts'

const sumaNula = (xs: (number | null)[]): number | null =>
  xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0)

// ─── Resumen ────────────────────────────────────────────────────────────────────────────────────

export interface CifrasResumen {
  /** Σ de lo comparable (MO+CS y MA) de las obras con presupuesto: contra esto se mide. */
  presupuestado: number | null
  /** Σ de lo consumido en ESOS rubros. */
  consumido: number | null
  /** presupuestado − consumido. `null` sin las dos patas. */
  queda: number | null
  /** Lo gastado en obras que no tiene presupuesto con qué compararse (obra o rubro sin presupuesto). */
  consumoSinPresupuesto: number | null
  /** Σ del costo cotizado total de las cotizaciones aprobadas (todos los rubros): referencia. */
  costoCotizado: number | null
  contrato: number | null
  sinObraAsignada: number | null
  obrasSinPresupuesto: number
}

export function cifrasResumen(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): CifrasResumen {
  const conPres = obras.filter((o) => o.presupuesto != null)
  const presupuestado = sumaNula(conPres.map((o) => o.presupuesto))
  const consumido = sumaNula(conPres.map((o) => o.consumoComparable))
  const total = sumaNula(obras.map((o) => o.gasto.total))
  return {
    presupuestado, consumido,
    queda: presupuestado != null ? presupuestado - (consumido ?? 0) : null,
    consumoSinPresupuesto: total != null ? total - (consumido ?? 0) : null,
    costoCotizado: sumaNula(obras.map((o) => o.costoCotizado)),
    contrato: sumaNula(obras.map((o) => o.precio)),
    sinObraAsignada: sumaNula([...sinObra.values()]),
    obrasSinPresupuesto: obras.length - conPres.length,
  }
}

export interface ControlDeObra {
  obra: ObraAnalitica
  presupuesto: number | null
  /** Consumo de los rubros presupuestados. */
  consumido: number | null
  /** Consumo que no tiene presupuesto con qué compararse (rubro sin presupuesto u obra sin presupuesto). */
  sinPresupuesto: number
  pct: number | null
  queda: number | null
}

/**
 * EL GRÁFICO DEL RESUMEN: cada obra, su presupuesto contra lo consumido en los mismos rubros, y aparte
 * lo que consumió sin presupuesto. Ordenadas por % consumido; las que no se pueden medir, al final.
 */
export function controlPorObra(obras: ObraAnalitica[]): ControlDeObra[] {
  return obras.map((o): ControlDeObra => ({
    obra: o, presupuesto: o.presupuesto, consumido: o.presupuesto != null ? o.consumoComparable : null,
    sinPresupuesto: Math.max(0, (o.gasto.total ?? 0) - (o.presupuesto != null ? (o.consumoComparable ?? 0) : 0)),
    pct: o.avanceGasto,
    queda: o.presupuesto != null ? o.presupuesto - (o.consumoComparable ?? 0) : null,
  })).sort((a, b) => {
    if (a.pct == null && b.pct == null) return (b.obra.gasto.total ?? 0) - (a.obra.gasto.total ?? 0)
    if (a.pct == null) return 1
    if (b.pct == null) return -1
    return b.pct - a.pct
  })
}

export interface FilaControl extends ControlDeObra {
  /** `0` = obra mayor · `1` = adicional debajo de su obra (la misma jerarquía que Clientes). */
  nivel: 0 | 1
  esAdicional: boolean
}

export interface GrupoDeCliente {
  clienteId: string
  nombre: string
  /** Obras activas del cliente en toda la cartera: la primera clave del orden de Clientes. */
  nActivas: number
  presupuestado: number | null
  /** Consumido en los rubros presupuestados de sus obras. */
  consumido: number | null
  queda: number | null
  pct: number | null
  manoObra: number | null
  materiales: number | null
  subcontratos: number | null
  /** Todo lo consumido por sus obras (la suma de las tres columnas). */
  consumoTotal: number | null
  /** Obras que gastaron más que su presupuesto: se marcan, no reordenan. */
  excedidas: number
  obras: FilaControl[]
}

const porNombre = (a: string, b: string) => a.localeCompare(b, 'es')

/**
 * EL RESUMEN EN EL ORDEN DE CLIENTES (dueño, 17/09/2026: «más similar a Administración → Clientes»):
 * el dueño tiene que encontrar cada cliente y cada obra en el MISMO lugar que en Clientes. Clientes
 * ordena por cantidad de obras activas (de más a menos) y nombre (`clientesService`); sus obras por
 * `orden` y nombre, con el adicional debajo de su obra (`jerarquiaDeObras`). El excedido se marca en
 * rojo, no cambia el orden.
 *
 * `cartera` = todas las obras (sin filtro): de ahí sale cuántas activas tiene cada cliente, como en
 * Clientes, aunque el filtro muestre menos.
 */
export function agruparPorCliente(obras: ObraAnalitica[], cartera: ObraAnalitica[] = obras): GrupoDeCliente[] {
  const activas = new Map<string, number>()
  for (const o of cartera) if (o.estado !== 'terminada') activas.set(o.clienteId, (activas.get(o.clienteId) ?? 0) + 1)
  const m = new Map<string, ObraAnalitica[]>()
  for (const o of obras) m.set(o.clienteId, [...(m.get(o.clienteId) ?? []), o])
  const grupos = [...m.values()].map((lista): GrupoDeCliente => {
    const ordenadas = [...lista].sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity) || porNombre(a.nombre, b.nombre))
    const control = new Map(controlPorObra(lista).map((f) => [f.obra.id, f]))
    const filas = jerarquiaDeObras(ordenadas.map((o) => ({ ...o, obra_id: o.id, obra_padre_id: o.padreId })))
      .map((f): FilaControl => ({ ...(control.get(f.obra.obra_id) as ControlDeObra), nivel: f.nivel, esAdicional: f.esAdicional }))
    const conPres = filas.filter((f) => f.presupuesto != null)
    const presupuestado = sumaNula(conPres.map((f) => f.presupuesto))
    const consumido = sumaNula(conPres.map((f) => f.consumido))
    return {
      clienteId: lista[0].clienteId, nombre: lista[0].clienteNombre, nActivas: activas.get(lista[0].clienteId) ?? 0,
      presupuestado, consumido,
      queda: presupuestado != null ? presupuestado - (consumido ?? 0) : null,
      pct: presupuestado ? (consumido ?? 0) / presupuestado : null,
      manoObra: sumaNula(lista.map((o) => o.gasto.manoObra)),
      materiales: sumaNula(lista.map((o) => o.gasto.materiales)),
      subcontratos: sumaNula(lista.map((o) => o.gasto.subcontratos)),
      consumoTotal: sumaNula(lista.map((o) => o.gasto.total)),
      excedidas: filas.filter((f) => f.pct != null && f.pct > 1).length,
      obras: filas,
    }
  })
  return grupos.sort((a, b) => b.nActivas - a.nActivas || porNombre(a.nombre, b.nombre))
}

/** La mano de obra de varias obras sumada, con su parte estimada: para rotular un total. */
export function manoObraDe(obras: ObraAnalitica[]): { manoObra: number | null; manoObraEstimada: number | null } {
  const con = obras.filter((o) => o.gasto.manoObra != null)
  if (!con.length) return { manoObra: null, manoObraEstimada: null }
  const est = con.reduce((x, o) => x + (o.gasto.manoObraEstimada ?? 0), 0)
  return { manoObra: con.reduce((x, o) => x + (o.gasto.manoObra ?? 0), 0), manoObraEstimada: est > 0 ? est : null }
}

// ─── Obras: rubro contra rubro ──────────────────────────────────────────────────────────────────

export type Item = Rubro | 'horas'
export const ITEMS: { clave: Item; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'otros', rotulo: 'Otros' },
  { clave: 'horas', rotulo: 'Horas hombre' },
]

/** ¿La obra cotizó MA (materiales, equipos, fletes Y subcontratos: la plantilla no los separa)? */
export const conMA = (o: ObraAnalitica): boolean => (o.presupuestoRubros?.materiales ?? null) != null

export const INCLUIDO_EN_MATERIALES = 'incluido en materiales de la cotización'

/**
 * EL QUEDA DE MATERIALES Y SUBCONTRATOS, UNA SOLA VEZ (dueño, 17/09/2026: subcontratos se ve aparte).
 * Los rubros se muestran separados, pero el presupuesto no separa subcontratos: MA los incluye. Medir
 * materiales solos contra MA daría un excedido falso, y repartir MA sería inventar. Por eso lo que queda
 * se calcula MA − (materiales + subcontratos) y se dice debajo de los dos. `null` sin MA.
 */
export function quedaMaterialesYSubcontratos(o: ObraAnalitica): { cotizado: number; consumido: number | null; pct: number | null; lectura: Celda['lectura'] } | null {
  const ma = o.presupuestoRubros?.materiales ?? null
  if (ma == null) return null
  const consumido = sumaNula([o.gasto.materiales, o.gasto.subcontratos])
  return { cotizado: ma, consumido, pct: ma > 0 && consumido != null ? consumido / ma : null, lectura: lecturaDe(ma, consumido) }
}

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
  /** «62 % estimada»: la parte estimada de la mano de obra consumida. */
  consumoEstimado: string | null
}

/** Una celda armada con sus dos patas: lo que queda, lo excedido o por qué no se puede decir. */
export function lecturaDe(cotizado: number | null, gastado: number | null): Celda['lectura'] {
  if (cotizado == null || cotizado <= 0) return gastado != null && gastado > 0 ? { tipo: 'sinPresupuesto', monto: null } : null
  if (gastado == null || gastado <= 0) return { tipo: 'sinMovimiento', monto: null }
  return gastado > cotizado ? { tipo: 'excedido', monto: gastado - cotizado } : { tipo: 'queda', monto: cotizado - gastado }
}

export function celda(o: ObraAnalitica, item: Item): Celda {
  if (item === 'horas') {
    const hh = o.hhPresupuestadas
    return {
      gastado: o.gasto.horas, gastadoAusente: null, estimado: false, cotizado: hh, cotizadoAusente: hh == null ? 'sin previsión' : null,
      pct: hh != null && o.gasto.horas != null ? o.gasto.horas / hh : null, lectura: hh == null ? null : lecturaDe(hh, o.gasto.horas), consumoEstimado: null,
    }
  }
  const g = item === 'otros' ? null : o.gasto[item]
  const cot = o.presupuestoRubros?.[item] ?? null
  // CON MA, materiales y subcontratos no se leen por separado: su queda es uno solo (arriba).
  if ((item === 'materiales' || item === 'subcontratos') && conMA(o)) {
    return {
      gastado: g, gastadoAusente: null, estimado: o.rubrosEstimados.includes('materiales'),
      cotizado: item === 'materiales' ? cot : null, cotizadoAusente: item === 'subcontratos' ? INCLUIDO_EN_MATERIALES : null,
      pct: null, lectura: null, consumoEstimado: null,
    }
  }
  // SIN PRESUPUESTO APROBADO se dice el motivo de la obra; CON presupuesto y sin este rubro, que el
  // rubro no se cotizó aparte (Quattropani: sólo MO+CS; subcontratos van dentro de MA en la plantilla).
  const desglosado = Object.values(o.presupuestoRubros ?? {}).some((v) => v != null)
  const ausente = cot != null ? null : desglosado ? SIN_PRESUPUESTO_RUBRO : (o.motivoPresupuesto ?? SIN_PRESUPUESTO)
  return {
    gastado: g, gastadoAusente: item === 'otros' ? 'sin registrar' : null, estimado: o.rubrosEstimados.includes(item),
    cotizado: cot, cotizadoAusente: ausente,
    pct: cot != null && cot > 0 && g != null ? g / cot : null,
    lectura: item === 'otros' && cot != null ? { tipo: 'sinConsumo', monto: null } : lecturaDe(cot, g),
    consumoEstimado: item === 'manoObra' ? rotuloEstimada(o.gasto) : null,
  }
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
