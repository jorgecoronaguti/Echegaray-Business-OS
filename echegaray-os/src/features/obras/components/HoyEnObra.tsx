// 09 · HOY EN OBRA — quién está, por cuadrilla, contra cuántos se esperaban.
//
// ═══ LA FORMA LA FIJA EL CANÓNICO 09 (`09 · Obra Personal.dc.html`) ═══
//
// Banda de KPIs · lista agrupada por cuadrilla con avatar de iniciales · panel de 340px a la
// derecha con «Atención de hoy» arriba y «Dotación por frente» abajo. Antes era una sola lista con
// un renglón de resumen encima: el jefe tenía que leer las cuatro cuadrillas enteras para descubrir
// que faltaba uno. Los dos hallazgos —el conteo y la excepción— ahora están antes de la lista y al
// lado de la lista, que es donde el canónico los puso.
//
// ═══ POR QUÉ LEE ACÁ Y NO EN LA PÁGINA ═══
//
// La solapa Personal se monta desde la ficha de obra, que sirve seis solapas con una sola lectura
// en bloque. Meter la presencia en ese bloque haría que las otras cinco esperen una consulta que
// sólo esta sección usa. Con la lectura acá adentro y un `Suspense` alrededor, la solapa se dibuja
// entera y la presencia llega cuando llega — que es lo único de esta pantalla que cambia solo.
//
// ═══ LA LECTURA ES LA MISMA QUE «EN OBRA AHORA» ═══
//
// `getPresencia` sobre `presencia_del_dia`, que corre con los permisos de quien pregunta
// (`security_invoker`). No hay un filtro por rol en TypeScript: si mañana el jefe de obra deja de
// ver otras obras, se cambia la policy y esta sección obedece sola.
//
// ═══ DOS KPIS DEL CANÓNICO NO SE PUEDEN DIBUJAR, Y NO SE INVENTAN ═══
//
// La maqueta trae AUSENTES y EXTERNOS. Ninguno de los dos existe como dato: la ausencia declarada
// no está en ninguna tabla —`presencia_del_dia` sólo sabe de marcas— y el personal de un
// subcontratista no ficha en este sistema. Llenar esos dos con «los que no marcaron» sería publicar
// SIN FICHAR tres veces con tres nombres distintos, y uno de esos nombres —ausente— es una
// acusación. En su lugar van las dos excepciones que sí son hechos: CERRARON y SIN ASIGNACIÓN.
//
// ═══ EL PULSO ES LA ÚNICA ANIMACIÓN, Y SIGNIFICA UNA COSA ═══
//
// «Esta jornada está abierta». Un punto quieto es una jornada cerrada, y el reloj detenido pierde el
// peso: un reloj que sigue corriendo sobre alguien que se fue a las tres es la forma más barata de
// que la pantalla mienta durante toda la tarde.

import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import { Aviso, Eyebrow } from '@/shared/components/ds'
import { ListaHoyEnObra } from './ListaHoyEnObra'
import {
  avisosDelDia, horasDeHoy, hoyEnObra, SIN_CUADRILLA,
  type AsignadoDeObra, type AvisoDelDia, type GrupoHoy, type HoraDelDia,
} from '../services/presenciaObra'

const hh = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export async function HoyEnObra({ obraId, asignaciones, registros = [], navegacion, accion }: {
  obraId: string
  asignaciones: AsignadoDeObra[]
  /** Los registros de HH que la solapa ya leyó. Se pasan para no volver a pedirlos: la columna de
   *  horas y el KPI de imputadas salen de ahí, no de una segunda lectura que podría diferir. */
  registros?: HoraDelDia[]
  /** Las sub-vistas de Personal y la acción primaria: viajan hasta la BANDA, que es de la lista
   *  (cliente) porque ahí viven también el buscador y los filtros. El canónico dibuja una sola
   *  banda; dos apiladas le sacan 40px de alto a la lista. */
  navegacion?: ReactNode
  accion?: ReactNode
}) {
  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await getPresencia(supabase, hoy, obraId)

  // UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ». Si la lectura falla, la sección lo dice con el
  // error de la fuente en vez de dibujar una obra vacía, que se leería «hoy no vino nadie».
  if (error || !data) {
    return (
      <section data-testid="hoy-en-obra">
        <Eyebrow className="mb-2.5">Hoy en obra</Eyebrow>
        <Aviso tono="neg">No pude leer las marcas de hoy: {error ?? 'sin datos'}</Aviso>
      </section>
    )
  }

  const r = hoyEnObra(asignaciones, data)
  const horas = horasDeHoy(registros, hoy)
  const avisos = avisosDelDia(r)

  return (
    <section data-testid="hoy-en-obra">
      <ListaHoyEnObra
        grupos={r.grupos}
        horas={horas.porPersona}
        navegacion={navegacion}
        accion={accion}
        fecha={hoy.split('-').reverse().join('/')}
        kpis={<BandaKpis r={r} horas={horas} />}
        panel={
          <>
            <AtencionDeHoy avisos={avisos} />
            <DotacionPorFrente grupos={r.grupos} />
          </>
        }
      />
    </section>
  )
}

/** Los cinco recuadros del canónico, en una sola caja dividida por hairlines: cinco tarjetas
 *  sueltas serían cinco bordes para leer cinco cifras que se leen juntas o no se leen. */
