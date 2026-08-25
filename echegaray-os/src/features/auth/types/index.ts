import { z } from 'zod'

// Perfil — rol real del usuario autenticado (PR5). El alta de perfil (asignación de
// rol) se hace manualmente por Jorge en Supabase, no vía signup -- así nadie se
// autoasigna 'direccion'. Ver supabase/migrations/20260708121545_login_roles.sql
// `cliente` es el primer rol EXTERNO: no es un empleado con menos permisos, es alguien de otra
// empresa. Vive confinado a /portal y las reglas están en features/portal/types.ts.
export type Rol = 'direccion' | 'administracion' | 'jefe_obra' | 'campo' | 'cliente'

export interface Perfil {
  id: string
  rol: Rol
  nombre: string
  created_at: string
  updated_at: string
}

export const ROL_LABEL: Record<Rol, string> = {
  direccion: 'Dirección',
  administracion: 'Administración',
  jefe_obra: 'Jefe de Obra',
  // «Empleado» y no «Campo» desde el 20/08/2026: es el nombre del PERFIL que el handoff diseñó, y
  // es como se llama a sí misma la persona que entra. La CLAVE sigue siendo `campo` —renombrarla
  // obligaría a migrar cada policy escrita contra ese literal— y esto es sólo cómo se escribe.
  campo: 'Empleado',
  // El único rol EXTERNO. Se escribe «Cliente» a secas: es como se presenta la persona y como lo
  // nombra el dueño («el cliente entra y ve su obra»).
  cliente: 'Cliente',
}

