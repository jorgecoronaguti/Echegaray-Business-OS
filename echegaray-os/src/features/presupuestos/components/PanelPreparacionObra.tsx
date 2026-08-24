'use client'

// 13 · LA COLUMNA DERECHA — la obra que va a nacer, lo que falta, y lo que se lleva el plan.
//
// 372px, las tres tarjetas del canónico en ese orden: primero la obra (¿es ésta?), después lo que
// falta (¿puedo?), y al final el resumen de lo elegido (¿qué queda?). El orden importa: el resumen
// arriba invita a apretar antes de mirar si el presupuesto está congelado.
//
// ═══ NINGUNA DE LAS TRES INVENTA UN DATO ═══
//
// Un campo que la obra no tiene se dibuja con su palabra en ámbar —«sin asignar», «sin vincular»—
// y NO con un guión ni con un cero. Es la misma distinción que hace `ChecklistPreparacion` del alta
// de obra: lo que falta es trabajo de alguien, no un espacio en blanco.

import Link from 'next/link'
import {
  IconoCliente, IconoCompletar, IconoDinero, IconoDocumento, IconoFecha, IconoObra, IconoPersona,
  IconoProblema,
} from '@/shared/components/iconos'
import type { ItemChecklist, ResumenDelPlan } from '../services/preparacionObra'
import { hh as fHH, plata } from '../services/formato'

export interface ObraDelPlan {
  id: string | null
  nombre: string | null
  cliente: string | null
  jefeObra: string | null
  inicio: string | null
  fin: string | null
  montoContratado: number | null
  driveCarpeta: string | null
}

const fecha = (iso: string | null) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

type CampoFicha = { clave: string; icono: React.ReactNode; rotulo: string; valor: string | null; falta: string }

function camposDeLaObra(o: ObraDelPlan): CampoFicha[] {
  const ic = 'h-[15px] w-[15px]'
  return [
    { clave: 'nombre', icono: <IconoObra className={ic} />, rotulo: 'Nombre', valor: o.nombre, falta: 'sin obra vinculada' },
    { clave: 'cliente', icono: <IconoCliente className={ic} />, rotulo: 'Cliente', valor: o.cliente, falta: 'sin cliente' },
    { clave: 'jefe', icono: <IconoPersona className={ic} />, rotulo: 'Jefe de obra', valor: o.jefeObra, falta: 'sin asignar' },
    { clave: 'inicio', icono: <IconoFecha className={ic} />, rotulo: 'Inicio', valor: fecha(o.inicio), falta: 'sin fecha' },
    { clave: 'fin', icono: <IconoFecha className={ic} />, rotulo: 'Fin previsto', valor: fecha(o.fin), falta: 'sin fecha' },
    { clave: 'contrato', icono: <IconoDinero className={ic} />, rotulo: 'Contrato', valor: plata(o.montoContratado), falta: 'sin cargar' },
    { clave: 'drive', icono: <IconoDocumento className={ic} />, rotulo: 'Carpeta Drive', valor: o.driveCarpeta ? 'vinculada' : null, falta: 'sin vincular' },
  ]
}

