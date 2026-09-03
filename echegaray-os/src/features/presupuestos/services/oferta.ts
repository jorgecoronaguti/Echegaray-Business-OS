// LA OFERTA — lo que ve el cliente, derivado de la MISMA versión y de ninguna otra.
//
// ═══ EL MODELO NO TIENE PRECIO POR PARTIDA, Y ESO NO SE DISIMULA ═══
//
// `cotizacion_partida_valorizada.subtotal` es COSTO. El precio existe una sola vez, al final de la
// cascada: `venta_sin_iva`. Poner el costo en la columna IMPORTE de un documento que va al cliente
// sería ofertar al costo — la regla de oro 6 rota en el peor lugar posible.
//
// La oferta se arma entonces REPARTIENDO el precio de la cascada entre los rubros, en proporción a
// lo que cada uno cuesta. No es una segunda cascada: el total es el de la vista, sin tocar. Lo único
// que se calcula acá es la distribución, y se declara en el pie del documento.
//
// ═══ EL REPARTO CIERRA EXACTO, POR CONSTRUCCIÓN ═══
//
// Redondear cada línea por separado deja una diferencia de unos pesos contra el total, y un
// documento comercial donde la suma de los renglones no da el total es un documento que el cliente
// devuelve. Se usa el método del resto mayor: se reparte el redondeo entre los rubros con la parte
// fraccionaria más grande, y la suma de las líneas ES el total. Determinístico y sin sorteo.
//
// ═══ LO QUE NO ENTRA ═══
//
// Cómputo, unidades, HH, costo unitario, análisis, margen y composición NO tienen lugar en este
// archivo: el cliente no los ve (REGLAS-DATOS §17), y la forma de garantizarlo es que la estructura
// que esta función devuelve no los contenga.

import type { CascadaMotor, PartidaDelMotor } from './cotizadorPuente.ts'
import { estaExcluida } from './vivo.ts'

/**
 * Cuántas descripciones entran en el detalle de una línea.
 *
 * Medido contra COT-2026-001, que no tiene rubros cargados: las 26 partidas caían en un solo renglón
 * y el detalle era un párrafo de veinte líneas. Un documento comercial no se lee así. Se muestran
 * las primeras y se declara cuántas quedaron — el detalle completo vive en la vista de costos.
 */
const TOPE_DETALLE = 6

export interface LineaOferta {
  /** El rubro, que es como el cliente lee un presupuesto de obra. */
  rubro: string
  /** Las descripciones comerciales de lo que hay adentro, hasta `TOPE_DETALLE`. Sin cantidades. */
  detalle: string
  /** El precio del rubro. `null` = todavía no tiene precio; jamás `0`. */
  importe: number | null
  /** Cuántas partidas del rubro no tienen importe: lo que le falta a esta línea. */
  sinPrecio: number
}

export interface Oferta {
  lineas: LineaOferta[]
  /** El total de la cascada, sin recalcular. `null` si no hay precio publicable. */
  total: number | null
  /** El coeficiente derivado con el que se repartió. Se declara en el pie. */
  coeficiente: number | null
  /** Cuántas partidas quedaron fuera del documento por no tener precio. */
  sinPrecio: number
}

const SIN_RUBRO = 'Trabajos varios'

/**
 * EL DOCUMENTO DE OFERTA de una versión. PURA.
 *
 * Las excluidas no aparecen: sacarlas del alcance es exactamente decidir que no se cotizan.
 */
export function ofertaDe(
  partidas: readonly PartidaDelMotor[], cascada: CascadaMotor | null,
): Oferta {
  const dentro = partidas.filter((p) => !estaExcluida(p))
  const grupos = agruparPorRubro(dentro)
  const total = precioPublicable(cascada)
  const costos = grupos.map((g) => g.costo)
  const importes = repartir(costos, total)

  return {
    lineas: grupos.map((g, i) => ({
      rubro: g.rubro,
      detalle: detalleDe(g.descripciones),
      importe: importes[i],
      sinPrecio: g.sinPrecio,
    })),
    total,
    coeficiente: cascada?.coeficienteSinIva ?? null,
    sinPrecio: dentro.filter((p) => p.subtotal === null).length,
  }
}

/** Las primeras descripciones y, si sobran, cuántas. Nunca se recorta sin decir que se recortó. */
function detalleDe(descripciones: readonly string[]): string {
  const visibles = descripciones.slice(0, TOPE_DETALLE).join(' · ')
  const resto = descripciones.length - TOPE_DETALLE
  return resto > 0 ? `${visibles} · y ${resto} trabajos más` : visibles
}

interface GrupoRubro {
  rubro: string
  /** El costo conocido del rubro. `null` si NINGUNA de sus partidas se pudo valorizar. */
  costo: number | null
  descripciones: string[]
  sinPrecio: number
}

/** El orden lo da la primera partida de cada rubro: el que el presupuesto ya tiene. */
function agruparPorRubro(partidas: readonly PartidaDelMotor[]): GrupoRubro[] {
  const mapa = new Map<string, GrupoRubro>()
  for (const p of partidas) {
    const rubro = (p.rubro ?? '').trim() || SIN_RUBRO
    const g = mapa.get(rubro) ?? { rubro, costo: null, descripciones: [], sinPrecio: 0 }
    if (p.subtotal !== null) g.costo = (g.costo ?? 0) + p.subtotal
    else g.sinPrecio += 1
    if (p.descripcion) g.descripciones.push(p.descripcion)
    mapa.set(rubro, g)
  }
  return [...mapa.values()]
}

/** El `coalesce` de la vista devuelve 0 sin partidas, y un cero no es un precio. */
function precioPublicable(cascada: CascadaMotor | null): number | null {
  const v = cascada?.ventaSinIva
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return null
  return Math.round(v)
}

/**
 * EL REPARTO POR RESTO MAYOR. PURA.
 *
 * Devuelve un importe entero por cada costo no nulo, tal que la suma sea EXACTAMENTE `total`. Los
 * costos nulos devuelven `null` — no participan del reparto y no se convierten en cero.
 */
export function repartir(costos: readonly (number | null)[], total: number | null): (number | null)[] {
  const indices = costos.map((c, i) => [c, i] as const).filter(([c]) => c !== null && c > 0)
  const suma = indices.reduce((a, [c]) => a + (c as number), 0)
  if (total === null || indices.length === 0 || suma <= 0) return costos.map(() => null)

  const exactos = indices.map(([c]) => ((c as number) / suma) * total)
  const pisos = exactos.map((x) => Math.floor(x))
  let sobra = total - pisos.reduce((a, b) => a + b, 0)
  // El orden del desempate es el de la fila: mismo presupuesto, mismo documento, siempre.
  const orden = exactos
    .map((x, k) => [x - Math.floor(x), k] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])

  const out: (number | null)[] = costos.map(() => null)
  for (const [, k] of orden) {
    if (sobra <= 0) break
    pisos[k] += 1
    sobra -= 1
  }
  indices.forEach(([, i], k) => { out[i] = pisos[k] })
  return out
}
