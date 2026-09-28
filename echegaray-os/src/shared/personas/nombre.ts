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
//   · Lo que se MUESTRA es `personas.nombre_para_mostrar` («Emiliano Maldonado»; dueño 24/09: «sí»),
//     un dato curado que se corrige en la ficha (migraciones 20260924T2200/2210). Sin él, el legajo en
//     oración. El legajo completo (`nombreLegal`) queda para la ficha, los recibos y los papeles legales.
//
// Ninguna pantalla formatea un nombre de persona por su cuenta: lo fija
// `src/shared/personas/nombre-en-pantallas.test.ts`.
import { oracion } from '../utils/texto.ts'

export const SIN_NOMBRE = 'sin nombre en el legajo'

/** Lo que una pantalla tiene de una persona: la fila (con `nombre_para_mostrar`, el nombre curado) o,
 *  cuando sólo viajó un texto, ese texto. */
export interface PersonaConNombre { nombre_para_mostrar?: string | null; nombre_completo?: string | null }
type Entrada = string | PersonaConNombre | null | undefined

const limpiar = (s: string | null | undefined) => String(s ?? '').trim().replace(/\s+/g, ' ')

/** El nombre para mostrar de una persona. Con la fila: su `nombre_para_mostrar` («Emiliano Maldonado»,
 *  curado en la ficha); sin él, el legajo en oración. Con un texto: ese texto en oración. Vacío →
 *  `SIN_NOMBRE` (se dice, no se inventa). */
export function nombreDePersona(p: Entrada): string {
  return nombreDePersonaONull(p) ?? SIN_NOMBRE
}

/** Igual que `nombreDePersona`, pero `null` cuando no hay nombre (para caer en otro dato). */
export function nombreDePersonaONull(p: Entrada): string | null {
  if (p != null && typeof p === 'object') {
    const curado = limpiar(p.nombre_para_mostrar)
    if (curado) return curado
    return nombreLegal(p.nombre_completo)
  }
  return nombreLegal(p)
}

/** El nombre LEGAL (el legajo) en oración: «Maldonado Batista Emiliano Miguel». Para la ficha, los
 *  recibos y los papeles legales, donde el nombre para mostrar no alcanza. */
export function nombreLegal(nombreCompleto: string | null | undefined): string | null {
  const l = limpiar(nombreCompleto)
  return l ? oracion(l) : null
}

/** Quita tildes, para que un acento no cambie el orden binario — MENOS LA DE LA Ñ.
 *
 *  La Ñ no es una N con tilde: es otra letra, y en español va después de la N («Nuñez», «Nuzzo»,
 *  «Ñañez»). Pero en NFD se descompone en N + U+0303, y quitar todo el rango combinante la volvía N:
 *  «Ñañez» quedaba entre «Nava» y «Nuñez». `localeCompare(..., 'es')` ya la ordena bien si le llega
 *  entera, así que se conserva la tilde que sigue a una n y se recompone (NFC). */
const sinTildes = (s: string) => s.normalize('NFD').replace(/(?<![nN])\u0303|[\u0300-\u0302\u0304-\u036f]/g, '').normalize('NFC')

/**
 * LA CLAVE DE ORDEN DE UNA PERSONA — SIEMPRE EL LEGAJO, NUNCA EL NOMBRE PARA MOSTRAR.
 *
 * Bug real (28/09/2026, dueño: «se ha roto el orden por apellido del personal en toda la app»): el
 * commit del 24/09 hizo que `nombreDePersona` devolviera «Emiliano Maldonado» (nombre de pila
 * primero, para MOSTRAR) y varias pantallas ordenaban con ese mismo texto — así el plantel quedaba
 * alfabético por NOMBRE DE PILA, no por apellido.
 *
 * `personas.nombre_completo` (el legajo: «Maldonado Batista Emiliano Miguel») empieza siempre por
 * apellido y es la única fuente para ORDENAR. Lo que se MUESTRA no cambia — sigue siendo
 * `nombreDePersona`. Sin legajo (una cuenta sin persona, o sólo llegó un texto ya resuelto), el
 * único dato que hay es el nombre para mostrar: se usa ÉSE para no dejar la fila sin orden.
 */
export function claveDeOrden(p: Entrada): string {
  const base = p != null && typeof p === 'object'
    ? (nombreLegal(p.nombre_completo) ?? nombreDePersonaONull(p))
    : nombreLegal(p)
  return sinTildes(String(base ?? '').toLocaleLowerCase('es-AR'))
}

/**
 * EL COMPARADOR ÚNICO PARA ORDENAR PERSONAS ALFABÉTICAMENTE — jefes/obreros y cualquier otro
 * agrupamiento se resuelven ANTES, con `esJefeDe`/`ordenarComoPersonal` (`ordenDePersonal.ts`); esta
 * función sólo decide el alfabético por apellido dentro de un grupo, o cuando no hay grupos.
 */
export function compararPorApellido(a: Entrada, b: Entrada): number {
  return claveDeOrden(a).localeCompare(claveDeOrden(b), 'es')
}

/** Una fila de `nombres_de_usuarios()`: el nombre ya viene resuelto por el vínculo. */
export interface FilaNombreDeUsuario { id: string; nombre: string | null }

/** Una fila de `orden_de_usuarios()`: la clave de orden ya resuelta en la base. */
export interface FilaOrdenDeUsuario { usuario_id: string; clave_orden: string | null }

/**
 * id de usuario → CLAVE DE ORDEN (el legajo, apellido primero), para las listas de usuarios.
 *
 * La clave la arma `orden_de_usuarios()` (security definer) y no la app, porque la RLS de `personas`
 * oculta los legajos a Campo y a los jefes: leído con su sesión, no había legajo y la lista caía al
 * nombre para mostrar, o sea al nombre de pila (auditoría 28/09/2026). Se vuelve a pasar por
 * `claveDeOrden` para que la normalización sea la de la app aunque la base deje escapar una tilde.
 */
export function clavesDeOrden(filas: readonly FilaOrdenDeUsuario[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of filas ?? []) {
    if (f.usuario_id) m.set(f.usuario_id, claveDeOrden(f.clave_orden))
  }
  return m
}

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
