'use client'

// LAS SOLAPAS DE MI CUENTA — nivel 2, con la regla amarilla del sistema.
//
// SIETE SOLAPAS Y CADA UNA ES UNA RUTA. El estado vive en la URL (regla 10 de UX_PRINCIPLES): «mirá
// mis horas de julio» se pasa como una dirección, y el botón «atrás» hace lo que se espera. Con el
// estado en el navegador, las siete serían la misma dirección y no habría nada que compartir.
//
// EL ORDEN NO ES ALFABÉTICO NI CASUAL: primero quién soy (Perfil), después lo que la empresa dice de
// mí (Mi legajo, Mis horas, Mis documentos) y al final el mantenimiento de la cuenta (Seguridad,
// Notificaciones, Sesiones). Un operario entra por las del medio y no tiene que cruzar «Sesiones»
// para llegar a sus horas.
//
// Se usa `Tabs` del design system y no una barra propia: dos formas de decir «dónde estoy» en la
// misma aplicación se aprenden dos veces y se aprenden mal.

import { usePathname } from 'next/navigation'
import { Tabs } from '@/shared/components/ds'

const SOLAPAS = [
  { href: '/mi-cuenta', label: 'Perfil' },
  { href: '/mi-cuenta/legajo', label: 'Mi legajo' },
  { href: '/mi-cuenta/horas', label: 'Mis horas' },
  { href: '/mi-cuenta/documentos', label: 'Mis documentos' },
  { href: '/mi-cuenta/seguridad', label: 'Seguridad' },
  { href: '/mi-cuenta/notificaciones', label: 'Notificaciones' },
  { href: '/mi-cuenta/sesiones', label: 'Sesiones' },
] as const

export function NavMiCuenta() {
  const pathname = usePathname()
  return (
    <Tabs
      testid="nav-mi-cuenta"
      tabs={SOLAPAS.map((s) => ({
        href: s.href,
        label: s.label,
        // Perfil es la raíz: con `startsWith` se encendería en las siete. Las demás sí usan prefijo
        // para que una subpantalla futura no apague la solapa que llevó hasta ella.
        activo: s.href === '/mi-cuenta' ? pathname === s.href : pathname.startsWith(s.href),
        testid: `nav-mi-cuenta-${s.href.split('/').pop()}`,
      }))}
    />
  )
}
