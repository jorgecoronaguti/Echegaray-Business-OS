// LA COLUMNA DE CONTEXTO DEL RESUMEN — qué obra es y si se está reportando.
//
// Vive al lado de `TabResumen` y no adentro por tamaño: con la curva «real vs esperado» que pide el
// Design canónico 02, ese archivo pasaba las 500 líneas del repo. La partición no es arbitraria —
// éstas son las dos piezas del ASIDE, las únicas que no hablan de cómo VIENE la obra sino de qué es.

import Link from 'next/link'
import { Eyebrow, Nulo, Num } from '@/shared/components/ds'
import type { ObraPanel, ParteEjecucion, PlanVsReal } from '@/features/obras/types'
import { fecha } from './formato'

/** La ficha del aside: rótulo a la izquierda, valor a la derecha, sin recuadro. */
export function Ficha({ obra, plan }: { obra: ObraPanel; plan: PlanVsReal | null }) {
  const filas: { k: string; v: React.ReactNode }[] = [
    { k: 'Cliente', v: obra.cliente_nombre ?? obra.cliente_texto ?? <Nulo>sin cliente declarado</Nulo> },
    { k: 'Responsable', v: obra.jefe_obra ?? <Nulo>sin jefe de obra</Nulo> },
    { k: 'Actividades', v: obra.n_actividades > 0 ? <Num>{obra.n_actividades}</Num> : <Nulo>sin cronograma</Nulo> },
    {
      k: 'Línea base',
      v: plan?.actividades_con_baseline
        ? <Num>{plan.actividades_con_baseline} selladas</Num>
        : <Nulo>sin sellar</Nulo>,
    },
    { k: 'Inicio real', v: obra.fecha_inicio_real ? <Num>{fecha(obra.fecha_inicio_real)}</Num> : <Nulo>sin arrancar</Nulo> },
    { k: 'Carpeta Drive', v: obra.drive_carpeta_id ? 'vinculada' : <Nulo>sin vincular</Nulo> },
  ]
  return (
    <div className="border-t border-[#EFEEEA] pt-3.5">
      <Eyebrow className="mb-3">La obra</Eyebrow>
      <dl className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[12px] text-muted">{f.k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-ink">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** El último parte cargado, en una oración. Es la señal de si la obra se está reportando. */
export function UltimoMovimiento({ partes, actividadDe, obraId }: {
  partes: ParteEjecucion[]; actividadDe: Map<string, string>; obraId: string
}) {
  const p = partes[0] ?? null
  return (
    <div className="border-t border-[#EFEEEA] pt-3.5">
      <Eyebrow className="mb-2.5">Último movimiento</Eyebrow>
      {p == null ? (
        <p className="text-[13px] text-muted">Ningún parte cargado todavía.</p>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink">
          Parte del <Num>{fecha(p.fecha)}</Num>
          {': '}
          {p.cantidad != null
            ? `+${p.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} `
            : p.avance_pct != null ? `+${p.avance_pct}% ` : ''}
          en {actividadDe.get(p.actividad_id) ?? 'una actividad archivada'}
          {p.comentario ? `. ${p.comentario}` : '.'}
        </p>
      )}
      <Link href={`/obras/${obraId}?vista=ejecucion`} className="mt-2.5 inline-block text-[12px] text-muted hover:text-ink">
        Ir a Ejecución →
      </Link>
    </div>
  )
}
