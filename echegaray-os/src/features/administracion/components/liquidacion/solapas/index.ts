// EL REGISTRO DE LAS SIETE SOLAPAS DE LIQUIDACIÓN — un solo lugar, una línea por solapa.
//
// ═══ POR QUÉ UN REGISTRO Y NO SEIS `if` EN LA PÁGINA ═══
//
// Las doce pantallas del handoff v2 las construyen varias manos a la vez. Con la barra escrita en
// la página y el contenido en otro `if`, la solapa que alguien agregue queda dibujada sin destino o
// con destino y sin puerta — y eso ya pasó con las tres vistas de Personal, que estaban escritas
// dos veces. Acá el título, la clave y el componente viajan juntos: agregar una pantalla es agregar
// UNA línea, y la barra se entera sola.
//
// EL ORDEN DE ESTA LISTA ES EL ORDEN DE LA BARRA. `quincena` va primera porque es la que se abre por
// defecto desde el 11/09/2026: es el espejo del bloque de la planilla JORNALES, la pantalla que el
// dueño abre. Antes era `horas`, que contesta la mitad de la pregunta —las horas sin la plata—.
//
// ═══ UNA SOLAPA SIN COMPONENTE NO SE DIBUJA ═══
//
// `Componente: null` es «esta pantalla todavía no existe». Se lista igual —el dueño ya sabe que van
// a estar— pero no se ofrece el clic: una solapa que lleva a una pantalla en blanco se lee como que
// el módulo está roto.

import type { ComponentType } from 'react'
import { SolapaQuincena } from './quincena'
import { SolapaHoras } from './SolapaHoras'
import { SolapaCosto } from './costo'
import { SolapaPagos } from './pagos'
import { SolapaCierre } from './cierre'
import { SolapaConvenios } from './convenios'
import { SolapaRecibos } from './recibos'

export type ClaveDeSolapa = 'quincena' | 'horas' | 'pagos' | 'costo' | 'convenios' | 'cierre' | 'recibos'

export interface SolapaDeLiquidacion {
  clave: ClaveDeSolapa
  titulo: string
  /** `null` mientras la pantalla no exista. La barra la dibuja apagada y sin enlace. */
  Componente: ComponentType<PropsDeSolapa> | null
}

/** Lo que TODA solapa recibe. Cada una usa lo que necesita; ninguna vuelve a resolver la quincena. */
export interface PropsDeSolapa {
  /** Cualquier día de la ventana pedida; la solapa la resuelve con `quincenaDe`. */
  quincenaPedida?: string
  hoy: string
  /** Los query params de la pantalla, para los recortes propios de cada solapa. */
  parametros: Record<string, string | undefined>
  /** Enlaces dentro de la vista Liquidación, conservando solapa y quincena. */
  hrefDe: (cambios: Record<string, string | undefined>) => string
}

/**
 * LA QUE ABRE ES «QUINCENA» (dueño, 11/09/2026: «tengo que seguir usando Sheet JORNALES»).
 *
 * Era `horas`, y «Horas» contesta la mitad de la pregunta: cuánto trabajó cada uno, sin la plata. El
 * dueño entra a Liquidación a mirar la quincena entera —horas Y pago— y tenía que cruzar a «Pagos» y
 * buscar a la persona de nuevo. Cambiar el default no borra nada: las seis siguen donde estaban.
 */
export const SOLAPA_POR_DEFECTO: ClaveDeSolapa = 'quincena'

// ═══ EL ÍNDICE ═══
//
// Cada agente agrega SU línea acá y nada más. `pagos` apunta hoy al cuadro que ya existe
// (`BloqueLiquidacion`) para que la cadena de pago no quede sin puerta mientras se construye la
// pantalla 4; quien la haga reemplaza ese componente por el suyo.
//
// ═══ «CAJA DE NÓMINA» NO ES UNA SOLAPA ═══
//
// El mockup lista CINCO solapas de nivel 3 (`Horas · Pagos · Costo a la obra · Convenios · Cierre`,
// + Recibos) y la pantalla 9 no está entre ellas: se dibuja aparte, a 1040 px, y sus dos primeras
// filas —«Efectivo en mano» y «Lote de haberes al banco»— son literalmente los dos totales del pie
// de Pagos. Por eso vive DENTRO de `pagos.tsx`, debajo del cuadro. Una séptima solapa obligaría a
// cambiar de pantalla para leer el total que se acaba de calcular, y agregaría un nivel de
// navegación que el handoff §4 prohíbe («máximo dos niveles» de header, tres con las solapas).
export const SOLAPAS: SolapaDeLiquidacion[] = [
  // EL ESPEJO DEL BLOQUE DE JORNALES. Va primera porque es la pantalla que reemplaza a la planilla:
  // una fila por persona, una columna por día, y la cadena de pago a la derecha.
  { clave: 'quincena', titulo: 'Quincena', Componente: SolapaQuincena as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'horas', titulo: 'Horas', Componente: SolapaHoras },
  { clave: 'pagos', titulo: 'Pagos', Componente: SolapaPagos as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'costo', titulo: 'Costo a la obra', Componente: SolapaCosto },
  { clave: 'convenios', titulo: 'Convenios', Componente: SolapaConvenios },
  // La ruta ya cortó con notFound() a quien no liquida: llegar acá es poder cerrar.
  { clave: 'cierre', titulo: 'Cierre', Componente: ((p: PropsDeSolapa) => SolapaCierre({ ...p, puedeCerrar: true })) as unknown as ComponentType<PropsDeSolapa> },
  { clave: 'recibos', titulo: 'Recibos', Componente: SolapaRecibos },
]

/** La solapa pedida, o la de por defecto. Una clave inventada en la URL no rompe la pantalla. */
export function solapaDe(clave: string | undefined): SolapaDeLiquidacion {
  return SOLAPAS.find((s) => s.clave === clave)
    ?? SOLAPAS.find((s) => s.clave === SOLAPA_POR_DEFECTO)!
}
