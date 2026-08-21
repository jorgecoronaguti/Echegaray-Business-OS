// LA COMPOSICIÓN DE UNA PARTIDA — una sola forma para dos orígenes.
//
// ═══ LA MISMA PANTALLA LEE DE DOS LADOS ═══
//
// Mientras el presupuesto está en BORRADOR, la composición se lee VIVA de la base maestra
// (`analisis_linea` × `recurso_costo`): es lo que uno quiere mientras cotiza, porque si el precio
// del cemento cambió hoy, la oferta que se está armando tiene que reflejarlo.
//
// Una vez CONGELADO, se lee de `cotizacion_partida_composicion`, la copia que se hizo el día que
// el presupuesto salió. La copia guarda el NOMBRE y el CÓDIGO del recurso, no su id, así que
// sobrevive a que el recurso se dé de baja.
//
// Las dos formas se normalizan acá, en el borde, para que la pantalla 16 no tenga dos ramas. Si
// cada origen llegara con su forma, cualquier corrección habría que hacerla dos veces y la segunda
// se olvidaría.
//
// ═══ UN CONTROL QUE NO SE VALIDA CONTRA LO QUE PRODUCE ═══
//
// El costo unitario que la pantalla publica NO es la suma de estas líneas: es el de
// `cotizacion_partida_valorizada` —congelado o de `analisis_costo`—, que es el mismo número que
// entra en la cascada. El desglose se suma aparte y se COMPARA contra él. Si no cierran, la
// pantalla lo dice: son dos caminos independientes hacia la misma cifra y que discrepen significa
// que una línea quedó sin precio o que la copia congelada salió incompleta.

import type { LineaComposicion, TipoRecurso } from '../types/index.ts'
import { aNumero } from './formato.ts'

/** Fila cruda de `cotizacion_partida_composicion`. */
export interface FilaCongelada {
  orden: number | null
  recurso_codigo: string | null
  recurso_nombre: string
  unidad: string | null
  tipo: string | null
  cantidad: number | string | null
  costo_unitario: number | string | null
  desperdicio: number | string | null
  fecha_precio: string | null
}

/** Fila cruda de `analisis_linea` con su recurso ya resuelto por `recurso_costo`. */
export interface FilaViva {
  orden: number | null
  cantidad: number | string | null
  recurso: {
    codigo: string | null
    nombre: string
    unidad: string | null
    tipo: string | null
    costo_con_desperdicio: number | string | null
    desperdicio: number | string | null
    fecha_precio: string | null
  } | null
}

const TIPOS: readonly string[] = ['mano_obra', 'carga_social', 'material', 'equipo', 'otro']
const tipoDe = (t: string | null): TipoRecurso | null => (t && TIPOS.includes(t) ? (t as TipoRecurso) : null)

export function desdeCongelada(filas: readonly FilaCongelada[]): LineaComposicion[] {
  return filas.map((f, i) => ({
    orden: f.orden ?? i,
    recurso_codigo: f.recurso_codigo,
    recurso_nombre: f.recurso_nombre,
    unidad: f.unidad,
    tipo: tipoDe(f.tipo),
    cantidad: aNumero(f.cantidad) ?? 0,
    costo_unitario: aNumero(f.costo_unitario),
    desperdicio: aNumero(f.desperdicio),
    fecha_precio: f.fecha_precio,
  }))
}

export function desdeViva(filas: readonly FilaViva[]): LineaComposicion[] {
  return filas.map((f, i) => ({
    orden: f.orden ?? i,
    recurso_codigo: f.recurso?.codigo ?? null,
    // Una línea cuyo recurso ya no resuelve NO se descarta: se muestra como lo que es. Perderla en
    // silencio bajaría el desglose y haría que el control contra el costo unitario acuse otra cosa.
    recurso_nombre: f.recurso?.nombre ?? 'recurso no encontrado',
    unidad: f.recurso?.unidad ?? null,
    tipo: tipoDe(f.recurso?.tipo ?? null),
    cantidad: aNumero(f.cantidad) ?? 0,
    costo_unitario: aNumero(f.recurso?.costo_con_desperdicio ?? null),
    desperdicio: aNumero(f.recurso?.desperdicio ?? null),
    fecha_precio: f.recurso?.fecha_precio ?? null,
  }))
}

