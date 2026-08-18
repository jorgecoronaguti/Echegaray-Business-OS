'use client'

// LA NAVEGACIÓN DEL ÁREA OBRAS — el segundo y último nivel.
//
// ═══ POR QUÉ NO HAY UN TERCER NIVEL NI UN MENÚ LATERAL ═══
//
// El header global ya dibuja las dos ÁREAS (Administración · Obras). Esto es lo que hay adentro del
// área: seis vistas de la misma cartera. Y desde el Portafolio se entra a UNA obra, que tiene sus
// propias solapas. Nivel 1 = área, nivel 2 = vista. Un menú lateral nuevo sería una tercera barra
// compitiendo con las otras dos en un teléfono de 390px, que es el aparato del jefe de obra.
//
// Se reusa el patrón que ya existe en el workspace de la obra —línea de solapas, subrayado en el
// amarillo de la marca, desplazable— en vez de inventar uno: dos formas distintas de decir "dónde
// estoy" en la misma pantalla se aprenden dos veces y se aprenden mal.
//
// LAS SEIS VISTAS SE OFRECEN A LOS DOS NIVELES, y no es un descuido. Hasta el 19/08 las
// certificaciones eran de Administración; `20260819T1600_obras_opera_y_lo_comercial_no_viaja.sql`
// las abrió POR OBRA (`certificados_select … ve_obra(obra_canonica_id)`) con el criterio del dueño:
// *"lo que se certificó en la obra que dirijo es mi trabajo; lo que se certificó en las otras
// siete, no"*. Quién ve qué lo sigue decidiendo la base — acá no hay un solo `if` de permiso.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const VISTAS = [
  { href: '/obras', label: 'Portafolio' },
  { href: '/obras/cronograma', label: 'Cronograma' },
  { href: '/obras/personal', label: 'Personal' },
  { href: '/obras/operacion', label: 'Operación' },
  { href: '/obras/certificaciones', label: 'Certificaciones' },
  { href: '/obras/documentos', label: 'Documentos' },
] as const

export function NavObras() {
  const pathname = usePathname()
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line" data-testid="nav-vistas-obras">
      {VISTAS.map((v) => {
        const activa = pathname === v.href
        return (
          <Link
            key={v.href}
            href={v.href}
            data-testid={`nav-vistas-obras-${v.href.split('/')[2] ?? 'portafolio'}`}
            aria-current={activa ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
              activa ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >{v.label}</Link>
        )
      })}
    </nav>
  )
}

/**
 * EL FILTRO POR OBRA DE UNA LISTA GLOBAL — que no filtra la lista: LLEVA A LA OBRA.
 *
 * Es la decisión de diseño de estas pantallas y es deliberada. Filtrar acá dejaría media vista de
 * obra dentro de la vista global —sin su cronograma, sin sus impedimentos, sin sus acciones—, es
 * decir, una segunda versión peor de una pantalla que ya existe. La vista global contesta "¿dónde
 * está pasando esto?"; la respuesta detallada vive en la obra, en la solapa equivalente.
 */
export function FiltroObra({
  obras, vista, sub,
}: {
  obras: { id: string; nombre: string }[]
  /** La solapa equivalente del workspace: se entra donde uno estaba mirando, no al Resumen. */
  vista: string
  sub?: string
}) {
  const router = useRouter()
  if (!obras.length) return null
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted">
      <span className="shrink-0">Ir a la obra</span>
      <select
        data-testid="filtro-obra"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return
          router.push(`/obras/${e.target.value}?vista=${vista}${sub ? `&sub=${sub}` : ''}`)
        }}
        className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 text-[12px] text-ink"
      >
        <option value="">todas</option>
        {obras.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </label>
  )
}
