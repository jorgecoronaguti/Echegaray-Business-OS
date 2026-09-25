// LA BARRA DE ABAJO DEL TELÉFONO PARA QUIEN ADMINISTRA (dueño, 23/09/2026: «hacé todas las vistas
// mobile por nivel de usuario»).
//
// El empleado y el jefe ya tenían su barra (Hoy · Trabajo · Horas · Yo; Hoy · Tareas · Avance ·
// Gente). Dirección, Administración y el jefe cuando entra a las pantallas de escritorio NO tenían
// nada: en el celular navegaban con las solapas de 13px del header, que a 390 se corren de costado.
// Esta barra pone los cinco destinos del nivel bajo el pulgar. Es lógica pura y probada con
// `node --test`: qué ve cada rol y cuál se enciende.
//
// NO ES UNA CERRADURA: el middleware y RLS siguen decidiendo qué abre cada uno. La barra sólo ofrece
// lo que ese rol ya puede abrir (mismas rutas que `solapasDeNav`, más Campo, que es donde se opera).

import type { Rol } from './index'
import { INICIO_JEFE_TELEFONO } from '../../../shared/auth/areas.ts'

export interface ItemBarraTelefono {
  clave: string
  href: string
  label: string
  /** Nombre del icono del set del teléfono (`shared/components/movil/Iconos.tsx`). */
  icono: 'obra' | 'lista' | 'plano' | 'avance' | 'llave' | 'casa' | 'tarea' | 'gente' | 'pedido' | 'mas' | 'reloj'
  /** Rutas que encienden este ítem además de su `href` (por prefijo). */
  enciende?: readonly string[]
}

// EL JEFE DE OBRA TIENE UNA SOLA BARRA EN TODO EL TELÉFONO (dueño, 24/09/2026: «hay mezclas entre
// pantallas y usuarios»). Antes veía Hoy · Tareas · Avance · Gente dentro de Mi obra y otra distinta
// (Mi obra · Trabajo · Admin. · Obras · Herram.) apenas salía: la barra cambiaba entera según dónde
// tocara. Ahora es la de J01 en todos lados. Trabajo, Herramientas y Material cuelgan de Hoy; la carga
// de asistencia enciende Gente, que es donde el jefe la busca.
const JEFE: ItemBarraTelefono[] = [
  { clave: 'jefe-hoy', href: INICIO_JEFE_TELEFONO, label: 'Hoy', icono: 'casa', enciende: ['/obra/avance-masivo', '/obra/frente', '/obra/efectivo', '/campo', '/obras/hoy'] },
  { clave: 'jefe-tareas', href: '/obra/tareas', label: 'Tareas', icono: 'tarea' },
  { clave: 'jefe-avance', href: '/obra/avance', label: 'Avance', icono: 'avance' },
  // Personal entero (Plantel, Horas, Cargar asistencia) enciende Gente desde el 24/09/2026: es donde el
  // jefe lo busca, y dentro de Personal ninguna otra de las cuatro le corresponde.
  { clave: 'jefe-gente', href: '/obra/personas', label: 'Gente', icono: 'gente', enciende: ['/administracion/personas'] },
]

// EL OPERARIO, FUERA DE SU APP (24/09/2026). Su barra vive en `ShellEmpleado`; ésta es la MISMA para
// las pocas pantallas de escritorio que abre (su perfil y su contraseña en `/mi-cuenta`), que hasta hoy
// lo dejaban sin barra y sin otra salida que el «atrás» del navegador.
const OPERARIO: ItemBarraTelefono[] = [
  { clave: 'op-hoy', href: '/hoy', label: 'Hoy', icono: 'casa' },
  { clave: 'op-trabajo', href: '/mi-trabajo', label: 'Trabajo', icono: 'tarea' },
  { clave: 'op-horas', href: '/mi-informacion/horas', label: 'Horas', icono: 'reloj' },
  { clave: 'op-yo', href: '/mi-informacion', label: 'Yo', icono: 'gente', enciende: ['/mi-cuenta'] },
]

// ADMINISTRACIÓN EN EL TELÉFONO: UNA BARRA DE GESTIÓN (dueño, 24/09/2026, opción B: «Obras · Personal
// · Compras · Datos · Más, con las pantallas de escritorio adaptadas»). Reemplaza a Trabajo · Admin. ·
// Obras · Herram. · Datos, que mezclaba la pantalla del jefe con la de gestión. Lo que no entra en
// cuatro va en «Más» (`/mas`): Clientes, Presupuestos, Impuestos, Herramientas, Trabajo y la cuenta.
// LA SECCIÓN SE LLAMA «ANALÍTICAS» PARA TODOS (dueño, 24/09/2026: «siempre es analíticas para todos los usuarios, no te habilité a hacer el cambio de ponerle datos»).
const GESTION: ItemBarraTelefono[] = [
  { clave: 'obras', href: '/obras', label: 'Obras', icono: 'plano' },
  { clave: 'personal', href: '/administracion/personas', label: 'Personal', icono: 'gente', enciende: ['/administracion/asistencia'] },
  { clave: 'compras', href: '/administracion/compras', label: 'Compras', icono: 'pedido', enciende: ['/administracion/proveedores'] },
  { clave: 'analiticas', href: '/analiticas', label: 'Analíticas', icono: 'avance' },
  {
    clave: 'mas', href: '/mas', label: 'Más', icono: 'mas',
    enciende: ['/clientes', '/presupuestos', '/administracion/impuestos', '/administracion/usuarios', '/herramientas', '/h', '/campo', '/mi-cuenta', '/documentos', '/integraciones'],
  },
]

/**
 * QUÉ BARRA VE CADA NIVEL EN EL TELÉFONO dentro de las pantallas de escritorio.
 *
 * - Dirección y Administración: Obras · Personal · Compras · Analíticas · Más (dueño 24/09, opción B; «Analíticas», nunca «Datos»).
 * - Jefe de obra: Hoy · Tareas · Avance · Gente, la misma de J01 en todas las pantallas.
 * - Empleado: la de su app (Hoy · Trabajo · Horas · Yo), para cuando abre `/mi-cuenta` (24/09/2026).
 * - Cliente o sin perfil: NINGUNA; se falla cerrado, igual que `solapasDeNav`.
 */
export function barraTelefonoDe(rol: Rol | null | undefined): ItemBarraTelefono[] {
  if (rol === 'direccion' || rol === 'administracion') return GESTION
  if (rol === 'jefe_obra') return JEFE
  if (rol === 'campo') return OPERARIO
  return []
}

/** Cuál está encendido para esta ruta. `/campo/herramientas` enciende Herramientas, no Campo. */
export function itemActivoDeBarra(pathname: string | null | undefined, items: readonly ItemBarraTelefono[]): string | null {
  const ruta = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/'
  const dentroDe = (base: string) => ruta === base || ruta.startsWith(`${base}/`)
  // El href MÁS LARGO gana: `/campo/herramientas` antes que `/campo`.
  const candidatos = items.filter((i) => dentroDe(i.href) || (i.enciende?.some(dentroDe) ?? false))
  if (candidatos.length === 0) return null
  return [...candidatos].sort((a, b) => b.href.length - a.href.length)[0].clave
}
