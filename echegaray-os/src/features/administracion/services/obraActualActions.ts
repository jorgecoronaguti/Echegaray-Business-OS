'use server'

// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA DESDE LA GRILLA DE ASISTENCIA.
//
// El dueño (08/09/2026): *"la asignación de personal en cada obra es imposible… por el momento que
// sea desde planilla asistencia con un dropdown de obra actual"*. Esta acción es lo que hay detrás
// de ese desplegable, y escribe la MISMA tabla que la solapa Personal de la obra y que la ficha de
// la persona: `obra_asignacion`. No existe un campo «obra actual» en `personas` — inventarlo sería
// la segunda definición de dónde trabaja alguien.
//
// ═══ ACÁ SÓLO QUEDA LO QUE NECESITA NEXT ═══
//
// Cliente, perfil, fecha y `revalidatePath`. La secuencia entera —incluido el rechazo por rol, que
// es el control que impide que alguien sin permiso mueva costo de mano de obra entre obras— vive en
// `obraActualNucleo.ts`, que no importa `next/cache` ni `@/lib/supabase/server` y por eso SE PUEDE
// PROBAR. Mientras estuvo acá adentro, borrar ese `if` no ponía ni un test en rojo.
//
// ═══ LA ACCIÓN ES LA PUERTA, NO EL DESPLEGABLE ═══
//
// La pantalla ofrece obras activas; esta llamada puede venir de cualquier lado. Se vuelve a
// verificar que la obra exista y esté ACTIVA —igual que `guardarJornada`—: asignar gente a una obra
// cerrada le imputa costo de mano de obra a algo que ya nadie mira. Y la RLS de `obra_asignacion`
// NO alcanza como control de rol: es más ancha que la lista que decidió el dueño.
//
// ═══ LAS HORAS YA CARGADAS NO SE TOCAN ═══
//
// Cada `registros_hh` lleva su propia `obra_canonica_id`: son hechos del día en que ocurrieron.
// Cambiar la obra actual cambia de dónde en adelante, nunca hacia atrás. Si hay que mover un día ya
// cargado, eso es la corrección de jornada (`corregirJornada`), que además avisa a qué obra va.
//
// ═══ PRIMERO CIERRA, DESPUÉS ABRE ═══
//
// Al revés de `escribirPlan` —donde el riesgo es perder horas y por eso se inserta primero—, acá
// ninguna de las dos escrituras pierde nada: cerrar es un `update` reversible (se borra `hasta`).
// Si el `insert` falla después del cierre, la persona queda «Sin obra», que la grilla muestra y el
// mismo desplegable arregla. Abriendo primero, un cierre fallido dejaría DOS obras vigentes y la
// grilla elegiría una por horas: el error quedaría escondido detrás de un rótulo plausible.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { cambiarObraActualCon, type ResultadoObraActual, type SupabaseLike } from './obraActualNucleo'
import {
  cancelarTramoProgramadoCon, leerTramosCon,
  type ResultadoCancelacion, type SupabasePlanLike,
} from './planDeObraNucleo'
import type { TramoDeAsignacion } from './planDeObraActual'

// ═══ UN `export type` ACÁ ROMPE LA PANTALLA ENTERA EN PRODUCCIÓN ═══
//
// Este archivo es `'use server'`: el compilador convierte CADA export en una referencia de runtime,
// también la de un tipo, que en el bundle no existe. El build pasa; en `next start` la página muere
// al evaluar el módulo con `ReferenceError: ResultadoObraActual is not defined` y `/administracion/
// personas` contesta «No se pudo cargar el legajo de personas». No se ve con `next dev`.
//
// Es lo que el dueño vio el 08/09/2026 al usar el desplegable —*"se rompe"*—: el `router.refresh()`
// que sigue al cambio vuelve a evaluar el módulo y la pantalla se cae entera.
//
// El tipo se importa de `obraActualNucleo`, que es donde vive. Reexportarlo desde una acción no
// ahorra nada y cuesta la pantalla.

export async function cambiarObraActual(entrada: unknown): Promise<ResultadoObraActual> {
  const supabase = await createClient()

  // SIN PERFIL NO SE SIGUE. Un error de sesión gana sobre cualquier otra cosa: no se puede decidir
  // quién es el que llama, y ésta es la puerta.
  const perfil = await getPerfilActual(supabase)
  if (perfil.error) return { ok: false, error: perfil.error }

  return cambiarObraActualCon({
    // El cliente real cumple de sobra el subconjunto que el núcleo declara; el `unknown` intermedio
    // es porque PostgREST devuelve builders genéricos, no el tipo angosto que acá alcanza.
    supabase: supabase as unknown as SupabaseLike,
    perfil: perfil.data ? { rol: perfil.data.rol } : null,
    hoy: new Date().toISOString().slice(0, 10),
    // El id llega DEL NÚCLEO, ya pasado por Zod: volver a leerlo de la entrada cruda acá sería
    // interpolar en una ruta algo que nadie validó.
    revalidar: (personaId) => {
      revalidatePath('/administracion/personas')
      revalidatePath(`/administracion/personas/${personaId}`)
      revalidatePath('/campo/asistencia')
    },
  }, entrada)
}

// ═══ PROGRAMAR UN PASE NO TIENE ACCIÓN PROPIA ═══
//
// `cambiarObraActual` ya lo hace: su esquema acepta `desde` y `hasta`, y sin ellos se comporta
// exactamente como el desplegable de la grilla. Una `programarPaseDeObra` al lado sería la segunda
// puerta a la misma tabla, con su propio control de rol que hay que acordarse de mantener igual.
// El panel llama a la misma acción con dos campos más.

/**
 * Los tramos de `obra_asignacion` de una persona, para el panel «Plan de obra».
 *
 * LECTURA, NO ESCRITURA: el control de rol es la RLS de la tabla, que ya acota qué asignaciones ve
 * cada perfil. Poner acá la lista de roles que ESCRIBEN escondería el plan a quien puede mirarlo
 * pero no tocarlo — y el jefe que no puede mover a nadie igual necesita saber dónde va a estar su
 * gente. Los botones que escriben sí piden el rol, cada uno en su acción.
 */
export async function leerPlanDeObra(personaId: unknown): Promise<
  { ok: true; tramos: TramoDeAsignacion[] } | { ok: false; error: string }
> {
  const id = z.string().uuid().safeParse(personaId)
  if (!id.success) return { ok: false, error: 'Persona inválida.' }
  const supabase = await createClient()
  const r = await leerTramosCon(supabase as unknown as SupabasePlanLike, id.data)
  if (r.error) return { ok: false, error: r.error }
  return { ok: true, tramos: r.data }
}

/** Deshacer un pase programado. Mismo permiso que moverlo de obra hoy: mueve el mismo costo. */
export async function cancelarPaseProgramado(entrada: unknown): Promise<ResultadoCancelacion> {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (perfil.error) return { ok: false, error: perfil.error }

  return cancelarTramoProgramadoCon({
    supabase: supabase as unknown as SupabasePlanLike,
    perfil: perfil.data ? { rol: perfil.data.rol } : null,
    hoy: new Date().toISOString().slice(0, 10),
    revalidar: (id) => {
      revalidatePath('/administracion/personas')
      revalidatePath(`/administracion/personas/${id}`)
      revalidatePath('/campo/asistencia')
    },
  }, entrada)
}
