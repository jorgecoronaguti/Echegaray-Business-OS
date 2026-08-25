// PANTALLA 21 · EL LISTADO DE CUADRILLAS — porte literal de `21 · Cuadrillas y HH.dc.html`.
//
// ═══ MEDIDO DEL CANÓNICO ═══
//
//   grilla   `gap:10px` · fila `minHeight:52px` · `padding:8px 16px` · divisor `#F1F0EC`
//   cuadrilla  icono 15px + nombre 12,5px/500 + segunda línea 11px `#91918B`
//   dotación   barritas de 8×16 radio 2, `gap:2px`, y el número en mono 11,5px
//   pie        `CUADRILLAS · HH SEMANA · SIN ASIGNAR`, adentro de la caja sobre `#FAFAF8`
//
// INTEGRANTES y OBRAS DERIVADAS se calculan al leer: la primera cuenta los períodos abiertos de
// `cuadrilla_integrante`, la segunda junta las obras de las asignaciones vigentes de esa gente.
// Guardarlas obligaría a mantenerlas de acuerdo con la realidad para siempre, y el día que no
// coincidieran nadie se enteraría.
//
// ═══ LAS DOS COLUMNAS DEL CANÓNICO QUE NO EXISTEN, Y POR QUÉ ═══
//
//   DOTACIÓN «4 / 5»  el denominador es la dotación TOPE de la cuadrilla, y no existe: `tope_frente`
//                     y `dotacion_prevista` viven en el plan de la TAREA, no en la cuadrilla, y una
//                     cuadrilla no está asignada a un frente en ninguna tabla. Las barritas se
//                     dibujan igual —una por integrante vigente, que es un dato— pero sin casilleros
//                     vacíos: pintar cinco huecos afirmaría un tope que nadie fijó.
//   RENDIM. «1,14×»   necesita las HH DE BASE de lo ejecutado por esa cuadrilla. La base maestra las
//                     tiene por TAREA y estas HH se imputan por PERSONA y obra: no existe el vínculo
//                     cuadrilla → tarea que las haría comparables. En su lugar va CAP. POND., que sí
//                     tiene fuente (`cuadrilla_capacidad`) y contesta la pregunta de fondo — cuánto
//                     puede esta gente, no cuántos son.

import Link from 'next/link'
import { Nulo } from '@/shared/components/ds'
import {
  CabezaCanon, FilaCanon, ListaCanon, PieCanon, RotuloCanon, VacioCanon, type MetricaCanon,
} from '@/shared/components/canon/ListaCanon'
import { IconoCuadrilla } from '@/shared/components/iconos'
import type { Cuadrilla } from '../types'
import type { CapacidadCuadrilla } from '../services/cuadrillasService'
import { AccionesCuadrilla } from './AccionesCuadrilla'

/** Las HH van SIN decimales: el canónico escribe «168», y media hora no cambia ninguna decisión de
 *  dotación. El decimal está en el registro, que es donde se liquida. */
const horas = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

/** `2.4` → `2,4`. Un decimal: la capacidad se compara de un vistazo entre cuadrillas, no se liquida. */
const capacidad = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const COLS = 'minmax(0,1.3fr) minmax(0,1.2fr) 152px 92px 96px 26px'

/** Las barritas del canónico: UNA por integrante vigente. Sin tope no hay casillero vacío. */
function Slots({ n }: { n: number }) {
  // Se topea el DIBUJO en doce: una cuadrilla de treinta convertiría la columna en una regla y
  // empujaría el número fuera de la celda. El número de al lado sigue diciendo la verdad.
  const dibujadas = Math.min(n, 12)
  return (
    <span className="flex shrink-0 gap-[2px]" aria-hidden>
      {Array.from({ length: dibujadas }, (_, i) => (
        <span key={i} className="h-[16px] w-[8px] rounded-[2px] bg-accent" />
      ))}
      {n > dibujadas && <span className="h-[16px] w-[8px] rounded-[2px] bg-line-strong" />}
    </span>
  )
}

