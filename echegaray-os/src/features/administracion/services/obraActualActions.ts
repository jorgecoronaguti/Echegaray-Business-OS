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
// es el control que impide que un jefe de obra mueva costo de mano de obra entre obras— vive en
// `obraActualNucleo.ts`, que no importa `next/cache` ni `@/lib/supabase/server` y por eso SE PUEDE
// PROBAR. Mientras estuvo acá adentro, borrar ese `if` no ponía ni un test en rojo.
//
// ═══ LA ACCIÓN ES LA PUERTA, NO EL DESPLEGABLE ═══
//
// La pantalla ofrece obras activas; esta llamada puede venir de cualquier lado. Se vuelve a
// verificar que la obra exista y esté ACTIVA —igual que `guardarJornada`—: asignar gente a una obra
// cerrada le imputa costo de mano de obra a algo que ya nadie mira. Y la RLS de `obra_asignacion`
// NO alcanza: deja escribir al jefe dentro de `ve_obra`, que es justo lo que el dueño excluyó.
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

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { cambiarObraActualCon, type ResultadoObraActual, type SupabaseLike } from './obraActualNucleo'

export type { ResultadoObraActual }

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
