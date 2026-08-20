import { z } from 'zod'

// Perfil — rol real del usuario autenticado (PR5). El alta de perfil (asignación de
// rol) se hace manualmente por Jorge en Supabase, no vía signup -- así nadie se
// autoasigna 'direccion'. Ver supabase/migrations/20260708121545_login_roles.sql
export type Rol = 'direccion' | 'administracion' | 'jefe_obra' | 'campo'

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
  campo: 'Campo',
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
export const CAMPO_RUTAS_PERMITIDAS = ['/integraciones/pedidos-materiales', '/integraciones/herramientas', '/integraciones/movimientos', '/campo', '/descargas', '/mi-cuenta']
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
  '/descargar', // la landing de descarga de la extensión: estática, sin dato de la empresa
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
