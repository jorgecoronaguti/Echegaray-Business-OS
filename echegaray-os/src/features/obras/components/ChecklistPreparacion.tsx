// EL CHECKLIST DE PREPARACIÓN — una lista, y nada más que una lista.
//
// ═══ POR QUÉ ES UN COMPONENTE DE SERVIDOR QUE LEE SOLO ═══
//
// Se dibuja en dos lugares —al terminar el alta y en el Resumen de la obra— y en los dos tiene que
// decir exactamente lo mismo. Si los insumos llegaran por props, cada pantalla tendría que armarlos,
// y el día que una se olvide de una consulta el checklist diría dos verdades distintas de la misma
// obra. Es la misma familia de defecto que las DOS definiciones de la deuda en Proveedores. Acá la
// lectura es UNA, vive pegada al componente, y ninguna pantalla puede pasarle números propios.
//
// ═══ LO QUE NO TIENE, A PROPÓSITO ═══
//
// Ni porcentaje de preparación, ni barra, ni semáforo de tres colores, ni una tarjeta por línea.
// *"Esto NO es un dashboard. Es un checklist operativo de preparación."* Un ✓ y un rótulo
// «Pendiente» alcanzan para saber qué hacer; lo demás es decoración que compite con el trabajo.
//
// ═══ EL ROL SE RESUELVE ACÁ, Y FALLA AL NIVEL MENOS PRIVILEGIADO ═══
//
// Un perfil ilegible cae en «Obras» (`esAdministracion(null) === false`), o sea: ante la duda, la
// línea de Contrato NO se dibuja. El modo de fallar de un default permisivo sería publicar el
// estado del contrato a quien no debe verlo; el de éste, esconderle una línea a quien sí.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getPreparacion } from '../services/preparacionService'
import { loQueFalta, preparacionDeObra, type LineaPreparacion } from '../services/preparacion'

function Fila({ l }: { l: LineaPreparacion }) {
  return (
    <li data-testid={`preparacion-${l.clave}`} data-listo={l.listo ? 'si' : 'no'}>
      <Link
        href={l.href}
        className="flex items-baseline gap-2.5 px-4 py-2 text-[13px] hover:bg-surface-quiet"
      >
        <span
          aria-hidden
          className={`w-3 shrink-0 text-center ${l.listo ? 'text-pos' : 'text-faint'}`}
        >{l.listo ? '✓' : '·'}</span>
        <span className="w-[104px] shrink-0 text-muted">{l.titulo}</span>
        <span className={`min-w-0 flex-1 ${l.listo ? 'text-faint' : 'text-ink'}`}>{l.detalle}</span>
        {/* La flecha sólo donde hay trabajo: en una línea ya resuelta sería una invitación a nada. */}
        <span className="shrink-0 text-faint">{l.listo ? '' : '›'}</span>
      </Link>
    </li>
  )
}

export async function ChecklistPreparacion({
  obraId,
  plegado = false,
  ocultarSiCompleto = false,
}: {
  obraId: string
  /** En el Resumen va cerrado: explica los guiones de la pantalla, no compite con ellos. */
  plegado?: boolean
  /** Cuando no falta nada, la lista deja de existir. Un checklist entero en ✓ no es información. */
  ocultarSiCompleto?: boolean
}) {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // EL CONTRATO ES PRECIO. El jefe de obra administra su obra y ve su costo; cuánto se vendió, no.
  const verContrato = veEconomia(perfil.data?.rol ?? null)

  const { insumos, error } = await getPreparacion(supabase, obraId, verContrato)
  // NO SE INVENTA UN CHECKLIST VACÍO CUANDO LA LECTURA FALLA. Siete líneas en «pendiente» por un
  // error de permisos mandarían a cargar de nuevo lo que ya está cargado.
  if (error || !insumos) {
    return (
      <p data-testid="checklist-error" className="text-[13px] text-neg">
        No pude leer el estado de preparación: {error ?? 'sin datos'}
      </p>
    )
  }

  const lineas = preparacionDeObra(insumos)
  const faltan = loQueFalta(lineas)
  if (ocultarSiCompleto && faltan.length === 0) return null

  const lista = (
    <ul
      data-testid="checklist-preparacion"
      className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
    >
      {lineas.map((l) => <Fila key={l.clave} l={l} />)}
    </ul>
  )

  const resumenTexto = faltan.length === 0
    ? 'Preparación completa'
    : `Preparación: ${faltan.length} de ${lineas.length} pendientes`

  if (!plegado) {
    return (
      <section data-testid="preparacion">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Estado de preparación
        </h2>
        {lista}
      </section>
    )
  }

  return (
    <details data-testid="preparacion" className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted" data-testid="preparacion-abrir">
        {resumenTexto} <span className="text-faint">· {faltan.map((f) => f.titulo).join(', ')}</span>
      </summary>
      <div className="border-t border-line p-3">{lista}</div>
    </details>
  )
}
