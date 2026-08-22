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
  clave:
    | 'costo_directo' | 'gastos_generales' | 'costo_industrial' | 'beneficio' | 'financiero'
    | 'iibb' | 'ganancias' | 'subtotal' | 'impuesto_cheque' | 'venta_sin_iva' | 'iva' | 'venta_final'
  rotulo: string
  /** El porcentaje del escalón, en FRACCIÓN. `null` en los que son sumas, que no llevan. */
  pct: number | null
  monto: number | null
  subtitulo: string
  /** La venta sin IVA cierra el precio de la empresa: se dibuja más grande y con `=` delante. */
  final?: boolean
  /** Un subtotal acumulado, no un escalón que se suma. Se dibuja como corte, no como renglón. */
  acumulado?: boolean
}

/** ¿La cascada tiene algo que publicar, o sus ceros los puso un `coalesce`? */
export function tieneCifras(c: Pick<PresupuestoCascada, 'n_partidas'>): boolean {
  return (c.n_partidas ?? 0) > 0
}

/**
 * LOS ESCALONES DE LA CASCADA DEL LIBRO, en orden y con su base declarada en el subtítulo.
 *
 * Cada renglón dice SOBRE QUÉ se aplica su porcentaje, porque ahí está lo que más plata cuesta
 * entender mal: el beneficio no va sobre el costo directo, el financiero no incluye el beneficio, y
 * IIBB y Ganancias van sobre industrial + beneficio y no sobre la venta.
 *
 * El financiero se dibuja SÓLO si tiene porcentaje: un escalón de «0 %» ocupando el mismo lugar que
 * el beneficio sugiere que se decidió no cobrarlo. Cuando el presupuesto lo carga, aparece.
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
      clave: 'gastos_generales', rotulo: 'GASTOS GENERALES', pct: aNumero(c.pct_gastos_generales),
      monto: v(c.gastos_generales), subtitulo: 'sobre el costo directo · estructura y obrador',
    },
    {
      clave: 'costo_industrial', rotulo: 'COSTO INDUSTRIAL', pct: null, monto: v(c.costo_industrial),
      subtitulo: 'lo que la obra cuesta puesta en marcha', acumulado: true,
    },
    {
      clave: 'beneficio', rotulo: 'BENEFICIO', pct: aNumero(c.pct_beneficio), monto: v(c.beneficio),
      subtitulo: 'sobre el costo industrial · markup, no margen',
    },
    {
      clave: 'financiero', rotulo: 'FINANCIERO', pct: aNumero(c.pct_financiero), monto: v(c.financiero),
      subtitulo: `sobre el costo industrial · ${porFactor(c.factor_financiero)} del período`,
    },
    {
      clave: 'iibb', rotulo: 'IIBB Y LOTE HOGAR', pct: aNumero(c.pct_iibb), monto: v(c.iibb),
      subtitulo: 'sobre industrial + beneficio',
    },
    {
      clave: 'ganancias', rotulo: 'GANANCIAS', pct: aNumero(c.pct_ganancias), monto: v(c.ganancias),
      subtitulo: 'sobre industrial + beneficio · proxy de costeo',
    },
    {
      clave: 'subtotal', rotulo: 'SUBTOTAL', pct: null, monto: v(c.subtotal),
      subtitulo: 'antes del impuesto al cheque', acumulado: true,
    },
    {
      clave: 'impuesto_cheque', rotulo: 'IMPUESTO AL CHEQUE', pct: aNumero(c.pct_cheque),
      monto: v(c.impuesto_cheque), subtitulo: 'sobre el subtotal acumulado',
    },
    {
      clave: 'venta_sin_iva', rotulo: 'VENTA SIN IVA', pct: null, monto: v(c.venta_sin_iva),
      subtitulo: subtituloCoeficiente(c), final: true,
    },
    {
      clave: 'iva', rotulo: 'IVA', pct: aNumero(c.pct_iva), monto: v(c.iva),
      subtitulo: 'sobre la venta sin IVA · lo único normativo de la cascada',
    },
    {
      clave: 'venta_final', rotulo: 'VENTA FINAL', pct: null, monto: v(c.venta_final),
      subtitulo: 'lo que factura al cliente', acumulado: true,
    },
  ]
  return escalones.filter((e) => e.clave !== 'financiero' || (e.pct ?? 0) > 0)
}

/** `0,5` → «medio». El factor financiero declara qué fracción del período se financia. */
function porFactor(factor: number | null): string {
  const f = aNumero(factor)
  if (f === null || f === 0) return 'sin financiar'
  if (f === 0.5) return 'medio'
  if (f === 1) return 'todo el'
  return `${(f * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} % del`
}

/**
 * EL COEFICIENTE, que es lo que la empresa mira para saber si la cascada es la de siempre.
 *
 * Sale de la vista —acá no se divide nada—. Con los parámetros del libro da 1,682 sin IVA; el
 * default que ofrecía esta pantalla antes daba 1,4287, que son 18 puntos de precio.
 */
function subtituloCoeficiente(c: PresupuestoCascada): string {
  const coef = aNumero(c.coeficiente_sin_iva)
  if (coef === null) return 'el precio que se oferta'
  return `coeficiente ${coef.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} sobre el costo directo`
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
