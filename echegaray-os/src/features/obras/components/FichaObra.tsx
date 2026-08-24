// LA COLUMNA DE CONTEXTO DEL RESUMEN — qué obra es y si se está reportando.
//
// Vive al lado de `TabResumen` y no adentro por tamaño: con la curva «real vs esperado» que pide el
// Design canónico 02, ese archivo pasaba las 500 líneas del repo. La partición no es arbitraria —
// éstas son las dos piezas del ASIDE, las únicas que no hablan de cómo VIENE la obra sino de qué es.

import Link from 'next/link'
import { Nulo, Num } from '@/shared/components/ds'
import { Tarjeta, CabeceraTarjeta, Chevron } from './TarjetaResumen'
import type { ObraPanel, ParteEjecucion, PlanVsReal } from '@/features/obras/types'
import { fecha } from './formato'

/**
 * LA FICHA DEL ASIDE — qué obra es ésta.
 *
 * El canónico 02 la enmarca y le pone el rótulo a la IZQUIERDA con ancho fijo y el valor pegado a
 * continuación, no alineado a derecha. La alineación a derecha hacía que seis valores de largo
 * distinto arrancaran cada uno en una columna distinta, y el ojo tenía que buscar el principio de
 * cada uno. Con el rótulo de ancho fijo, todos los valores empiezan en el mismo x.
 */
function FilaFicha({ k, v, href }: { k: string; v: React.ReactNode; href?: string }) {
  const cuerpo = (
    <>
      <span className="w-[92px] shrink-0 text-[11.5px] text-muted">{k}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{v}</span>
      {href && <Chevron />}
    </>
  )
  return (
    <li className="border-b border-surface-sunken last:border-b-0">
      {href
        ? <Link href={href} className="flex items-center gap-2.5 py-[7px] transition-colors hover:bg-surface-quiet">{cuerpo}</Link>
        : <div className="flex items-center gap-2.5 py-[7px]">{cuerpo}</div>}
    </li>
  )
}

export function Ficha({ obra, plan }: { obra: ObraPanel; plan: PlanVsReal | null }) {
  const filas: { k: string; v: React.ReactNode; href?: string }[] = [
    { k: 'Cliente', v: obra.cliente_nombre ?? obra.cliente_texto ?? <Nulo>sin cliente declarado</Nulo> },
    { k: 'Responsable', v: obra.jefe_obra ?? <Nulo>sin jefe de obra</Nulo>, href: `/obras/${obra.obra_id}?vista=personal` },
    {
      k: 'Actividades',
      v: obra.n_actividades > 0 ? <Num>{obra.n_actividades}</Num> : <Nulo>sin cronograma</Nulo>,
      href: `/obras/${obra.obra_id}?vista=tareas`,
    },
    {
      k: 'Línea base',
      v: plan?.actividades_con_baseline
        ? <Num>{plan.actividades_con_baseline} selladas</Num>
        : <Nulo>sin sellar</Nulo>,
      href: `/obras/${obra.obra_id}?vista=tareas&sub=gantt`,
    },
    { k: 'Inicio real', v: obra.fecha_inicio_real ? <Num>{fecha(obra.fecha_inicio_real)}</Num> : <Nulo>sin arrancar</Nulo> },
    { k: 'Carpeta Drive', v: obra.drive_carpeta_id ? 'vinculada' : <Nulo>sin vincular</Nulo>, href: `/obras/${obra.obra_id}?vista=documentos` },
  ]
  return (
    <Tarjeta testid="ficha-obra">
      <CabeceraTarjeta titulo="La obra" />
      <ul className="px-4 pb-2 pt-1">
        {filas.map((f) => <FilaFicha key={f.k} {...f} />)}
      </ul>
    </Tarjeta>
  )
}

/**
 * ÚLTIMO MOVIMIENTO — la señal de si la obra se está reportando.
 *
 * Publicaba UN parte en una oración corrida. Un solo evento no dice si la obra se reporta: dice que
 * alguna vez alguien cargó algo. El canónico 02 pide cuatro, cada uno en dos renglones —qué pasó en
 * tinta, cuándo y quién en faint—, que es lo que deja ver el RITMO: cuatro partes de hoy y ayer
 * cuentan una historia distinta a cuatro partes repartidos en tres semanas.
 */
export function UltimoMovimiento({ partes, actividadDe, obraId }: {
  partes: ParteEjecucion[]; actividadDe: Map<string, string>; obraId: string
}) {
  const ultimos = partes.slice(0, 4)
  const cantidad = (p: ParteEjecucion) =>
    p.cantidad != null
      ? `+${p.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
      : p.avance_pct != null ? `+${p.avance_pct}%` : 'sin cantidad'
  return (
    <Tarjeta testid="ultimo-movimiento">
      <CabeceraTarjeta
        icono={
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" />
          </svg>
        }
        titulo="Último movimiento"
        accion={
          <Link href={`/obras/${obraId}?vista=ejecucion`} className="text-[11.5px] text-muted hover:text-ink">
            Ver todo →
          </Link>
        }
      />
      {ultimos.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-faint" data-nulo="">Ningún parte cargado todavía.</p>
      ) : (
        <ul className="px-4 pb-2 pt-1">
          {ultimos.map((p) => (
            <li key={p.id} className="border-b border-surface-sunken py-2 last:border-b-0">
              <div className="truncate text-[12px] text-ink">
                Parte · {cantidad(p)} en {actividadDe.get(p.actividad_id) ?? 'una actividad archivada'}
              </div>
              <div className="mt-px truncate text-[11px] text-faint">
                {fecha(p.fecha)}{p.comentario ? ` · ${p.comentario}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
