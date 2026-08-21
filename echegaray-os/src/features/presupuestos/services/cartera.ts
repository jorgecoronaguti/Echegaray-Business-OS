// LA CARTERA DE PRESUPUESTOS — el filtro y los cuatro KPIs de la pantalla 14.
//
// ═══ LO QUE MIDEN LOS KPI, Y POR QUÉ ASÍ ═══
//
// COTIZADO ABIERTO   lo que está en la calle esperando respuesta (borrador + enviada). Es la
//                    pregunta «¿cuánto trabajo tengo pendiente de decisión del cliente?».
// ADJUDICADO         lo que ya se ganó.
// CONVERSIÓN         adjudicados ÷ los que TUVIERON RESPUESTA (adjudicados + cerrados). Los
//                    abiertos no entran: todavía no perdieron. Meterlos en el denominador hace que
//                    la conversión BAJE cada vez que se manda un presupuesto nuevo, que es
//                    exactamente el incentivo contrario al que la empresa necesita. Sin ninguno
//                    con respuesta el resultado es `null` —«sin dato»—, nunca 0 %.
// MARGEN PROMEDIO    PONDERADO POR PRECIO DE VENTA, no promedio simple. Un presupuesto de $ 8 M al
//                    13 % y uno de $ 186 M al 18,4 % no aportan lo mismo al resultado de la
//                    empresa; el promedio simple los cuenta igual y publica un margen que ninguna
//                    obra tiene. Se mide sobre los ADJUDICADOS: el margen de una oferta que no se
//                    ganó no es plata de nadie.
//
// ═══ LA CARTERA MUESTRA VERSIONES VIGENTES ═══
//
// `cotizaciones` tiene un índice único de una sola fila vigente por número. Las versiones
// anteriores existen y se abren desde adentro del presupuesto; en la lista mostrarlas sumaría
// cuatro veces la misma obra en el KPI de cotizado.

import type { PresupuestoCascada } from '../types/index.ts'
// Ruta relativa y con extensión: `node --test` no resuelve el alias `@/`, y estos módulos puros
// se prueban con el runner directo. Es la misma forma que usan `filtroObras` y `presencia`.
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import { aNumero } from './formato.ts'
import { lecturaEstado } from './estado.ts'

export type FiltroCartera = 'todos' | 'abiertos' | 'adjudicados' | 'cerrados' | 'sin_margen'

export const FILTROS: { clave: FiltroCartera; label: string }[] = [
  { clave: 'todos', label: 'Todos' },
  { clave: 'abiertos', label: 'Abiertos' },
  { clave: 'adjudicados', label: 'Adjudicados' },
  { clave: 'cerrados', label: 'Cerrados' },
  { clave: 'sin_margen', label: 'Sin margen' },
]

export function esFiltro(v: string | null | undefined): FiltroCartera {
  return FILTROS.some((f) => f.clave === v) ? (v as FiltroCartera) : 'todos'
}

export function filtrarCartera(
  lista: readonly PresupuestoCascada[],
  filtro: FiltroCartera,
  busqueda: string,
): PresupuestoCascada[] {
  const q = busqueda
  return lista.filter((p) => {
    // La normalización es la del OS (`shared/utils/busqueda`): sin tildes y sin mayúsculas. Con un
    // `includes` propio, «albañilería» no se encontraba escribiendo «albanileria» acá y sí en la
    // lista de al lado — el mismo tipeo tiene que dar el mismo resultado en todas.
    if (!contieneEnAlguno([p.numero, p.obra_nombre, p.cliente], q)) return false
    const grupo = lecturaEstado(p.estado).grupo
    switch (filtro) {
      case 'abiertos': return grupo === 'abierto'
      case 'adjudicados': return grupo === 'adjudicado'
      case 'cerrados': return grupo === 'cerrado'
      // «Sin margen» es la deuda de carga de la cartera: el margen es NULL cuando el presupuesto
      // no tiene costo directo contra el cual medirlo. No es «margen cero».
      case 'sin_margen': return aNumero(p.margen_sobre_precio_pct) === null
      default: return true
    }
  })
}

export interface KpisCartera {
  cotizadoAbierto: number | null
  nAbiertos: number
  adjudicado: number | null
  nAdjudicados: number
  /** 0–100. `null` cuando ningún presupuesto tuvo respuesta todavía: sin dato, no 0 %. */
  conversionPct: number | null
  nConRespuesta: number
  /** 0–100, ponderado por precio de venta sobre los adjudicados. `null` si ninguno lo tiene. */
  margenPonderadoPct: number | null
  nConMargen: number
}

/**
 * Los cuatro KPI. Un presupuesto SIN partidas no aporta: su precio de venta es el `coalesce` de la
 * vista, no una oferta. Sumarlo agrandaría el conteo sin agrandar la plata.
 */
export function kpisDeCartera(lista: readonly PresupuestoCascada[]): KpisCartera {
  const conCifras = lista.filter((p) => p.n_partidas > 0)
  const porGrupo = (g: 'abierto' | 'adjudicado' | 'cerrado') =>
    conCifras.filter((p) => lecturaEstado(p.estado).grupo === g)

  const abiertos = porGrupo('abierto')
  const adjudicados = porGrupo('adjudicado')
  const cerrados = porGrupo('cerrado')

  const suma = (l: readonly PresupuestoCascada[]) =>
    l.reduce<number | null>((acc, p) => {
      const v = aNumero(p.precio_venta)
      return v === null ? acc : (acc ?? 0) + v
    }, null)

  const conRespuesta = adjudicados.length + cerrados.length
  const conMargen = adjudicados.filter(
    (p) => aNumero(p.margen_sobre_precio_pct) !== null && (aNumero(p.precio_venta) ?? 0) > 0,
  )
  const pesoTotal = conMargen.reduce((a, p) => a + (aNumero(p.precio_venta) ?? 0), 0)

  return {
    cotizadoAbierto: suma(abiertos),
    nAbiertos: abiertos.length,
    adjudicado: suma(adjudicados),
    nAdjudicados: adjudicados.length,
    conversionPct: conRespuesta === 0 ? null : (adjudicados.length / conRespuesta) * 100,
    nConRespuesta: conRespuesta,
    margenPonderadoPct: pesoTotal === 0 ? null
      : conMargen.reduce((a, p) => a + (aNumero(p.margen_sobre_precio_pct) ?? 0) * (aNumero(p.precio_venta) ?? 0), 0) / pesoTotal,
    nConMargen: conMargen.length,
  }
}

/**
 * EL ORDEN DE LA CARTERA: lo más nuevo primero, y el que no tiene fecha al final —no al principio,
 * que es donde lo pondría una comparación con `null` tratado como cero.
 */
export function ordenarCartera(lista: readonly PresupuestoCascada[]): PresupuestoCascada[] {
  return [...lista].sort((a, b) => {
    const fa = a.fecha_cotizacion ?? ''
    const fb = b.fecha_cotizacion ?? ''
    if (fa !== fb) return fa === '' ? 1 : fb === '' ? -1 : fb.localeCompare(fa)
    return (b.numero ?? '').localeCompare(a.numero ?? '')
  })
}
