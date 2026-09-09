// LAS TRES SOLAPAS DEL COSTO — para sumar al índice `solapas/index.ts`.
//
// Vive aparte del índice porque el índice lo escribe otra tarea en paralelo y dos ramas que
// crean el mismo archivo chocan en el merge por construcción. Cuando `index.ts` exista, estas
// tres entradas se agregan ahí y este archivo se borra.
//
// `Componente` recibe `{ quincena, hoy }`: la ventana ya resuelta y el día de hoy para la fecha
// por defecto de una versión nueva de alícuota. No recibe el query param crudo — resolver la
// quincena en cada solapa sería tres definiciones de la misma ventana.

import type { Quincena } from '../../../services/quincena'
import { SolapaCostoHora } from './costo-hora'
import { SolapaCostoObra } from './costo-obra'
import { SolapaCajaNomina } from './caja-nomina'

export interface PropsDeSolapa { quincena: Quincena; hoy: string }

export interface EntradaDeSolapa {
  clave: string
  titulo: string
  Componente: (props: PropsDeSolapa) => Promise<React.ReactElement>
}

export const SOLAPAS_DE_COSTO: EntradaDeSolapa[] = [
  { clave: 'costo-obra', titulo: 'Costo a la obra', Componente: SolapaCostoHora },
  { clave: 'costo-por-obra', titulo: 'La quincena por obra', Componente: SolapaCostoObra },
  { clave: 'caja-nomina', titulo: 'Caja de nómina', Componente: SolapaCajaNomina },
]