export function PanelPreparacionObra({ obra, checklist, resumen }: {
  obra: ObraDelPlan
  checklist: ItemChecklist[]
  resumen: ResumenDelPlan
}) {
  const pendientes = checklist.filter((c) => !c.cumple)
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[372px]" data-testid="panel-preparacion">
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center gap-2.5 border-b border-surface-sunken px-3.5 py-2.5">
          <h2 className="text-[12.5px] font-semibold text-ink">La obra que vas a crear</h2>
          {/* EL ÚNICO ENLACE DE LA TARJETA. El canónico dibuja un chevron por fila, como si cada
              campo se editara acá; en este repositorio la ficha de la obra se edita en su Resumen,
              con la acción `editarObra` atada a la obra. Siete chevrons al mismo lugar serían siete
              botones falsos — ver la desviación declarada en el informe. */}
          {obra.id && (
            <Link
              href={`/obras/${obra.id}?vista=resumen`} prefetch={false} data-testid="editar-obra"
              className="ml-auto text-[11.5px] text-muted underline hover:text-ink"
            >
              Editar la obra
            </Link>
          )}
        </div>
        <dl className="px-3.5 pb-3 pt-1">
          {camposDeLaObra(obra).map((c) => (
            <div key={c.clave} className="flex items-center gap-2.5 border-b border-[#F5F4F0] py-2 last:border-b-0" data-campo={c.clave}>
              <span aria-hidden className="shrink-0 text-faint">{c.icono}</span>
              <dt className="w-[96px] shrink-0 text-[11.5px] text-muted">{c.rotulo}</dt>
              <dd className={`min-w-0 truncate text-[12px] ${c.valor == null ? 'text-warn' : 'text-ink'}`}>
                {c.valor ?? c.falta}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface" data-testid="antes-de-crear">
        <div className="flex items-center gap-2.5 border-b border-surface-sunken px-3.5 py-2.5">
          <span aria-hidden className="text-warn"><IconoProblema className="h-[15px] w-[15px]" /></span>
          <h2 className="text-[12.5px] font-semibold text-ink">Antes de crear</h2>
          <span className={`ml-auto font-mono text-[11.5px] tabular-nums ${pendientes.length ? 'text-warn' : 'text-pos'}`}>
            {pendientes.length === 0 ? 'todo listo' : `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {checklist.map((c) => (
          <div
            key={c.clave} data-item={c.clave} data-cumple={c.cumple ? '1' : undefined}
            className="flex items-center gap-2.5 border-b border-[#F5F4F0] px-3.5 py-2.5 last:border-b-0"
          >
            <span aria-hidden className={`shrink-0 ${c.cumple ? 'text-pos' : (c.bloquea ? 'text-neg' : 'text-warn')}`}>
              {c.cumple
                ? <IconoCompletar className="h-4 w-4" />
                : <IconoProblema className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[12.5px] ${c.cumple ? 'text-ink-soft' : 'text-ink'}`}>{c.titulo}</div>
              {c.detalle && (
                <div className={`mt-px text-[11px] ${c.bloquea ? 'text-neg' : 'text-warn'}`}>{c.detalle}</div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-card border border-line bg-surface p-3.5" data-testid="lo-que-lleva-el-plan">
        <h2 className="text-[12.5px] font-semibold text-ink">Lo que se lleva el plan</h2>
        <Cifra rotulo="Actividades" valor={String(resumen.actividades)} />
        <Cifra rotulo="Frentes" valor={String(resumen.frentes)} />
        {/* SIN ANÁLISIS NO ES 0 HH. El plan de una obra entera sin analizar diría «0 HH del plan»,
            que se lee «no hay trabajo» en vez de «nadie lo midió». */}
        <Cifra
          rotulo="HH del plan"
          valor={resumen.hh == null ? 'sin análisis' : (fHH(resumen.hh) ?? 'sin análisis')}
          tono={resumen.hh == null ? 'warn' : 'ink'}
        />
        <Cifra
          rotulo="Con pasos definidos"
          valor={`${resumen.conPasos} de ${resumen.elegidas}`}
          tono={resumen.conPasos < resumen.elegidas ? 'warn' : 'pos'}
        />
        <p className="mt-2.5 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
          <span aria-hidden className="mt-px shrink-0 text-faint"><IconoProblema className="h-3.5 w-3.5" /></span>
          El presupuesto no es el plan: lo que se convierte queda editable en la obra sin tocar la
          cotización.
        </p>
      </section>
    </div>
  )
}

function Cifra({ rotulo, valor, tono = 'ink' }: { rotulo: string; valor: string; tono?: 'ink' | 'warn' | 'pos' }) {
  const clase = tono === 'warn' ? 'text-warn' : (tono === 'pos' ? 'text-pos' : 'text-ink')
  return (
    <div className="flex items-baseline justify-between gap-2.5 border-b border-[#F5F4F0] py-[7px] last:border-b-0">
      <span className="text-[12px] text-muted">{rotulo}</span>
      <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${clase}`}>{valor}</span>
    </div>
  )
}
