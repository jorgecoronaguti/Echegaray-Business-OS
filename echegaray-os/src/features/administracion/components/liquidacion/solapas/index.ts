// EL REGISTRO DE LAS SECCIONES DE LIQUIDACIÓN — un solo lugar, una línea por sección.
//
// ═══ POR QUÉ UN REGISTRO Y NO UN `if` POR SECCIÓN EN LA PÁGINA ═══
//
// Con la barra escrita en la página y el contenido en otro `if`, la sección que alguien agregue queda
// dibujada sin destino o con destino y sin puerta — ya pasó con las tres vistas de Personal. Acá el
// título, la clave y el componente viajan juntos, y la barra se entera sola.
//
// ═══ UN CUADRO + «MÁS» CON TRES SECCIONES (dueño, 14/09/2026) ═══
//
// La Quincena es el cuadro de JORNALES y abre por defecto. «Más» tenía seis secciones y dos de ellas
// —«Horas por día» y «Pagos y caja»— repetían la fila y el pie del cuadro. Quedan tres, cada una con
// lo que la Quincena NO muestra:
//
//   caja     el renglón banco · efectivo · falta pagar (el MISMO pie), el cotejo contra la línea
//            Jornales del Flujo de Caja y la proyección de las dos quincenas siguientes.
//   costo    costo de la hora, costo por obra, productividad y, debajo, la exposición al convenio.
//   cierre   lo que traba el sello con nombre y fecha, cerrar/reabrir, la foto sellada y los recibos.
//
// Las claves viejas (`horas`, `pagos`, `convenios`, `recibos`) se resuelven en `claves.ts`.

import type { ComponentType } from 'react'
import { SolapaQuincena } from './quincena'
import { SolapaCaja } from './caja-nomina'
import { SolapaCosto } from './costo'
import { SolapaCierreYRecibos } from './cierre-y-recibos'
import { claveDeSolapa, type ClaveDeSolapa } from './claves'

export { SOLAPA_POR_DEFECTO, type ClaveDeSolapa } from './claves'

export interface SolapaDeLiquidacion {
  clave: ClaveDeSolapa
  titulo: string
  Componente: ComponentType<PropsDeSolapa>
}

/** Lo que TODA sección recibe. Cada una usa lo que necesita; ninguna vuelve a resolver la quincena. */
export interface PropsDeSolapa {
  /** Cualquier día de la ventana pedida; la sección la resuelve con `quincenaDe`. */
  quincenaPedida?: string
  hoy: string
  /** Los query params de la pantalla, para los recortes propios de cada sección. */
  parametros: Record<string, string | undefined>
  /** Enlaces dentro de la vista Liquidación, conservando sección y quincena. */
  hrefDe: (cambios: Record<string, string | undefined>) => string
}

// EL ORDEN DE ESTA LISTA ES EL DE LA BARRA: la primera es la vista principal, el resto va a «Más» en
// el orden de `CLAVES_DEL_MENU`.
export const SOLAPAS: SolapaDeLiquidacion[] = [
  { clave: 'quincena', titulo: 'Quincena', Componente: SolapaQuincena as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'caja', titulo: 'Caja y proyección', Componente: SolapaCaja as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'costo', titulo: 'Costo y convenio', Componente: SolapaCosto as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'cierre', titulo: 'Cierre y recibos', Componente: SolapaCierreYRecibos as unknown as ComponentType<PropsDeSolapa> },
]

/** La sección pedida —o la que absorbió una clave retirada—, o la Quincena. */
export function solapaDe(clave: string | undefined): SolapaDeLiquidacion {
  return SOLAPAS.find((s) => s.clave === claveDeSolapa(clave))!
}
