'use server'

// GESTIÓN DE USUARIOS — TODO LO QUE ESCRIBE.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// **ESCONDER UN BOTÓN NO ES SEGURIDAD.** La pantalla que llama a estas acciones ya se le muestra
// sólo a Administración, y eso no cuenta para nada: una acción de servidor es un endpoint HTTP con
// un identificador estable, y cualquiera con una sesión válida puede invocarla desde la consola del
// navegador sin abrir jamás la pantalla. Por eso TODAS las acciones —sin una sola excepción—
// arrancan por `soloAdministracion()`, que resuelve quién es el que llama desde la COOKIE, no desde
// el formulario. Un `usuario_id` que viene en el `FormData` es un dato del atacante.
//
// ═══ QUÉ ESCRIBE CADA COSA, Y CON QUÉ LLAVE ═══
//
//   auth.users     service role   crear la cuenta, cambiar email, bloquear/desbloquear
//   perfiles       service role   el rol — `perfiles` NO tiene policy de escritura, y no se le
//                                 agrega una: con `for update using (es_administracion())`, un
//                                 usuario de Administración podría promoverse a Dirección desde
//                                 PostgREST sin pasar por acá. La única puerta es el servidor.
//   usuario_obra   la SESIÓN      a propósito, pudiendo usar el service role: así la policy
//                                 `usuario_obra_write` es una SEGUNDA cerradura sobre la misma
//                                 escritura. Si mañana alguien afloja el control de rol de acá
//                                 arriba, la base sigue rechazando.
//
// ═══ LO QUE «DESACTIVAR» HACE DE VERDAD, Y HASTA DÓNDE LLEGA ═══
//
// Desactivar bloquea la identidad en el proveedor de auth (`ban_duration`). Medido contra la base
// real el 19/08/2026, con la cuenta de QA:
//
//     login antes del bloqueo      200 ok
//     bloqueo                      banned_until = 2126-07-25T14:37:55Z
//     login bloqueado              400 user_banned
//     refresh de sesión bloqueado  400 user_banned
//     lectura con el access token YA EMITIDO   200 — devuelve su obra
//
// La última línea es el límite y se declara: un JWT ya emitido lo valida PostgREST solo, contra la
// firma, sin preguntarle a nadie. Quien esté con la sesión abierta en el momento del bloqueo sigue
// leyendo lo suyo hasta que el token venza (una hora por defecto) y ahí no puede renovarlo. Cerrar
// esa hora exige que el RLS mire el bloqueo —`es_administracion()` y `ve_obra()` consultando
// `auth.users.banned_until`—, que es una migración sobre las dos funciones de las que cuelga TODO
// el acceso del sistema: se deja propuesta al dueño, no se aplica de costado.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Rol } from '@/features/auth/types'
import { veEconomia } from '@/features/auth/types/areas'
import type { UsuarioGestion } from '../types'
import { administradoresActivos, listarUsuarios } from './usuariosService'
import {
  motivoParaNoCambiarRol, motivoParaNoDesactivar, motivoParaNoRegenerarClave, ROLES_VALIDOS,
  type CuentaEnJuego,
} from './reglas'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }
/** El alta devuelve la clave temporal UNA vez: no se guarda en ningún lado ni se puede volver a ver. */
export type ResultadoAlta = { ok: boolean; error?: string; email?: string; clave?: string }
/** La regeneración devuelve lo mismo que el alta: una clave que se ve una vez y no se guarda. */
export type ResultadoClave =
  | { ok: true; email: string; clave: string; sinAcceso: boolean }
  | { ok: false; error: string }

const PATH = '/administracion/usuarios'

type Puerta =
  | { ok: true; admin: SupabaseClient; sesion: SupabaseClient; actorId: string }
  | { ok: false; error: string }

/**
 * QUIÉN LLAMA SE RESUELVE DESDE LA SESIÓN. `getUser()` valida el token contra el servidor de auth;
 * `getSession()` se conformaría con lo que traiga la cookie.
 *
 * DOS ALTURAS, UNA SOLA PUERTA. Casi todo exige el NIVEL Administración (`direccion` +
 * `administracion`); regenerar una contraseña exige `direccion` a secas, porque quien pone una
 * clave puede entrar con ella — el porqué completo está en `reglas.ts`. Se resuelve en la misma
 * función a propósito: dos funciones que leen la sesión por su cuenta se desincronizan el día que
 * una empiece a mirar algo que la otra no.
 */
