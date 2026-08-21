// J05 · QUIÉN ESTÁ HOY — la presencia de la obra, agrupada como la mira el jefe.
//
// La lectura, los tres grupos y el reloj NO se reimplementan: salen de
// `features/administracion/services/presencia`, que es la misma definición que usa la pantalla
// global de Administración. Dos versiones de «quién está en obra» es exactamente cómo se llega a
// que dos pantallas informen distinto el mismo día.
//
// Lo que agrega este módulo es el AGRUPAMIENTO POR CUADRILLA, que es como el jefe conduce: no
// piensa en 14 personas, piensa en tres cuadrillas y un frente sin gente.

import type { Esperado, FilaPresencia, Grupos } from '@/features/administracion/services/presencia'

export const SIN_CUADRILLA = 'Sin cuadrilla'

export interface CuadrillaEnObra {
  clave: string
  nombre: string
  presentes: FilaPresencia[]
}

/**
 * Las personas presentes, agrupadas por su cuadrilla.
 *
 * La cuadrilla sale de `persona_directorio` —`esperados`—, no de la marca de asistencia: la marca
 * la hace la persona y no sabe de cuadrillas. Quien marcó y no está en el plantel esperado (una
 * asignación que venció hoy, alguien prestado de otra obra) NO se descarta: cae en «Sin cuadrilla».
 * Descartarlo lo borraría de la pantalla estando parado en la obra.
 */
export function porCuadrilla(presentes: FilaPresencia[], esperados: Esperado[]): CuadrillaEnObra[] {
  const cuadrillaDe = new Map(esperados.map((e) => [e.id, e.cuadrilla?.trim() || SIN_CUADRILLA]))
  const grupos: CuadrillaEnObra[] = []
  const indice = new Map<string, CuadrillaEnObra>()
  for (const p of presentes) {
    const nombre = cuadrillaDe.get(p.persona_id) ?? SIN_CUADRILLA
    let g = indice.get(nombre)
    if (!g) {
      g = { clave: nombre, nombre, presentes: [] }
      indice.set(nombre, g)
      grupos.push(g)
    }
    g.presentes.push(p)
  }
  // «Sin cuadrilla» al final: es el resto, no un grupo más.
  return grupos.sort((a, b) =>
    (a.nombre === SIN_CUADRILLA ? 1 : 0) - (b.nombre === SIN_CUADRILLA ? 1 : 0)
    || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Por qué alguien del plantel no tiene marca hoy. NUNCA «ausente» y NUNCA «0 horas».
 *
 * El motivo real no lo sabe el sistema: sabe que no hay marca. Lo dice así, y quien declare la
 * falta es el jefe — desde Administración, donde eso sí es una novedad de liquidación.
 */
export function motivoSinMarca(e: Esperado): string {
  return e.cuadrilla ? `${e.cuadrilla} · sin registrar` : 'sin registrar'
}

/** El renglón de arriba de la pantalla. Tres números, y ninguno inventado. */
export interface ResumenDelDia {
  enObra: number
  asignados: number
  sinRegistrar: number
  /** Jornadas de ayer que quedaron sin cierre. No son gente en obra: les falta la salida. */
  sinCerrar: number
}

export function resumenDelDia(g: Grupos, esperados: Esperado[]): ResumenDelDia {
  return {
    enObra: g.enObra.length,
    asignados: esperados.length,
    sinRegistrar: g.sinRegistrar.length,
    sinCerrar: g.faltaSalida.length,
  }
}

/** `QUIROGA SEBASTIAN ADOLFO` → `QS`. El círculo lleva iniciales, nunca un muñequito gris. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '—'
}
