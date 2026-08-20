// LAS PUERTAS QUE NO SE PUEDEN ABRIR NI SIENDO ADMINISTRACIÓN.
//
// Están acá, solas y sin un solo `await`, porque son las reglas que hay que poder PROBAR sin base,
// sin sesión y sin navegador. Una regla de seguridad que sólo se puede ejercitar levantando el
// sistema entero termina no ejercitándose nunca — y ésta es de las que se descubren rotas el día
// que ya no queda nadie que pueda entrar.
//
// ═══ POR QUÉ LAS DOS ═══
//
// 1. NADIE SE TOCA A SÍ MISMO. Un administrador que se cambia el rol o se desactiva se saca del
//    sistema con la misma pantalla que usa para administrarlo. No es hipotético: la pantalla lista
//    a todos, y la propia fila está en el medio de las demás.
// 2. NO SE APAGA AL ÚLTIMO ADMINISTRADOR. Si se apaga, no queda NADIE que pueda volver a encender a
//    nadie: el único camino de vuelta es entrar a Supabase a mano. Falla cerrado.
//
// Las dos devuelven el MOTIVO en castellano, o `null` cuando no hay impedimento. Devolver el texto
// —y no un booleano— obliga a que la pantalla diga por qué; un `false` mudo termina siempre en un
// botón que no hace nada.

// LA RUTA RELATIVA CON EXTENSIÓN NO ES UN DESCUIDO. Este archivo lo ejercita `reglas.test.ts` con
// `node --test`, que no conoce el alias `@/` de TypeScript: un `import` de VALOR por alias hace que
// la prueba muera con `ERR_MODULE_NOT_FOUND` antes de correr una sola aserción. `Rol` puede seguir
// por alias porque es `import type` y se borra al compilar; `veEconomia` es una función real y
// tiene que poder resolverse. Es la misma razón por la que `areas.test.ts` importa `'./areas.ts'`.
import type { Rol } from '@/features/auth/types'
import { veEconomia, type Area } from '../../auth/types/areas.ts'
import { cuandoCorto } from '../../administracion/services/entradaService.ts'

/**
 * LOS ROLES QUE SE PUEDEN ELEGIR, AGRUPADOS POR NIVEL.
 *
 * *"No crear más niveles de usuario"*. Los cuatro literales son los que ya viven en
 * `perfiles.rol` y contra los que están escritas las policies; lo único que agrega esta pantalla es
 * mostrarlos agrupados por el nivel al que pertenecen, que es la agrupación que ya define
 * `areaDe()`. Elegir el nivel sin elegir el rol obligaría a inventar un rol por defecto.
 */
export const ROLES_DE_AREA: Record<Area, Rol[]> = {
  administracion: ['direccion', 'administracion'],
  obras: ['jefe_obra', 'campo'],
}

export const ROLES_VALIDOS: readonly Rol[] = [...ROLES_DE_AREA.administracion, ...ROLES_DE_AREA.obras]

export interface CuentaEnJuego {
  /** Quién ejecuta la acción. Sale de la sesión del servidor, NUNCA del formulario. */
  actorId: string
  /** A quién se le aplica. */
  objetivoId: string
  /** El rol que el objetivo tiene HOY. `null` = cuenta sin perfil. */
  rolActual: Rol | null
  /** Cuentas de nivel Administración que hoy pueden entrar, CONTANDO al objetivo. */
  adminsActivos: number
}

const ULTIMO_ADMIN =
  'Es la última cuenta de Administración con acceso. Si le sacás el acceso no queda nadie que pueda ' +
  'devolvérselo: primero dale acceso de Administración a otra persona.'

/** El motivo por el que NO se puede desactivar esta cuenta, o `null` si se puede. */
export function motivoParaNoDesactivar(c: CuentaEnJuego): string | null {
  if (c.actorId === c.objetivoId) return 'No podés sacarte el acceso a vos mismo.'
  if (veEconomia(c.rolActual) && c.adminsActivos <= 1) return ULTIMO_ADMIN
  return null
}

