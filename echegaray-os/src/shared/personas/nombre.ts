// EL NOMBRE DE UNA PERSONA SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026: «noto nombres distintos
// en distintas secciones de la app»).
//
// Antes, la misma persona salía «Emiliano» (Herramientas, el listado viejo), «Emiliano Maldonado»
// (tareas, efectivo: `perfiles.nombre`), «Maldonado Batista Emiliano Miguel» (Personal: el legajo),
// «MALDONADO BATISTA EMILIANO MIGUEL» (asistencia, cuadrillas: el legajo crudo), «M. Maldonado» (parte
// diario) y «E. Maldonado» (el rastro de una corrección). Y hay DOS Emilianos en el plantel.
//
// ═══ LA REGLA (vigente desde el 29/09/2026) ═══
//
// DUEÑO, 29/09/2026: «quiero que reorganices todo el orden de los nombres en todos los lugares
// posibles donde pueden aparecer siendo primero apellido y después nombre [...] tienen que consumir
// de la misma tabla de supabase y ordenarse como digo». Reemplaza el «Emiliano Maldonado» que aprobó
// el 24/09: TODA persona se muestra «APELLIDO Nombre» y TODA lista de personas ordena por apellido.
//
//   · La FUENTE del legajo es `personas.nombre_completo`: es lo que dicen el recibo, el alta y ARCA,
//     y es único en el plantel. Ya empieza por apellido («Maldonado Batista Emiliano Miguel»).
//   · Un USUARIO (un acceso, `perfiles`) que es una persona se llama como su persona: el vínculo es
//     `perfiles.persona_id`, resuelto en la base por `nombres_de_usuarios()` (migración
//     20260924T2100). Sin persona, su `perfiles.nombre`. Persona ≠ Usuario: no se fusionan, se
//     resuelve el nombre por el vínculo.
//   · Lo que se MUESTRA es `personas.nombre_para_mostrar`, el corto y curado, AHORA apellido primero
//     («Maldonado Emiliano», «Gonzalez Emiliano»: los dos Emilianos no se confunden). Es un dato
//     único en Supabase que leen la app, las vistas, las RPC y el bot; se corrige en la ficha
//     (migración 20260929T1000 lo dio vuelta). Sin él, el legajo en oración, que ya es apellido primero.
//     El legajo completo (`nombreLegal`) queda para la ficha, los recibos y los papeles legales.
//   · El ORDEN es `compararPorApellido`: como lo que se muestra ya empieza por apellido, se ordena por
//     lo mismo que se dibuja (`claveDeOrden`). Ojo con la lección del 28/09: cambiar cómo se muestra
//     rompió el orden porque se mostraba nombre-primero; si alguna vez se vuelve a mostrar de otra
//     forma, `claveDeOrden` es lo primero que hay que revisar.
//   · Excepción declarada: el SALUDO («Hola, Jorge», `nombreDePila`) usa la primera palabra de la
//     cuenta, que la persona escribió en su orden natural; no es una lista ni un nombre de persona.
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

/** El nombre para mostrar de una persona. Con la fila: su `nombre_para_mostrar` («Maldonado Emiliano»,
 *  apellido primero, curado en la ficha); sin él, el legajo en oración. Con un texto: ese texto en oración. Vacío →
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
 * LA CLAVE DE ORDEN DE UNA PERSONA — APELLIDO PRIMERO, LO MISMO QUE SE DIBUJA.
 *
 * Historia: el 24/09 se empezó a mostrar «Emiliano Maldonado» (nombre de pila primero) y varias
 * pantallas ordenaban con ese texto, o sea por NOMBRE DE PILA (bug del dueño, 28/09/2026: «se ha
 * roto el orden por apellido del personal en toda la app»); se arregló ordenando por el legajo. El
 * 29/09 el dueño pidió mostrar apellido primero, así que hoy `nombre_para_mostrar` y el legajo
 * empiezan igual y la clave sale de lo que se muestra: una lista ordena por lo que dibuja.
 *
 * Por qué no se sigue prefiriendo el legajo: hay un legajo cargado al revés («FACUNDO BUTIERREZ») que
 * lo mandaba a la F, y el nombre curado (apellido primero) es el dato que el dueño ve y corrige. Sin
 * nombre para mostrar (o sólo un texto ya resuelto) manda el legajo: también empieza por apellido.
 */
export function claveDeOrden(p: Entrada): string {
  const base = p != null && typeof p === 'object' ? nombreDePersonaONull(p) : nombreLegal(p)
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
 * id de usuario → CLAVE DE ORDEN (apellido primero), para las listas de usuarios.
 *
 * La clave la arma `orden_de_usuarios()` (security definer) y no la app, porque la RLS de `personas`
 * oculta los legajos a Campo y a los jefes: leído con su sesión, no había legajo y la lista caía al
 * nombre de la cuenta (auditoría 28/09/2026; la cuenta trae el nombre de pila primero). Se vuelve a pasar por
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