async function puertaDe(exige: 'administracion' | 'direccion'): Promise<Puerta> {
  const sesion = await createClient()
  const { data } = await sesion.auth.getUser()
  if (!data.user) return { ok: false, error: 'Tenés que iniciar sesión.' }
  const { data: perfil } = await sesion.from('perfiles').select('rol').eq('id', data.user.id).maybeSingle()
  const rol = perfil?.rol as Rol | undefined
  // Sin perfil legible se niega: el modo de fallar de un default permisivo es repartir accesos.
  if (exige === 'direccion') {
    const motivo = motivoParaNoRegenerarClave(rol)
    if (motivo) return { ok: false, error: motivo }
  } else if (!veEconomia(rol)) {
    // NO ES `esAdministracion`: desde el 19/08 el jefe de obra administra los maestros, pero dar de
    // alta usuarios y cambiar roles es la puerta a la economía —bastaría con ascenderse—, y eso
    // sigue siendo de Dirección y Administración.
    return { ok: false, error: 'Sólo Dirección y Administración pueden gestionar los usuarios.' }
  }
  return { ok: true, admin: createAdminClient(), sesion, actorId: data.user.id }
}

const soloAdministracion = () => puertaDe('administracion')
const soloDireccion = () => puertaDe('direccion')

/** El contexto de las reglas: qué rol tiene hoy el objetivo y cuántos administradores quedan. */
async function cuentaEnJuego(
  admin: SupabaseClient, actorId: string, objetivoId: string,
): Promise<{ cuenta: CuentaEnJuego; usuario: UsuarioGestion } | null> {
  const { data } = await listarUsuarios(admin)
  const objetivo = data?.find((u) => u.id === objetivoId)
  if (!data || !objetivo) return null
  return {
    usuario: objetivo,
    cuenta: { actorId, objetivoId, rolActual: objetivo.rol, adminsActivos: administradoresActivos(data) },
  }
}

const rolSchema = z.custom<Rol>(
  (v) => typeof v === 'string' && (ROLES_VALIDOS as readonly string[]).includes(v),
  'Elegí un rol de la lista',
)
const nombreSchema = z.string().trim().min(2, 'El nombre es obligatorio').max(80)
const emailSchema = z.string().trim().email('Revisá el correo').max(160)

const altaSchema = z.object({ nombre: nombreSchema, email: emailSchema, rol: rolSchema })
const datosSchema = z.object({ nombre: nombreSchema, email: emailSchema })
const asignacionSchema = z.object({
  obra_canonica_id: z.string().trim().min(1, 'Elegí una obra'),
  papel: z.enum(['jefe', 'colaborador', 'lectura']).optional(),
})

function claveTemporal() {
  return 'Echegaray-' + Math.random().toString(36).slice(2, 8) + '!' + Math.floor(Math.random() * 90 + 10)
}

// ── ALTA ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Crea la cuenta y su perfil. La clave temporal se muestra una vez y no se guarda.
 *
 * NO se envía mail de invitación: `inviteUserByEmail` exige SMTP configurado y hoy no lo está, así
 * que una invitación se "mandaría" sin llegar nunca — el peor de los resultados, porque nadie se
 * entera de que falló. La clave en pantalla es explícita: alguien tiene que pasarla.
 */
export async function crearUsuario(_previo: ResultadoAlta, form: FormData): Promise<ResultadoAlta> {
  const parsed = altaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }
  const { nombre, email, rol } = parsed.data

  const clave = claveTemporal()
  const { data: creado, error } = await puerta.admin.auth.admin.createUser({
    email, password: clave, email_confirm: true,
  })
  if (error || !creado?.user) {
    // Reutilizar una cuenta existente cambiaría en silencio el rol de una persona real: se corta.
    return {
      ok: false,
      error: /already|registered|exists/i.test(error?.message ?? '')
        ? 'Ya existe una cuenta con ese correo. Editala desde la lista.'
        : (error?.message ?? 'No pude crear la cuenta.'),
    }
  }

  const { error: pErr } = await puerta.admin
    .from('perfiles').upsert({ id: creado.user.id, rol, nombre }, { onConflict: 'id' })
  // Una cuenta sin perfil entra igual, al nivel Obras: se deshace el alta en vez de dejarla a medias.
  if (pErr) {
    await puerta.admin.auth.admin.deleteUser(creado.user.id)
    return { ok: false, error: `No pude guardar el perfil, así que no creé la cuenta: ${pErr.message}` }
  }

  revalidatePath(PATH)
  return { ok: true, email, clave }
}

