
import { cache } from 'react'
import { cookies } from 'next/headers'
import { secretoDelRol } from '@/lib/auth/rol-cache'
import { COOKIE_VER_COMO, leerVerComo, type RolMirable } from '@/lib/auth/ver-como'
import { ROL_LABEL, type Perfil } from '@/features/auth/types'

// LA LENTE, DEL LADO DEL SERVIDOR QUE DIBUJA.
//
// El middleware ya decide A QUÉ PANTALLA entra con la lente puesta (y rechaza toda escritura); esto
// decide CÓMO SE DIBUJA esa pantalla. Son dos lecturas de la misma cookie porque son dos preguntas
// distintas: el middleware redirige, el render elige columnas, acciones y textos.
//
// SE APLICA EN UN SOLO PUNTO: `getPerfilActual()`. Todo el OS —la barra de áreas, `NavAdministracion`,
// `veEconomia`, `liquidaSueldos`, cada `perfil.rol` de cada feature— cuelga de esa función. Cambiar
// ahí el rol que devuelve es lo que hace que la lente valga para las pantallas que ya existen y para
// las que se escriban mañana, sin tocarlas.
//
// LO QUE NO SE TOCA ES LA IDENTIDAD: `perfil.id` y `perfil.persona_id` siguen siendo los del dueño.
// La lente cambia el ROL con el que se dibuja; nunca QUIÉN ES el que mira.

/** Lo que la cookie afirma, ya verificado contra el usuario de la sesión. Memorizado por request. */
export const rolMirado = cache(async (uid: string): Promise<RolMirable | null> => {
  const secreto = secretoDelRol()
  if (!secreto) return null
  const cookie = (await cookies()).get(COOKIE_VER_COMO)?.value
  return leerVerComo(cookie, { uid }, secreto)
})

/**
 * El perfil como hay que DIBUJARLO. Si quien mira es Dirección y tiene la lente puesta, el rol que
 * sale es el mirado; en cualquier otro caso sale el real, tal cual.
 *
 * El portero está acá y no sólo en la ruta que prende la lente: si alguien dejara de ser Dirección
 * con la cookie viva, esta comparación la vuelve inerte en el primer render.
 */
export async function conLaLente(perfil: Perfil | null): Promise<Perfil | null> {
  if (!perfil || perfil.rol !== 'direccion') return perfil
  const mirado = await rolMirado(perfil.id)
  return mirado ? { ...perfil, rol: mirado } : perfil
}

export interface EstadoVerComo {
  /** ¿Esta persona puede encender la lente? Sólo Dirección. */
  puede: boolean
  /** El rol que se está mirando, o `null` si se está mirando con los ojos propios. */
  mirando: RolMirable | null
  etiqueta: string | null
}

export async function estadoVerComo(perfilReal: Perfil | null): Promise<EstadoVerComo> {
  if (!perfilReal || perfilReal.rol !== 'direccion') return { puede: false, mirando: null, etiqueta: null }
  const mirando = await rolMirado(perfilReal.id)
  return { puede: true, mirando, etiqueta: mirando ? ROL_LABEL[mirando] : null }
}
