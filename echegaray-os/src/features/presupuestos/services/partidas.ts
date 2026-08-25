// LAS FILAS DE LA TABLA DE PARTIDAS — el rubro como agrupación, no como tabla.
//
// ═══ POR QUÉ EL RUBRO NO ES UNA TABLA ═══
//
// `cotizacion_partida.rubro` es un texto de la partida. Podría haber sido una tabla `rubro` con su
// id, y el argumento a favor es real (un rubro escrito «Fundaciones» y otro «FUNDACIONES» son dos).
// El modelo eligió el texto, y este módulo NO lo corrige por su cuenta: agrupa por el rubro tal
// como está escrito, con el mismo criterio que usaría un `group by` de Postgres, y normaliza sólo
// los espacios de los bordes. Inventar acá una normalización agresiva —minúsculas, sin acentos—
// haría que la pantalla mostrara una agrupación que ninguna consulta del orquestador reproduce.
//
// ═══ EL SUBTOTAL DEL RUBRO SE SUMA ACÁ; EL TOTAL, NO ═══
//
// El subtotal por rubro no existe en ninguna vista, así que se suma sobre las filas que la vista
// ya devolvió: es agrupación de presentación, no una segunda definición del costo. El TOTAL de la
// tabla NO se suma acá — sale de `cotizacion_cascada.costo_directo`. Si se sumara también, habría
// dos caminos hacia el mismo número y el día que difieran nadie sabría cuál mirar.

import type { PartidaValorizada } from '../types/index.ts'
// Ruta relativa y con extensión: `node --test` no resuelve el alias `@/`, y estos módulos puros
// se prueban con el runner directo. Es la misma forma que usan `filtroObras` y `presencia`.
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import { aNumero } from './formato.ts'
import { incidencia } from './cascada.ts'

export const SIN_RUBRO = 'Sin rubro'

export function rubroDe(p: Pick<PartidaValorizada, 'rubro'>): string {
  const r = (p.rubro ?? '').trim()
  return r === '' ? SIN_RUBRO : r
}

export interface FilaRubro {
  tipo: 'rubro'
  clave: string
  /** El ordinal que se muestra en la columna CÓDIGO: 1, 2, 3… No es un código de la base. */
  codigo: string
  nombre: string
  /** `null` si NINGUNA de sus partidas tiene subtotal: un 0 diría que el rubro no cuesta nada. */
  subtotal: number | null
  hh: number | null
  nPartidas: number
  nSinAnalisis: number
}

export interface FilaPartida {
  tipo: 'partida'
  clave: string
  /**
   * La clave de SU fila de rubro. La necesita la tabla para poder plegar el grupo: sin ella, saber
   * a qué rubro pertenece una fila obliga a arrastrar una variable mutable por dentro del render
   * —que es exactamente lo que el compilador de React prohíbe—.
   */
  rubroClave: string
  partida: PartidaValorizada
  /** 0–100 sobre el costo directo del presupuesto. `null` si no hay base. */
  incidenciaPct: number | null
}

export type FilaTabla = FilaRubro | FilaPartida

/**
 * Las filas de la tabla, con los rubros intercalados.
 *
 * El orden de los rubros lo da la PRIMERA partida de cada uno: así el administrador que reordena
 * partidas ve los rubros moverse con ellas, en vez de un alfabético que le pelea el orden.
 */
export function filasDeLaTabla(
  partidas: readonly PartidaValorizada[],
  costoDirecto: number | null,
): FilaTabla[] {
  const ordenadas = [...partidas].sort((a, b) => a.orden - b.orden)
  const grupos = new Map<string, PartidaValorizada[]>()
  for (const p of ordenadas) {
    const r = rubroDe(p)
    const g = grupos.get(r)
    if (g) g.push(p)
    else grupos.set(r, [p])
  }

  const filas: FilaTabla[] = []
  let i = 0
  for (const [nombre, lista] of grupos) {
    i += 1
    const rubroClave = `rubro:${nombre}`
    const conSubtotal = lista.map((p) => aNumero(p.subtotal)).filter((v): v is number => v !== null)
    const conHH = lista.map((p) => aNumero(p.hh)).filter((v): v is number => v !== null)
    filas.push({
      tipo: 'rubro', clave: rubroClave, codigo: String(i), nombre,
      subtotal: conSubtotal.length === 0 ? null : conSubtotal.reduce((a, b) => a + b, 0),
      hh: conHH.length === 0 ? null : conHH.reduce((a, b) => a + b, 0),
      nPartidas: lista.length,
      nSinAnalisis: lista.filter((p) => p.sin_analisis).length,
    })
    for (const p of lista) {
      filas.push({
        tipo: 'partida', clave: p.partida_id, rubroClave, partida: p,
        incidenciaPct: incidencia(aNumero(p.subtotal), costoDirecto),
      })
    }
  }
  return filas
}