export interface LineaConSubtotal extends LineaComposicion {
  /** `null` cuando el recurso no tiene precio cargado. No es cero: es un precio que falta. */
  subtotal: number | null
}

export interface Seccion {
  clave: 'mano_obra' | 'materiales' | 'equipos' | 'otros'
  rotulo: string
  primeraColumna: string
  lineas: LineaConSubtotal[]
  /** `null` si TODAS sus líneas están sin precio: un total de 0 diría que la sección no cuesta. */
  total: number | null
  /** Cuántas líneas de la sección no tienen precio cargado. Es deuda de carga, y se muestra. */
  sinPrecio: number
}

const subtotalDe = (l: LineaComposicion): number | null =>
  l.costo_unitario === null ? null : l.cantidad * l.costo_unitario

function seccion(
  clave: Seccion['clave'], rotulo: string, primeraColumna: string,
  lineas: readonly LineaComposicion[],
): Seccion {
  const conSub = lineas.map((l) => ({ ...l, subtotal: subtotalDe(l) }))
  const conPrecio = conSub.filter((l) => l.subtotal !== null)
  return {
    clave, rotulo, primeraColumna, lineas: conSub,
    total: conPrecio.length === 0 ? null : conPrecio.reduce((a, l) => a + l.subtotal!, 0),
    sinPrecio: conSub.length - conPrecio.length,
  }
}

export interface Desglose {
  secciones: Seccion[]
  /** La suma del desglose. `null` si no hay una sola línea con precio. */
  totalDesglose: number | null
  /** Incidencias 0–100 sobre el desglose. `null` cuando no hay base contra la que medir. */
  incidencia: { mano_obra: number | null; materiales: number | null; equipos: number | null }
}

/**
 * EL DESGLOSE EN TRES SECCIONES.
 *
 * Las cargas sociales viajan DENTRO de mano de obra, no aparte: son parte del costo de la hora y
 * separarlas en un cuarto bloque haría que «mano de obra» se leyera como más barata de lo que es.
 * La fila queda marcada para que la pantalla la pinte como calculada, que es lo que pide el
 * contrato visual.
 */
export function desglosar(lineas: readonly LineaComposicion[]): Desglose {
  const de = (...tipos: (TipoRecurso | null)[]) => lineas.filter((l) => tipos.includes(l.tipo))
  const secciones = [
    seccion('mano_obra', 'MANO DE OBRA', 'CATEGORÍA', de('mano_obra', 'carga_social')),
    seccion('materiales', 'MATERIALES', 'INSUMO', de('material')),
    seccion('equipos', 'EQUIPOS', 'EQUIPO', de('equipo')),
    seccion('otros', 'OTROS', 'CONCEPTO', de('otro', null)),
  ].filter((s) => s.lineas.length > 0)

  const conTotal = secciones.filter((s) => s.total !== null)
  const totalDesglose = conTotal.length === 0 ? null : conTotal.reduce((a, s) => a + s.total!, 0)
  const parte = (clave: Seccion['clave']) => {
    const s = secciones.find((x) => x.clave === clave)
    if (!s || s.total === null || totalDesglose === null || totalDesglose === 0) return null
    return (s.total / totalDesglose) * 100
  }
  return {
    secciones, totalDesglose,
    incidencia: { mano_obra: parte('mano_obra'), materiales: parte('materiales'), equipos: parte('equipos') },
  }
}

/**
 * ¿EL DESGLOSE CIERRA CONTRA EL COSTO UNITARIO QUE PUBLICA LA VISTA?
 *
 * Un peso de diferencia es redondeo; más que eso es una línea sin precio o una copia congelada
 * incompleta, y la pantalla lo dice en vez de mostrar dos números distintos sin comentario.
 */
export function desgloseCierra(
  totalDesglose: number | null, costoUnitario: number | null,
): { cierra: boolean; diferencia: number | null } {
  if (totalDesglose === null || costoUnitario === null) return { cierra: true, diferencia: null }
  const d = totalDesglose - costoUnitario
  return { cierra: Math.abs(d) <= 1, diferencia: d }
}