// Rutas que el rol 'campo' (operario) PUEDE ver en la web. Todo lo demás (caja, reportes,
// dirección…) queda fuera de su alcance. Se usa en el middleware y en el nav.
//
// ═══ `/mi-cuenta` ES DE TODOS (20/08/2026) ═══
//
// Sin esta entrada, el operario que toca su email en el header termina rebotado a `/campo` — y
// «Mis horas», «Mi legajo» y «Mis documentos» son precisamente las pantallas que existen PARA él:
// el resto del OS no le muestra una sola hora suya. Lo que ve ahí es sólo lo propio, acotado en la
// base por las vistas `mi_*` (20260820T3000), no por esta lista.
// ═══ EL PERFIL EMPLEADO ENTRA ACÁ (20/08/2026) ═══
//
// `/hoy`, `/mi-trabajo` y `/mi-informacion` son los TRES CONTEXTOS del perfil empleado. `/campo` y
// las tres pantallas de operación NO se sacan: son funcionalidad viva que el nivel campo usa hoy, y
// desde «Mi trabajo» se llega a todas. Retirar una ruta de la navegación es una cosa; sacarle el
// permiso, otra muy distinta.
//
// Y ESTO NO ES LA CERRADURA: lo que estas pantallas muestran lo deciden las vistas `mi_*`, que
// filtran por `mi_persona_id()` en la base.
// `/marca` va acá por lo mismo que ya está en RUTAS_PUBLICAS (18/08): el isotipo es una imagen,
// no una pantalla. Sin esta entrada el middleware redirigía `/marca/isotipo.png` a `/hoy` para todo
// usuario campo y el logo se veía ROTO en cada pantalla mobile del rol Empleado (QA del 21/08).
// ═══ LAS TRES DE LA RECUPERACIÓN SON DEL EMPLEADO ANTES QUE DE NADIE (21/08/2026) ═══
//
// SER PÚBLICA NO EXIME DEL RBAC DE CAMPO. El middleware aplica las dos reglas por separado: la lista
// blanca decide si hace falta sesión, y `esRutaCampoPermitida` decide qué abre el nivel campo CUANDO
// YA HAY una. Un operario con la sesión abierta en el teléfono —que es el estado normal: el OS no lo
// desloguea— que olvida la contraseña y abre el enlace del correo, cae en `/callback` CON sesión, y
// sin esta entrada el middleware lo manda a `/hoy` antes de que el canje ocurra. El enlace se quema,
// la contraseña sigue siendo la vieja, y no hay un solo error en ninguna pantalla.
//
// `/contrasena-nueva` es el final del mismo camino y no es pública —ahí ya hay sesión por
// definición—, así que sin la entrada pasa exactamente lo mismo un paso más tarde.
export const CAMPO_RUTAS_PERMITIDAS = ['/hoy', '/mi-trabajo', '/mi-informacion', '/integraciones/pedidos-materiales', '/integraciones/herramientas', '/integraciones/movimientos', '/campo', '/descargas', '/mi-cuenta', '/marca', '/recuperar', '/callback', '/contrasena-nueva']
export function esRutaCampoPermitida(pathname: string): boolean {
  return CAMPO_RUTAS_PERMITIDAS.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE PUEDE VER SIN HABER ENTRADO. TODO LO DEMÁS EXIGE SESIÓN.
//
// El middleware refrescaba la sesión y aplicaba el RBAC de campo, pero NUNCA exigía estar
// logueado: un anónimo pasaba entero. Casi todas las pantallas se salvaban de casualidad —el RLS
// de Supabase le devuelve vacío a `anon`— pero `/flujo-caja` no pasa por Supabase: lee el Sheet
// con una service account DESDE EL SERVIDOR, así que el RLS no aplica. Resultado verificado con
// `curl` sin cookies el 17/08/2026: HTTP 200 con importes y nombres de clientes reales.
//
// La lista es blanca a propósito. Una lista negra deja afuera la ruta que alguien agregue mañana,
// y el modo de fallar de una lista negra es publicar; el de una lista blanca, pedir login.
export const RUTAS_PUBLICAS = [
  '/login',
  '/signup',
  // ═══ LAS DOS MITADES DE LA RECUPERACIÓN (21/08/2026) ═══
  //
  // Quien pide recuperar la contraseña NO TIENE SESIÓN —ése es el problema que vino a resolver— y
  // quien vuelve del correo tampoco la tiene todavía: la sesión la crea el canje que hace
  // `/callback`. Exigir sesión en cualquiera de las dos es la misma trampa que ya se pagó con
  // `/api/oauth/start`: un 307 al login, silencioso, y la persona sigue afuera.
  '/recuperar',
  '/callback',
  // Y LA TERCERA MITAD (QA 21/08): `/contrasena-nueva` también llega SIN sesión cuando el enlace
  // venció o se abrió dos veces. Con sesión exigida, el middleware manda a /login ANTES de que la
  // página pueda decir «pedí otro enlace» — la página ya sabe explicarlo; hay que dejarla hablar.
  '/contrasena-nueva',
  '/descargar', // la landing de descarga de la extensión: estática, sin dato de la empresa
  '/api/oauth/start', // la ida a Google: la abre quien todavía NO autorizó — exigir sesión acá
                      // devolvía un 307 al login y el consentimiento no arrancaba nunca
  '/api/oauth/callback', // el retorno de Google: llega sin sesión por definición
  '/api/os', // el proxy que consume la extensión, con su propia autorización
  '/echegaray-os-extension.zip', // el archivo que descarga la landing pública: sin él, /descargar
                                 // renderiza 200 y su único botón manda al login
  // ═══ LA MARCA (18/08/2026) ═══
  //
  // El logo y el isotipo viven en `public/marca/`. El matcher del middleware sólo exceptúa
  // `_next/static`, así que TODO archivo de `public/` pasa por el guard de sesión — y el guard,
  // correctamente, lo mandaba al login. Efecto: la pantalla de login, que por definición no tiene
  // sesión, pedía su propio logo y recibía un 307 al login. Medido con curl:
  //
  //     /marca/logo.png → 307 text/plain 15b
  //
  // El typecheck y el build daban VERDE los dos: un 307 en una imagen no es un error de tipos ni de
  // compilación. Se vio mirando la captura, que es para lo que existe mirar la captura.
  //
  // Va como entrada de la lista BLANCA y no relajando el matcher: exceptuar "todo archivo con
  // extensión" abriría de una vez cualquier cosa que alguien deje caer en `public/` mañana, que es
  // exactamente el modo de fallar de una lista negra.
  '/marca', // el logotipo y el isotipo — la pantalla de login los necesita sin sesión
  '/icon.png', // el favicon que genera Next desde src/app/icon.png
  // ═══ LA PUERTA DEL PORTAL DEL CLIENTE (25/08/2026) ═══
  //
  // `30 · Portal Cliente Mobile` es la única pantalla del OS que abre alguien que NO trabaja acá, y
  // llega sin sesión por definición: lo que pide es el link que la crea. Sin esta entrada el
  // middleware la manda a `/login`, que es la pantalla de los empleados y le pide una contraseña
  // que el cliente no tiene ni va a tener.
  //
  // ES LA RUTA EXACTA, NO EL PREFIJO `/portal`: `esRutaPublica` compara con `pathname === r ||
  // pathname.startsWith(r + '/')`, así que poner `/portal` abriría `/portal` y `/portal/obra/…` —el
  // portal entero, con certificados e importes— a cualquier anónimo. Lo único público es pedir el
  // link. (Los dos frentes agregaron esta misma entrada por su lado; quedó UNA.)
  '/portal/ingresar',
]
export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

export const loginInputSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const signupInputSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  nombre: z.string().trim().min(1, 'Indicá tu nombre'),
})
export type SignupInput = z.infer<typeof signupInputSchema>

/** Pedir el correo de recuperación. Sólo el email: pedir algo más sería pedírselo a alguien que ya
 *  demostró que no se acuerda de nada. */
export const recuperarInputSchema = z.object({
  email: z.string().trim().email('Email inválido'),
})
export type RecuperarInput = z.infer<typeof recuperarInputSchema>

/** La contraseña nueva. Mismo mínimo que el alta y que «Mi cuenta»: tres mínimos distintos para la
 *  misma contraseña son dos reglas mintiendo. Y se pide dos veces por lo mismo que en Mi cuenta —un
 *  error de tipeo acá deja a la persona afuera, y afuera no puede entrar a arreglarlo. */
export const contrasenaNuevaInputSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  password2: z.string(),
}).refine((d) => d.password === d.password2, {
  message: 'Las dos contraseñas no coinciden',
  path: ['password2'],
})
export type ContrasenaNuevaInput = z.infer<typeof contrasenaNuevaInputSchema>
