// EL NOMBRE DE UNA PERSONA SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026: «noto nombres distintos
// en distintas secciones de la app»).
//
// Antes, la misma persona salía «Emiliano» (Herramientas, el listado viejo), «Emiliano Maldonado»
// (tareas, efectivo: `perfiles.nombre`), «Maldonado Batista Emiliano Miguel» (Personal: el legajo),
// «MALDONADO BATISTA EMILIANO MIGUEL» (asistencia, cuadrillas: el legajo crudo), «M. Maldonado» (parte
// diario) y «E. Maldonado» (el rastro de una corrección). Y hay DOS Emilianos en el plantel.
//
// ═══ LA REGLA ═══
//
//   · La FUENTE es `personas.nombre_completo`, el legajo: es lo que dicen el recibo, el alta y ARCA,
//     y es único en el plantel.
//   · Un USUARIO (un acceso, `perfiles`) que es una persona se llama como su persona: el vínculo es
//     `perfiles.persona_id`, resuelto en la base por `nombres_de_usuarios()` (migración
//     20260924T2100). Sin persona, su `perfiles.nombre`. Persona ≠ Usuario: no se fusionan, se
//     resuelve el nombre por el vínculo.
//   · El FORMATO es uno: el legajo en oración, en su orden («Maldonado Batista Emiliano Miguel»).
//     No se da vuelta a «Nombre Apellido» porque el legajo no dice dónde terminan los apellidos
//     («Corona Gutierrez Jorge» son dos; «Quiroga Sebastian Adolfo», uno): darlo vuelta es adivinar.
//
// Ninguna pantalla formatea un nombre de persona por su cuenta: lo fija
// `src/shared/personas/nombre-en-pantallas.test.ts`.
import { oracion } from '../utils/texto.ts'

export const SIN_NOMBRE = 'sin nombre en el legajo'

/** El nombre para mostrar de una persona, desde su legajo. «MALDONADO BATISTA EMILIANO MIGUEL» →
 *  «Maldonado Batista Emiliano Miguel». Vacío → `SIN_NOMBRE` (se dice, no se inventa). */
export function nombreDePersona(nombreCompleto: string | null | undefined): string {
  const limpio = String(nombreCompleto ?? '').trim().replace(/\s+/g, ' ')
  return limpio ? oracion(limpio) : SIN_NOMBRE
}

/** Igual que `nombreDePersona`, pero `null` cuando no hay nombre (para caer en otro dato). */
export function nombreDePersonaONull(nombreCompleto: string | null | undefined): string | null {
  const limpio = String(nombreCompleto ?? '').trim()
  return limpio ? nombreDePersona(limpio) : null
}

/** Una fila de `nombres_de_usuarios()`: el nombre ya viene resuelto por el vínculo. */
export interface FilaNombreDeUsuario { id: string; nombre: string | null }

/** El nombre para mostrar de un usuario: el de su persona si la tiene, o el de su cuenta. Sin
 *  ninguno, la parte local del correo; sin correo, «alguien». */
export function nombreDeUsuario(nombre: string | null | undefined, email?: string | null): string {
  const n = nombreDePersonaONull(nombre)
  if (n) return n
  const local = String(email ?? '').split('@')[0].trim()
  return local || 'alguien'
}

/** El diccionario id de usuario → nombre para mostrar, desde las filas de `nombres_de_usuarios()`. */
export function diccionarioDeUsuarios(filas: readonly FilaNombreDeUsuario[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of filas ?? []) {
    const n = nombreDePersonaONull(f.nombre)
    if (f.id && n) m.set(f.id, n)
  }
  return m
}

/** Para el saludo («Hola, Jorge»): la primera palabra del nombre de la CUENTA (`perfiles.nombre`),
 *  que la persona escribió en su orden natural. Del legajo no sale: su primera palabra es un apellido. */
export function nombreDePila(nombreDeCuenta: string | null | undefined, email?: string | null): string {
  const primera = String(nombreDeCuenta ?? '').trim().split(/\s+/)[0] ?? ''
  if (primera) return oracion(primera)
  const local = String(email ?? '').split('@')[0].split(/[._-]/)[0].trim()
  return local ? oracion(local.toLocaleUpperCase('es-AR')) : ''
}
