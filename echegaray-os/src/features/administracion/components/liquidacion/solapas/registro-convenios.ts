// MIS TRES ENTRADAS DEL REGISTRO DE SOLAPAS.
//
// El índice `solapas/index.ts` lo escribe otro frente en paralelo. Este archivo existe para que las
// tres pantallas queden ENCHUFABLES sin pelearse por el mismo archivo en el merge: quien integre
// concatena estas entradas en el registro y borra este módulo, o lo importa y hace `spread`.
//
// La forma es la acordada: `{ clave, titulo, Componente }` y el ruteo por el query param `solapa`.
//
// PRODUCTIVIDAD NO ES UNA SOLAPA PROPIA. Va DENTRO de «Costo a la obra», debajo del bloque de costo:
// la obra primero ve cuánto le costó la quincena y después si esas horas produjeron. Se exporta
// aparte para que quien arme esa solapa la monte, no para que aparezca en la barra.

import type { ComponentType } from 'react'
import { SolapaConvenios } from './convenios'
import { SolapaProductividad } from './productividad'
import { SolapaRecibos } from './recibos'

/** Lo que toda solapa recibe: la quincena pedida por URL y el día de hoy. */
export interface PropsSolapa {
  quincenaPedida?: string
  hoy: string
}

export interface EntradaDeSolapa {
  clave: string
  titulo: string
  Componente: ComponentType<PropsSolapa>
}

export const SOLAPAS_CONVENIOS_Y_RECIBOS: EntradaDeSolapa[] = [
  { clave: 'convenios', titulo: 'Convenios', Componente: SolapaConvenios },
  { clave: 'recibos', titulo: 'Recibos', Componente: SolapaRecibos },
]

/** Va adentro de «Costo a la obra», no en la barra. Ver la cabecera. */
export const BLOQUE_PRODUCTIVIDAD: ComponentType<PropsSolapa> = SolapaProductividad
