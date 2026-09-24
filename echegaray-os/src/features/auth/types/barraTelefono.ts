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
  icono: 'obra' | 'lista' | 'plano' | 'avance' | 'llave' | 'casa' | 'tarea' | 'gente'
  /** Rutas que encienden este ítem además de su `href` (por prefijo). */
  enciende?: readonly string[]
}

const CAMPO: ItemBarraTelefono = { clave: 'campo', href: '/campo', label: 'Trabajo', icono: 'obra' }
const ADMIN: ItemBarraTelefono = {
  clave: 'administracion', href: '/administracion', label: 'Admin.', icono: 'lista',
  // Las mismas rutas que encienden la solapa Administración del header (`navegacion.ts`).
  enciende: ['/clientes', '/presupuestos', '/documentos', '/integraciones', '/mi-cuenta'],
}
const OBRAS: ItemBarraTelefono = { clave: 'obras', href: '/obras', label: 'Obras', icono: 'plano' }
const ANALITICAS: ItemBarraTelefono = { clave: 'analiticas', href: '/analiticas', label: 'Datos', icono: 'avance' }
// En el teléfono Herramientas ES la versión de campo: el middleware desvía `/herramientas/*` igual,
// pero ir derecho ahorra el rebote.
const HERRAMIENTAS: ItemBarraTelefono = {
  clave: 'herramientas', href: '/campo/herramientas', label: 'Herram.', icono: 'llave', enciende: ['/herramientas', '/h'],
}
// EL JEFE DE OBRA TIENE UNA SOLA BARRA EN TODO EL TELÉFONO (dueño, 24/09/2026: «hay mezclas entre
// pantallas y usuarios»). Antes veía Hoy · Tareas · Avance · Gente dentro de Mi obra y otra distinta
// (Mi obra · Trabajo · Admin. · Obras · Herram.) apenas salía: la barra cambiaba entera según dónde
// tocara. Ahora es la de J01 en todos lados. Trabajo, Herramientas y Material cuelgan de Hoy; la carga
// de asistencia enciende Gente, que es donde el jefe la busca.
const JEFE: ItemBarraTelefono[] = [
  { clave: 'jefe-hoy', href: INICIO_JEFE_TELEFONO, label: 'Hoy', icono: 'casa', enciende: ['/obra/avance-masivo', '/obra/frente', '/obra/efectivo', '/campo'] },
  { clave: 'jefe-tareas', href: '/obra/tareas', label: 'Tareas', icono: 'tarea' },
  { clave: 'jefe-avance', href: '/obra/avance', label: 'Avance', icono: 'avance' },
  { clave: 'jefe-gente', href: '/obra/personas', label: 'Gente', icono: 'gente', enciende: ['/administracion/personas/asistencia'] },
]

/**
 * QUÉ BARRA VE CADA NIVEL EN EL TELÉFONO dentro de las pantallas de escritorio.
 *
 * - Dirección y Administración: Campo · Admin. · Obras · Herram. · Datos (Herramientas antes, dueño 23/09)
 * - Jefe de obra: Hoy · Tareas · Avance · Gente, la misma de J01 en todas las pantallas.
 * - Empleado, cliente o sin perfil: NINGUNA. El empleado tiene la suya en `/hoy`; sin perfil se
 *   falla cerrado, igual que `solapasDeNav`.
 */
export function barraTelefonoDe(rol: Rol | null | undefined): ItemBarraTelefono[] {
  if (rol === 'direccion' || rol === 'administracion') return [CAMPO, ADMIN, OBRAS, HERRAMIENTAS, ANALITICAS]
  if (rol === 'jefe_obra') return JEFE
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