/** El buscador de la pantalla 15: código, descripción o rubro. Filtra al teclear, sin botón. */
export function filtrarPartidas(
  partidas: readonly PartidaValorizada[], busqueda: string,
): PartidaValorizada[] {
  return partidas.filter((p) => contieneEnAlguno([p.codigo, p.descripcion, rubroDe(p)], busqueda))
}

/**
 * LO QUE LA PARTIDA NO TIENE, dicho por su nombre. Se muestra como badge en la descripción.
 *
 * `sin_analisis` lo calcula la vista y excluye a las subcontratadas a propósito: un paquete
 * subcontratado no necesita análisis de costo, tiene un precio. `sin cómputo` es otra ausencia y
 * se dice aparte: son dos huecos distintos y arreglarlos cuesta cosas distintas.
 */
export function faltantesDe(p: PartidaValorizada): string[] {
  const f: string[] = []
  if (p.sin_analisis) f.push('sin análisis')
  if (aNumero(p.cantidad) === null) f.push('sin cómputo')
  // Una partida marcada como subcontratada sin precio de subcontrato no vale 0: falta el precio.
  if (p.subcontratada && aNumero(p.precio_subcontrato) === null) f.push('sin precio de subcontrato')
  return f
}

/**
 * LA DEUDA DE CARGA, CONTADA — lo que antes eran dos bloques de aviso permanentes arriba de la
 * tabla (Design 23/08: «normal silencioso · problema visible · detalle bajo demanda»).
 *
 * Un contador arriba de la tabla informa; un contador que además FILTRA la tabla resuelve. Por eso
 * `filtrarPorFalta` existe: el número y la lista de trabajo son el mismo control.
 */
export function contarFaltantes(partidas: readonly PartidaValorizada[]): {
  sinAnalisis: number
  sinComputo: number
} {
  return {
    sinAnalisis: partidas.filter((p) => p.sin_analisis).length,
    sinComputo: partidas.filter((p) => aNumero(p.cantidad) === null).length,
  }
}

export type FaltaPartida = 'sin_analisis' | 'sin_computo'

/**
 * CANTIDAD 0 NO ES «SIN CÓMPUTO». Cero es un número que alguien escribió —una partida anulada, un
 * ítem que quedó en cero tras recotizar— y esconderlo detrás de «falta cargar» manda a buscar un
 * dato que ya está. Lo que falta es `null`, y sólo `null`.
 */
export function filtrarPorFalta(
  partidas: readonly PartidaValorizada[], falta: FaltaPartida | null,
): PartidaValorizada[] {
  if (falta === null) return [...partidas]
  return partidas.filter((p) => (falta === 'sin_analisis' ? p.sin_analisis : aNumero(p.cantidad) === null))
}

/**
 * LAS SUBCONTRATADAS QUE NO ENTRAN EN EL PRECIO — un hueco del modelo, medido.
 *
 * `cotizacion_partida_valorizada` valoriza con `coalesce(p.costo_unitario, ac.costo_directo)`: una
 * partida subcontratada no tiene análisis, así que su `subtotal` queda en NULL y NO suma al costo
 * directo — aunque tenga `precio_subcontrato` cargado. Y `sin_analisis` la excluye a propósito, así
 * que tampoco la denuncia la columna de deuda de carga.
 *
 * Medido el 21/08/2026 contra la base: una partida con `precio_subcontrato = 5.000.000` deja
 * `costo_directo = 0`, `precio_venta = 0` y `n_sin_analisis = 0`. El presupuesto se ve completo y
 * le falta un paquete entero.
 *
 * La pantalla no lo arregla —arreglarlo es cambiar la vista, y eso es una migración— pero lo dice.
 */
export function subcontratadasFueraDelPrecio(partidas: readonly PartidaValorizada[]): {
  n: number
  precioNoContado: number | null
} {
  const fuera = partidas.filter((p) => p.subcontratada && aNumero(p.subtotal) === null)
  const conPrecio = fuera.map((p) => aNumero(p.precio_subcontrato)).filter((v): v is number => v !== null)
  return {
    n: fuera.length,
    precioNoContado: conPrecio.length === 0 ? null : conPrecio.reduce((a, b) => a + b, 0),
  }
}