// ── CONTRASEÑA ──────────────────────────────────────────────────────────────────────────────────

/**
 * LE PONE UNA CLAVE NUEVA A UNA CUENTA QUE YA EXISTE, y la devuelve UNA vez.
 *
 * Existe porque hasta hoy no había ninguna forma de destrabar a alguien que perdió la suya: el
 * «olvidé mi contraseña» de Supabase manda un mail y este proyecto no tiene SMTP, así que el mail
 * se manda y no llega nunca. El único camino era entrar a Supabase a mano.
 *
 * `usuarioId` VIENE DEL NAVEGADOR Y NO SE LE CREE NADA: no decide el permiso —eso lo resolvió
 * `soloDireccion()` contra la cookie— y sólo dice a quién aplicarlo. Es exactamente el mismo trato
 * que reciben `cambiarRol` y `cambiarAcceso`.
 *
 * LA CLAVE NO SE GUARDA NI SE REGISTRA: se genera, viaja al que la pidió y se olvida. No hay
 * `console.log` en este camino ni lo puede haber — un log de servidor con contraseñas adentro es
 * una filtración que nadie mira hasta que alguien la mira.
 */
export async function regenerarClave(usuarioId: string): Promise<ResultadoClave> {
  const puerta = await soloDireccion()
  if (!puerta.ok) return { ok: false, error: puerta.error }

  const contexto = await cuentaEnJuego(puerta.admin, puerta.actorId, usuarioId)
  if (!contexto) return { ok: false, error: 'No encontré esa cuenta.' }
  const { usuario } = contexto
  if (!usuario.email) return { ok: false, error: 'Esa cuenta no tiene correo: no hay con qué entrar.' }

  const clave = claveTemporal()
  const { error } = await puerta.admin.auth.admin.updateUserById(usuarioId, { password: clave })
  if (error) return { ok: false, error: `No pude cambiar la clave: ${error.message}` }

  revalidatePath(PATH)
  // UNA CLAVE NUEVA NO DEVUELVE EL ACCESO, y hay que decirlo donde se lee la clave: entregarla sin
  // aclarar que la cuenta está bloqueada manda a la persona a probar tres veces y a llamar.
  return { ok: true, email: usuario.email, clave, sinAcceso: usuario.estado !== 'activo' }
}

// ── EDICIÓN ─────────────────────────────────────────────────────────────────────────────────────

export async function editarUsuario(usuarioId: string, form: FormData): Promise<Resultado> {
  const parsed = datosSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }

  const { error: aErr } = await puerta.admin.auth.admin.updateUserById(usuarioId, {
    email: parsed.data.email, email_confirm: true,
  })
  if (aErr) return { ok: false, error: aErr.message }

  // ═══ `upsert` ACÁ NO PODÍA FUNCIONAR NUNCA (19/08/2026) ═══
  //
  // El dueño, textual: *"quise poner mi nombre bien y no me dejo"*. La pantalla devolvía
  // `null value in column "rol" of relation "perfiles" violates not-null constraint`.
  //
  // La causa no era el permiso: era la FORMA de la escritura. `upsert` es `insert … on conflict do
  // update`, y Postgres valida los NOT NULL sobre la fila PROPUESTA **antes** de resolver el
  // conflicto. Como acá sólo viajaba `nombre`, la fila propuesta traía `rol` en `null` y la
  // restricción saltaba aunque el perfil existiera y el update fuera a ser inocuo. O sea que
  // cambiar el nombre de CUALQUIER cuenta estuvo roto desde siempre: nunca fue un caso borde.
  //
  // Un `update` no propone una fila nueva: toca las columnas que se le dan y deja el resto como
  // está. Es además lo que corresponde conceptualmente — editar un perfil que ya existe.
  //
  // EL `select` NO ES DECORACIÓN: un `update` que no encuentra la fila NO es un error, devuelve
  // cero filas. Sin pedir las filas afectadas, una cuenta sin perfil respondería "guardado" con el
  // nombre sin cambiar. Es la misma trampa que ya está anotada en `cambiarRol`.
  const { data: tocadas, error } = await puerta.admin
    .from('perfiles').update({ nombre: parsed.data.nombre }).eq('id', usuarioId).select('id')
  if (error) return { ok: false, error: enCastellano(error.message) }
  if (!tocadas?.length) {
    // El correo YA se cambió arriba: decir sólo "no se pudo" mentiría sobre lo que quedó hecho.
    return {
      ok: false,
      error: 'Cambié el correo, pero esa cuenta todavía no tiene perfil y por eso el nombre no se ' +
        'guardó. Asignale un rol y volvé a intentarlo.',
    }
  }
  revalidatePath(PATH)
  return { ok: true }
}

