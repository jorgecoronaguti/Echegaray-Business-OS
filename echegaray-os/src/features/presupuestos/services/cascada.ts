// LA CASCADA DE PRECIO, LEÍDA — NO CALCULADA DE NUEVO.
//
// ═══ ACÁ NO SE SUMA UN SOLO PESO ═══
//
// Costo directo → indirectos → gastos generales → margen → financiero → impuestos → precio de
// venta ya vienen resueltos por la vista `cotizacion_cascada`. Este módulo sólo los ORDENA para
// dibujarlos y decide cuándo un número no se puede publicar.
//
// La razón está escrita en la migración: en el Excel esta cascada vivía DOS VECES —`Presupuesto!H89`
// daba 2,0352 y `GG!D85` daba 1,7977, 13 % de diferencia— y encima el coeficiente que multiplicaba
// era uno tipeado a mano al lado del calculado. Reescribir la aritmética en TypeScript sería
// exactamente eso otra vez, con la ventaja de que ahora las dos versiones estarían en lenguajes
// distintos y nadie las compararía nunca.
//
// ═══ EL CERO DE UNA CASCADA VACÍA ES FABRICADO ═══
//
// La vista hace `coalesce(sum(v.subtotal), 0)`: un presupuesto SIN partidas devuelve costo directo
// 0 y, arrastrado por la cascada, precio de venta 0. Ese cero no lo cargó nadie — lo produjo un
// `coalesce` para poder agrupar. Publicarlo diría que la empresa ofertó gratis. Cuando
// `n_partidas` es 0, todos los importes se devuelven `null` y la pantalla escribe «sin cargar».
//
// El caso opuesto NO se toca: un presupuesto con partidas cuyo costo da 0 de verdad se publica 0,
// porque ahí el cero es un hecho de la base maestra (recursos sin precio) y esconderlo taparía la
// deuda de carga que `n_sin_analisis` está gritando al lado.

import type { PresupuestoCascada } from '../types/index.ts'
import { aNumero } from './formato.ts'

/** Un escalón de la cascada. `monto` null = no se puede publicar todavía. */
export interface Escalon {
  clave: 'costo_directo' | 'indirectos' | 'gastos_generales' | 'margen' | 'financiero' | 'impuestos' | 'precio_venta'
  rotulo: string
  /** El porcentaje del escalón, en FRACCIÓN. `null` en costo directo y precio, que no llevan. */
  pct: number | null
  monto: number | null
  subtitulo: string
  /** El precio de venta cierra la cascada: se dibuja más grande y con `=` delante. */
  final?: boolean
}

/** ¿La cascada tiene algo que publicar, o sus ceros los puso un `coalesce`? */
export function tieneCifras(c: Pick<PresupuestoCascada, 'n_partidas'>): boolean {
  return (c.n_partidas ?? 0) > 0
}

/**
 * Los siete escalones, en orden, tal como los define la vista.
 *
 * El financiero se dibuja SÓLO si tiene porcentaje: el contrato visual muestra cinco bloques y no
 * seis, y un escalón de «0 %» ocupando el mismo lugar que el margen sugiere que se decidió no
 * cobrarlo. Cuando el presupuesto lo carga, aparece.
 */
export function escalonesDe(c: PresupuestoCascada): Escalon[] {
  const hay = tieneCifras(c)
  const v = (x: number | null) => (hay ? aNumero(x) : null)
  const escalones: Escalon[] = [
    {
      clave: 'costo_directo', rotulo: 'COSTO DIRECTO', pct: null, monto: v(c.costo_directo),
      subtitulo: subtituloDirecto(c),
    },
    {
      clave: 'indirectos', rotulo: 'INDIRECTOS', pct: aNumero(c.pct_indirectos), monto: v(c.indirectos),
      subtitulo: 'obrador, vigilancia, seguros',
    },
    {
      clave: 'gastos_generales', rotulo: 'GASTOS GENERALES', pct: aNumero(c.pct_gastos_generales),
      monto: v(c.gastos_generales), subtitulo: 'estructura de empresa',
    },
    {
      clave: 'margen', rotulo: 'MARGEN', pct: aNumero(c.pct_margen), monto: v(c.margen),
      subtitulo: 'objetivo de la empresa',
    },
    {
      clave: 'financiero', rotulo: 'FINANCIERO', pct: aNumero(c.pct_financiero), monto: v(c.financiero),
      subtitulo: 'costo de fondear la obra',
    },
    {
      clave: 'impuestos', rotulo: 'IMPUESTOS', pct: aNumero(c.pct_impuestos), monto: v(c.impuestos),
      subtitulo: 'IIBB y sellos',
    },
    {
      clave: 'precio_venta', rotulo: 'PRECIO DE VENTA', pct: null, monto: v(c.precio_venta),
      subtitulo: 'sin IVA', final: true,
    },
  ]
  return escalones.filter((e) => e.clave !== 'financiero' || (e.pct ?? 0) > 0)
}

function subtituloDirecto(c: PresupuestoCascada): string {
  const partidas = `${c.n_partidas} ${c.n_partidas === 1 ? 'partida' : 'partidas'}`
  const horas = aNumero(c.hh_previstas)
  // «0 HH» diría que el contrato no lleva trabajo. Sin análisis cargado no hay horas que declarar.
  if (horas === null || horas === 0) return `sin HH cargadas · ${partidas}`
  return `${Math.round(horas).toLocaleString('es-AR')} HH · ${partidas}`
}

/**
 * LA INCIDENCIA DE UNA PARTIDA EN EL PRESUPUESTO — en porcentaje 0–100.
 *
 * Se mide contra el COSTO DIRECTO y no contra el precio de venta: es la pregunta «¿cuánto de lo
 * que cuesta esta obra es esta partida?», y el precio de venta le sumaría margen e impuestos, que
 * no son de la partida sino de la empresa. Sin costo directo —o con costo directo cero— no hay
 * fracción posible: devuelve `null`, y la pantalla escribe `—` sin barra.
 */
export function incidencia(subtotal: number | null, costoDirecto: number | null): number | null {
  const s = aNumero(subtotal)
  const d = aNumero(costoDirecto)
  if (s === null || d === null || d === 0) return null
  return (s / d) * 100
}

/**
 * ¿Se puede editar este presupuesto?
 *
 * «Un presupuesto congelado no se edita: se crea una versión nueva.» La base lo hace cumplir en
 * `congelar_presupuesto`, que se niega a correr dos veces; las partidas de un congelado siguen
 * siendo escribibles por RLS, así que el freno de la edición vive acá y en los botones.
 */
export function estaCongelado(c: Pick<PresupuestoCascada, 'congelada_en'>): boolean {
  return c.congelada_en !== null && c.congelada_en !== undefined
}
