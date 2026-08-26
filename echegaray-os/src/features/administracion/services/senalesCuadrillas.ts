// LAS SEÑALES DE LA PRIMERA LÍNEA DE «CUADRILLAS Y HH» — criterio 2 del patrón v2. `21v2:211-214`.
//
// Mismas tres reglas que `senalesProveedores`: el cero no se dibuja, el `null` sí, y el verbo
// aterriza en el filtro que produjo el número. Vive en un `.ts` sin JSX porque es la regla que
// decide qué se le pide al usuario apenas entra, y eso se prueba sin React y sin base.
//
// El mockup declara exactamente DOS señales y acá van las mismas dos. No se agregó ninguna «de
// yapa»: la primera línea es la que se lee siempre, y una señal más es una que se mira menos.

import { resumirTrabajo, type SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'

// Se importan y se reexportan por separado —nunca `export … from`—: esa forma reenvía el símbolo
// sin crear el enlace local y revienta en ejecución con `typecheck` y `lint` en verde.
export { resumirTrabajo }
export type { SenalDeTrabajo }

export interface HrefsDeCuadrillas {
  /** La lista recortada a las cuadrillas sin obra vigente. */
  sinObra: string
  /** Dónde se asigna a alguien del plantel a una cuadrilla. */
  pool: string
}

/** Lo que la página sabe de cada frente: el número, o el error que impidió contarlo. */
export interface LecturaSenal { data: number | null; error: string | null }

export function armarSenalesCuadrillas(
  sinObra: LecturaSenal,
  sinCuadrilla: LecturaSenal,
  hrefs: HrefsDeCuadrillas,
): SenalDeTrabajo[] {
  const s: SenalDeTrabajo[] = []

  if (sinObra.error) {
    s.push({
      clave: 'sin-obra', numero: null, texto: 'cuadrillas sin obra vigente',
      bloquea: 'No pude contarlas: esta pantalla no puede afirmar que todas estén asignadas',
      accion: 'Revisar', href: hrefs.sinObra, icono: 'cuadrilla',
    })
  } else if ((sinObra.data ?? 0) > 0) {
    const n = sinObra.data ?? 0
    s.push({
      clave: 'sin-obra', numero: n,
      texto: n === 1 ? 'cuadrilla sin obra vigente' : 'cuadrillas sin obra vigente',
      // La consecuencia económica, no el estado del registro: sus HH existen y no le pesan a
      // ninguna obra, así que el costo de esa obra sale más barato de lo que fue.
      bloquea: 'Sus horas no entran en el costo de ninguna obra',
      accion: 'Asignar', href: hrefs.sinObra, icono: 'cuadrilla',
    })
  }

  if (sinCuadrilla.error) {
    s.push({
      clave: 'sin-cuadrilla', numero: null, texto: 'personas sin cuadrilla',
      bloquea: 'No pude contarlas: esta pantalla no puede afirmar que el plantel esté encuadrado',
      accion: 'Revisar', href: hrefs.pool, icono: 'persona',
    })
  } else if ((sinCuadrilla.data ?? 0) > 0) {
    const n = sinCuadrilla.data ?? 0
    s.push({
      clave: 'sin-cuadrilla', numero: n,
      texto: n === 1 ? 'persona sin cuadrilla' : 'personas sin cuadrilla',
      bloquea: n === 1 ? 'No aparece en ningún parte diario' : 'No aparecen en ningún parte diario',
      accion: 'Asignar', href: hrefs.pool, icono: 'persona',
    })
  }

  return s
}
