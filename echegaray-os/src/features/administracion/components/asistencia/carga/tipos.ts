// LO QUE COMPARTEN LA TABLA DE LA COMPU, LA LISTA DEL TELÉFONO Y EL PANEL DE LA PERSONA. El estado vive
// una sola vez en `CargaDeAsistencia` —fusionado con el servidor— y baja por acá: si cada vista tuviera
// su copia, «Marcar presentes» y lo que otro usuario guardó se verían en una y no en la otra.

import type { CasillaPresencia, ToqueDePresencia } from '@/features/administracion/services/presenciaDelDia'
import type { FilaDeCarga, GrupoDeCarga } from '@/features/administracion/services/cargaDeAsistencia'
import type { EstadoDeGuardado, ObraElegible } from './ControlesDeFila'

export interface DiaDeLaCarga {
  fecha: string
  hoy: string
  rotuloDia: string
  obras: ObraElegible[]
  nombres: Readonly<Record<string, string>>
  sePuede: { marcar: boolean; tardanza: boolean; horas: boolean; motivo: string | null }
  puedeMover: boolean
  certificados: Readonly<Record<string, string>>
}

export interface AccionesDeLaCarga {
  casillaDe: (f: FilaDeCarga) => CasillaPresencia
  guardadoDe: (personaId: string) => EstadoDeGuardado
  /** La obra de la fila, o la elegida a mano para un día pasado sin obra. */
  obraDe: (f: FilaDeCarga) => string | null
  tocar: (f: FilaDeCarga, toque: ToqueDePresencia) => void
  elegirObra: (personaId: string, obraId: string) => void
  abrir: (personaId: string) => void
  marcarGrupo: (g: GrupoDeCarga) => void
}