function BandaKpis({ r, horas }: { r: ReturnType<typeof hoyEnObra>; horas: ReturnType<typeof horasDeHoy> }) {
  const kpis: { rotulo: string; valor: string | null; falta: string; detalle: string; tono?: 'warn' | 'neg' }[] = [
    { rotulo: 'En obra', valor: String(r.enObra), falta: '—', detalle: `de ${r.asignados} asignados` },
    // SIN FICHAR NO ES AUSENTE: incluye al que no tiene teléfono y al que no le dio permiso al GPS.
    { rotulo: 'Sin fichar', valor: String(r.sinFichar), falta: '—', detalle: 'todavía sin marca', tono: r.sinFichar > 0 ? 'warn' : undefined },
    { rotulo: 'Cerraron', valor: String(r.cerraron), falta: '—', detalle: 'jornada terminada' },
    { rotulo: 'Sin asignación', valor: String(r.sinAsignacion), falta: '—', detalle: 'ficharon acá igual', tono: r.sinAsignacion > 0 ? 'neg' : undefined },
    // HH IMPUTADAS, no «HH de hoy»: fichar e imputar son dos hechos distintos y la jornada en curso
    // casi siempre se carga al cierre. `null` dice «sin imputar», nunca 0.
    { rotulo: 'HH imputadas', valor: horas.total == null ? null : hh(horas.total), falta: 'sin imputar', detalle: 'a esta fecha' },
  ]
  return (
    <div
      className="mb-3 flex flex-wrap overflow-hidden rounded-card border border-line bg-surface"
      data-testid="kpis-hoy"
    >
      {kpis.map((k) => (
        <div
          key={k.rotulo}
          className="min-w-[164px] flex-1 border-r border-surface-sunken px-4 py-2.5 last:border-r-0"
          data-kpi={k.rotulo}
        >
          <div className="text-[10.5px] uppercase tracking-[0.04em] text-faint">{k.rotulo}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span
              className={`font-mono text-[20px] font-semibold leading-tight tabular-nums ${
                k.valor == null ? 'text-faint' : (k.tono === 'neg' ? 'text-neg' : (k.tono === 'warn' ? 'text-warn' : 'text-ink'))
              }`}
            >
              {k.valor ?? k.falta}
            </span>
            <span className="truncate text-[11px] text-faint">{k.detalle}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

const TONO_AVISO = { neg: 'text-neg', warn: 'text-warn', pendiente: 'text-muted' } as const

/** Lo que hay que resolver hoy, y NADA cuando no hay nada: un panel que dice «todo en orden» con
 *  cuatro ceros es un panel que se deja de mirar. */
function AtencionDeHoy({ avisos }: { avisos: AvisoDelDia[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface" data-testid="atencion-de-hoy">
      <div className="flex items-center gap-2 border-b border-surface-sunken px-3.5 py-2.5">
        <span aria-hidden className="text-[12px] text-warn">⚠</span>
        <h3 className="text-[12.5px] font-semibold text-ink">Atención de hoy</h3>
      </div>
      {avisos.length === 0
        ? <p className="px-3.5 py-3 text-[12px] text-muted">Nada pendiente: todos los asignados ficharon y nadie fichó de más.</p>
        : avisos.map((a) => (
          <div
            key={a.clave} data-aviso={a.clave}
            className="flex items-center gap-2.5 border-b border-surface-sunken px-3.5 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ink">{a.titulo}</div>
              <div className="truncate text-[11px] text-faint">{a.detalle}</div>
            </div>
            <span className={`shrink-0 font-mono text-[12px] font-semibold tabular-nums ${TONO_AVISO[a.tono]}`}>
              {a.n}
            </span>
          </div>
          ))}
    </div>
  )
}

/**
 * DOTACIÓN POR FRENTE — presentes sobre asignados, con los casilleros del canónico.
 *
 * El canónico compara contra el TOPE del frente («5 de 8, entran 3 más»). Acá el tope de la
 * cuadrilla no existe: `obra_asignacion` no lo declara y el tope que sí está declarado es el del
 * frente del cronograma, que es otra unidad. Se compara contra los ASIGNADOS, que es un hecho, y el
 * rótulo lo dice. Dibujar casilleros hasta un tope inventado sería prometer lugar que nadie midió.
 */
function DotacionPorFrente({ grupos }: { grupos: GrupoHoy[] }) {
  const conPlantel = grupos.filter((g) => g.asignados > 0)
  if (conPlantel.length === 0) return null
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface" data-testid="dotacion-por-frente">
      <div className="flex items-center gap-2 border-b border-surface-sunken px-3.5 py-2.5">
        <h3 className="text-[12.5px] font-semibold text-ink">Dotación por cuadrilla</h3>
        <span className="ml-auto text-[11px] text-faint">presentes / asignados</span>
      </div>
      <div className="px-3.5 pb-3 pt-1">
        {conPlantel.map((g) => (
          <div key={g.cuadrilla} className="border-b border-surface-sunken py-2.5 last:border-b-0" data-frente={g.cuadrilla}>
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="min-w-0 truncate text-[12px] text-ink">
                {g.cuadrilla === SIN_CUADRILLA ? 'Sin cuadrilla' : g.cuadrilla}
              </span>
              <span className={`shrink-0 font-mono text-[12px] tabular-nums ${g.presentes >= g.asignados ? 'text-pos' : 'text-muted'}`}>
                {g.presentes} / {g.asignados}
              </span>
            </div>
            <div className="mt-1.5 flex gap-[3px]">
              {Array.from({ length: g.asignados }, (_, i) => (
                <span
                  key={i} aria-hidden
                  className={`h-[7px] flex-1 rounded-[2px] ${i < g.presentes ? 'bg-accent' : 'bg-line'}`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2.5 flex flex-wrap items-center gap-3.5">
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span aria-hidden className="h-[7px] w-2.5 rounded-[2px] bg-accent" />en obra
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span aria-hidden className="h-[7px] w-2.5 rounded-[2px] bg-line" />sin fichar
          </span>
        </div>
      </div>
    </div>
  )
}
