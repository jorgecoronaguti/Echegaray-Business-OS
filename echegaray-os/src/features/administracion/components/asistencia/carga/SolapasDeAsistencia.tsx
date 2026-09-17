// UNA PUERTA A LA ASISTENCIA (dueño, 17/09/2026): «¿ahora tengo que cargar asistencia por ese botón? no
// entiendo la UX de computadora, ¿y mobile?». Personal tiene tres solapas —Plantel · Asistencia ·
// Liquidación— iguales en la compu y en el teléfono. Asistencia abre la carga del DÍA; la grilla de la
// QUINCENA es la otra cara de la misma solapa, para revisar y corregir. Un solo lugar, dos vistas.

import Link from 'next/link'
import { hrefCargaDeAsistencia } from '@/features/administracion/services/cargaDeAsistencia'

export const RUTA_PERSONAL = '/administracion/personas'
export const HREF_ASISTENCIA_QUINCENA = `${RUTA_PERSONAL}?vista=asistencia&modo=quincena`

/** Las tres solapas de Personal, en el formato de `CabeceraSeccion`. */
export function solapasDePersonal(activa: 'personal' | 'asistencia' | 'liquidacion', veLaPlata: boolean) {
  const vistas = [
    { clave: 'personal', titulo: 'Plantel', cuenta: null, activa: activa === 'personal', href: RUTA_PERSONAL },
    { clave: 'asistencia', titulo: 'Asistencia', cuenta: null, activa: activa === 'asistencia', href: hrefCargaDeAsistencia({}) },
  ]
  if (veLaPlata) vistas.push({ clave: 'liquidacion', titulo: 'Liquidación', cuenta: null, activa: activa === 'liquidacion', href: `${RUTA_PERSONAL}?vista=liquidacion` })
  return vistas
}

/** Día · Quincena: las dos caras de la solapa Asistencia. */
export function ModoDeAsistencia({ activo, obra, dia }: { activo: 'dia' | 'quincena'; obra?: string | null; dia?: string | null }) {
  const base = 'inline-flex min-h-[44px] items-center px-3 text-[12.5px] md:min-h-[34px]'
  const on = `${base} rounded-control bg-surface-sunken font-medium text-ink`
  const off = `${base} text-muted hover:text-ink`
  return (
    <span className="inline-flex items-center gap-1" role="tablist" aria-label="Vista de asistencia" data-testid="modo-asistencia">
      <Link prefetch={false} href={hrefCargaDeAsistencia({ obra: obra ?? undefined, dia: dia ?? undefined })} role="tab" aria-selected={activo === 'dia'} data-testid="modo-dia" className={activo === 'dia' ? on : off}>
        Día
      </Link>
      <Link prefetch={false} href={HREF_ASISTENCIA_QUINCENA} role="tab" aria-selected={activo === 'quincena'} data-testid="modo-quincena" className={activo === 'quincena' ? on : off}>
        Quincena
      </Link>
    </span>
  )
}