export function TablaCuadrillas({
  cuadrillas, abierta, hrefDe, capacidades, hhSemana, metricas, vacio, archivar,
}: {
  cuadrillas: Cuadrilla[]
  abierta?: string
  hrefDe: (id: string) => string
  /** De la vista `cuadrilla_capacidad`. Una cuadrilla que no está en el mapa muestra «—»: la vista
   *  no pudo leerse, y un 0 ahí diría que la cuadrilla no rinde nada. */
  capacidades?: Map<string, CapacidadCuadrilla>
  /** HH trabajadas de la semana, ya agrupadas (`hhSemanaCuadrillas`). `undefined` = no se leyeron;
   *  una cuadrilla ausente del mapa = no tiene registros, que NO es haber trabajado 0. */
  hhSemana?: Map<string, number>
  /** El pie del canónico, calculado por la página con lo que ya leyó. */
  metricas?: MetricaCanon[]
  /** Qué decir cuando el filtro no deja nada. */
  vacio?: string
  /** Archivar desde la fila. Recibe el id: la página la liga con `bind` del lado del servidor. */
  archivar?: (cuadrillaId: string) => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
}) {
  return (
    <ListaCanon testid="tabla-cuadrillas" cols={COLS}>
      <CabezaCanon cols={COLS}>
        <RotuloCanon>CUADRILLA</RotuloCanon>
        <RotuloCanon>OBRAS (DERIVADAS)</RotuloCanon>
        <RotuloCanon>DOTACIÓN</RotuloCanon>
        {hhSemana && <RotuloCanon alinear="right">HH SEMANA</RotuloCanon>}
        {/* CUATRO AYUDANTES NO SON CUATRO OFICIALES: son 2,4. La columna existe para que el tamaño
            de una cuadrilla deje de leerse como cabezas. */}
        <RotuloCanon alinear="right">CAP. POND.</RotuloCanon>
        <RotuloCanon />
      </CabezaCanon>

      {cuadrillas.length === 0 && (
        <VacioCanon testid="cuadrillas-vacio">{vacio ?? 'Nada coincide.'}</VacioCanon>
      )}

      {cuadrillas.map((c) => {
        const cap = capacidades?.get(c.id)
        return (
          <FilaCanon key={c.id} cols={COLS} alto={52} seleccionada={c.id === abierta} testid="fila-cuadrilla">
            <Link href={hrefDe(c.id)} className="flex min-w-0 items-center gap-[9px]" data-testid="abrir-cuadrilla">
              <span className="flex shrink-0 text-muted"><IconoCuadrilla className="h-[15px] w-[15px]" /></span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-ink hover:underline">{c.nombre}</span>
                {/* La segunda línea del canónico es la «especialidad» de la cuadrilla, que este
                    modelo no tiene. Lo que sí tiene y hace falta en el mismo lugar es de QUIÉN es:
                    el capataz. Una cuadrilla archivada lo dice acá y no en una columna propia. */}
                <span className="block truncate text-[11px] text-faint">
                  {c.responsable ?? 'sin responsable'}
                  {!c.activa && ' · archivada'}
                </span>
              </span>
            </Link>

            <span className="min-w-0 truncate text-[12px] text-ink-soft">
              {c.obras_actuales ?? <span className="text-warn">sin obra vigente</span>}
            </span>

            <div className="flex min-w-0 items-center gap-2">
              <Slots n={c.integrantes} />
              <span className={`whitespace-nowrap font-mono text-[11.5px] tabular-nums ${c.integrantes === 0 ? 'text-warn' : 'text-muted'}`}>
                {c.integrantes} {c.integrantes === 1 ? 'persona' : 'personas'}
              </span>
            </div>

            {hhSemana && (
              <span className="text-right">
                {hhSemana.has(c.id)
                  ? <span data-testid="hh-semana-cuadrilla" className="font-mono text-[12px] tabular-nums text-ink">{horas(hhSemana.get(c.id) ?? 0)}</span>
                  : <Nulo>—</Nulo>}
              </span>
            )}

            <span
              className="text-right"
              data-testid="cap-pond"
              title={cap && cap.personas_sin_categoria > 0 ? `${cap.personas_sin_categoria} sin categoría cargada pesan 1,0` : undefined}
            >
              {/* «—» y no 0 cuando la vista `cuadrilla_capacidad` no trajo la fila: un 0 diría que la
                  cuadrilla no rinde nada, que es una afirmación distinta de «no lo sé». */}
              {cap ? (
                <>
                  <span className="font-mono text-[12px] tabular-nums text-ink">{capacidad(cap.capacidad_ponderada)}</span>
                  {/* El supuesto se VE, no se esconde adentro del total. */}
                  {cap.personas_sin_categoria > 0 && <span className="ml-1 text-[10px] text-faint">·s/cat</span>}
                </>
              ) : <Nulo>—</Nulo>}
            </span>

            {archivar && c.activa
              ? <AccionesCuadrilla cuadrillaId={c.id} nombre={c.nombre} abrirHref={hrefDe(c.id)} archivar={archivar} />
              : <span />}
          </FilaCanon>
        )
      })}

      {metricas && metricas.length > 0 && <PieCanon metricas={metricas} testid="pie-cuadrillas" />}
    </ListaCanon>
  )
}