/**
 * EL ERROR DE LA BASE NO ES UN MENSAJE PARA UNA PERSONA. La captura del dueño mostraba
 * `null value in column "rol" of relation "perfiles" violates not-null constraint` en rojo, arriba
 * del botón Guardar: nombra una columna y una tabla que él no tiene por qué conocer, y no dice qué
 * hacer. El texto técnico se conserva en el log del servidor, que es donde sirve.
 */
function enCastellano(mensaje: string): string {
  console.error('[usuarios] fallo al guardar el perfil:', mensaje)
  return 'No pude guardar los datos. Quedó anotado el detalle técnico para revisarlo.'
}

export async function cambiarRol(usuarioId: string, form: FormData): Promise<Resultado> {
  const parsed = z.object({ rol: rolSchema }).safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }

  const enJuego = await cuentaEnJuego(puerta.admin, puerta.actorId, usuarioId)
  if (!enJuego) return { ok: false, error: 'Esa cuenta ya no existe.' }
  const motivo = motivoParaNoCambiarRol(enJuego.cuenta, parsed.data.rol)
  if (motivo) return { ok: false, error: motivo }

  // `upsert` y no `update`: una cuenta creada a mano en Supabase no tiene fila en `perfiles`, y un
  // `update` sobre cero filas no falla — devolvería "guardado" dejando el rol sin cambiar.
  const nombre = enJuego.usuario.nombre ?? enJuego.usuario.email ?? 'Sin nombre'
  const { error } = await puerta.admin
    .from('perfiles').upsert({ id: usuarioId, rol: parsed.data.rol, nombre }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// ── ACCESO ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Da o saca el acceso. `ban_duration` es el bloqueo nativo de auth: bloquea el login y la renovación
 * de la sesión. 100 años es "para siempre" — GoTrue no acepta una duración infinita.
 */
export async function cambiarAcceso(usuarioId: string, activar: boolean): Promise<Resultado> {
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }

  if (!activar) {
    const enJuego = await cuentaEnJuego(puerta.admin, puerta.actorId, usuarioId)
    if (!enJuego) return { ok: false, error: 'Esa cuenta ya no existe.' }
    const motivo = motivoParaNoDesactivar(enJuego.cuenta)
    if (motivo) return { ok: false, error: motivo }
  }

  const { error } = await puerta.admin.auth.admin.updateUserById(usuarioId, {
    ban_duration: activar ? 'none' : '876000h',
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// ── OBRAS ASIGNADAS — LO QUE CAMBIA EL ACCESO EFECTIVO ───────────────────────────────────────────
//
// Cada fila de `usuario_obra` es lo que `ve_obra()` consulta, y `ve_obra()` es lo que citan las
// policies de `obra_canonica`, `obra_actividad`, `obra_asignacion`, `obra_restriccion`,
// `obra_documento` y las cuatro tablas de Operación. Agregar una fila acá le abre a esa persona la
// obra entera en la BASE; sacarla se la cierra, tenga la pantalla abierta o no.

export async function asignarObra(usuarioId: string, form: FormData): Promise<Resultado> {
  const parsed = asignacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }

  const { error } = await puerta.sesion.from('usuario_obra').insert({
    usuario_id: usuarioId,
    obra_canonica_id: parsed.data.obra_canonica_id,
    papel: parsed.data.papel ?? 'jefe',
  })
  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'Esa obra ya está asignada a esta persona.' : error.message,
    }
  }
  revalidatePath(PATH)
  return { ok: true }
}

export async function quitarObra(usuarioId: string, asignacionId: string): Promise<Resultado> {
  const puerta = await soloAdministracion()
  if (!puerta.ok) return { ok: false, error: puerta.error }
  // El `eq('usuario_id')` no sobra: sin él, un id de asignación ajeno borraría el acceso de otro.
  const { error } = await puerta.sesion
    .from('usuario_obra').delete().eq('id', asignacionId).eq('usuario_id', usuarioId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}