// ═══ LA CONTRASEÑA ES UN NIVEL MÁS ARRIBA QUE EL RESTO (20/08/2026) ═══
//
// El dueño: *"habilitame q los q son «directores» tengan la posibilidad de crear usuarios y
// contraseñas"*. Crear usuarios ya lo podían: el portón de las acciones acepta el NIVEL
// Administración, que agrupa `direccion` y `administracion`. Regenerar una contraseña se cierra un
// escalón más arriba, y no por gusto:
//
// **QUIEN PUEDE PONERLE LA CLAVE A ALGUIEN, PUEDE ENTRAR COMO ESE ALGUIEN.** No es «resetear un
// dato»: es la llave de esa persona, y con ella se ve exactamente lo que ve. Si `administracion`
// pudiera hacerlo, podría ponerle la clave a una cuenta de Dirección y entrar con ella — o sea,
// promoverse sin tocar un solo rol. `direccion` es el nivel más alto que existe, así que ahí ese
// camino no lleva a ningún lado nuevo.
//
// LÍMITE CONOCIDO, DECLARADO Y NO CORREGIDO ACÁ: ese mismo camino ya está abierto por otro lado.
// `motivoParaNoCambiarRol` no impide promover a otro a `direccion`, y el alta muestra la clave
// temporal en pantalla — así que hoy una cuenta `administracion` puede crear una cuenta de
// Dirección y entrar con ella. Cerrarlo es una decisión aparte (¿puede Administración crear
// Dirección?) y no se toma de costado en un cambio que pidió otra cosa. Hoy no hay una sola cuenta
// con rol `administracion` en producción, así que el camino existe en el código y no en la empresa.

export const SOLO_DIRECCION_CLAVE =
  'Sólo Dirección puede regenerar contraseñas: quien pone una clave puede entrar con ella.'

/**
 * El motivo por el que este actor NO puede regenerar contraseñas, o `null` si puede.
 *
 * Mira SÓLO el rol del que ejecuta, no el de la cuenta objetivo: entre cuentas de Dirección no hay
 * escalón que subir —es el techo— y bloquear «direccion sobre direccion» dejaría a la empresa sin
 * forma de destrabar a un director que perdió la clave, que es el caso real que originó esto.
 */
export function motivoParaNoRegenerarClave(rolActor: Rol | null | undefined): string | null {
  return rolActor === 'direccion' ? null : SOLO_DIRECCION_CLAVE
}

/** El motivo por el que NO se puede pasar esta cuenta a `rolNuevo`, o `null` si se puede. */
export function motivoParaNoCambiarRol(c: CuentaEnJuego, rolNuevo: Rol): string | null {
  if (c.actorId === c.objetivoId) {
    return 'No podés cambiarte el rol a vos mismo. Pediselo a otra persona de Administración.'
  }
  // Bajar de nivel al último administrador deja el sistema sin administradores igual que apagarlo:
  // la puerta es la misma y por eso el motivo también.
  if (veEconomia(c.rolActual) && !veEconomia(rolNuevo) && c.adminsActivos <= 1) return ULTIMO_ADMIN
  return null
}

/**
 * EL ÚLTIMO INGRESO, DICHO EN LA HORA DE LA EMPRESA.
 *
 * `null` cuando la cuenta NUNCA entró. Es un dato, no un hueco: una invitación que nadie usó y una
 * cuenta que entra todos los días son dos situaciones opuestas, y un guión las iguala. La pantalla
 * lo escribe («nunca ingresó»).
 *
 * El formato sale de `cuandoCorto`, que fija la zona horaria a la de San Juan y no a la del proceso
 * —Vercel corre en UTC, tres horas adelante—. Se IMPORTA en vez de reescribirse: dos definiciones de
 * «hoy» en el mismo sistema es exactamente el defecto que la zona fija viene a evitar.
 */
export function ultimoIngresoDicho(iso: string | null, ahora = new Date()): string | null {
  if (!iso) return null
  return cuandoCorto(iso, ahora)
}

/**
 * ¿ENTRA A TODAS LAS OBRAS SIN NECESIDAD DE `usuario_obra`?
 *
 * Es el espejo en TypeScript de `public.ve_obra()`: Dirección, Administración y —desde
 * `20260819T4600_el_jefe_de_obra_ve_y_opera_todas_las_obras.sql`— el jefe de obra. Cualquier otro
 * rol ve sólo las obras vinculadas.
 *
 * ═══ POR QUÉ NO SE PREGUNTA POR EL «ÁREA» ═══
 *
 * La pantalla de cuentas decidía esto con `areaDe(rol) === 'administracion'`, y hoy ACIERTA por
 * casualidad: `areaDe` mete al jefe de obra en Administración porque es el área de NAVEGACIÓN —qué
 * pantallas abre—, no el alcance de obra. Son dos preguntas distintas que hoy dan la misma
 * respuesta; el día que una de las dos cambie, la pantalla va a afirmar un permiso que la base no
 * da, y nadie se va a enterar hasta que alguien no vea una obra que creía tener.
 */
export function veTodasLasObras(rol: Rol | null | undefined): boolean {
  return rol === 'direccion' || rol === 'administracion' || rol === 'jefe_obra'
}
