// EL LISTADO DE CUADRILLAS — cuatro columnas y ninguna guardada.
//
// INTEGRANTES y OBRAS DERIVADAS se calculan al leer: la primera cuenta los períodos abiertos de
// `cuadrilla_integrante`, la segunda junta las obras de las asignaciones vigentes de esa gente.
// Guardarlas obligaría a mantenerlas de acuerdo con la realidad para siempre, y el día que no
// coincidieran nadie se enteraría.

import Link from 'next/link'
import { Nulo, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import type { Cuadrilla } from '../types'
import type { CapacidadCuadrilla } from '../services/cuadrillasService'

/** Las HH van SIN decimales: el canónico escribe «168», y media hora no cambia ninguna decisión de
 *  dotación. El decimal está en el registro, que es donde se liquida. */
const horas = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

/** `2.4` → `2,4`. Un decimal: la capacidad se compara de un vistazo entre cuadrillas, no se liquida. */
const capacidad = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** «—» y no 0 cuando la vista `cuadrilla_capacidad` no trajo la fila: un 0 diría que la cuadrilla no
 *  rinde nada, que es una afirmación distinta de «no lo sé». */
function CapPond({ cap }: { cap?: CapacidadCuadrilla }) {
  if (!cap) return <Nulo>—</Nulo>
  return (
    <span
      data-testid="cap-pond"
      title={cap.personas_sin_categoria > 0 ? `${cap.personas_sin_categoria} sin categoría cargada pesan 1,0` : undefined}
    >
      <Num>{capacidad(cap.capacidad_ponderada)}</Num>
      {/* El supuesto se VE, no se esconde adentro del total. */}
      {cap.personas_sin_categoria > 0 && <span className="ml-1 text-[10px] text-faint">·s/cat</span>}
    </span>
  )
}

export function TablaCuadrillas({
  cuadrillas, abierta, hrefDe, capacidades, hhSemana,
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
}) {
  return (
    <Tabla testid="tabla-cuadrillas" minWidth={720}>
      <THead>
        <Th>Cuadrilla</Th>
        <Th>Responsable</Th>
        <Th num>Integrantes</Th>
        {/* CUATRO AYUDANTES NO SON CUATRO OFICIALES: son 2,4. La columna existe para que el tamaño
            de una cuadrilla deje de leerse como cabezas. */}
        <Th num>Cap. pond.</Th>
        {/* HH SEMANA — el canónico 21 la pide, y sale de `registros_hh`: la misma fuente que la
            ficha de la persona y la solapa Personal de la obra. Sólo horas TRABAJADAS. */}
        {hhSemana && <Th num>HH semana</Th>}
        <Th>Obras (derivadas)</Th>
      </THead>
      <tbody>
        {cuadrillas.map((c) => (
          <Tr key={c.id} data-testid="fila-cuadrilla" seleccionada={c.id === abierta}>
            <Td fuerte>
              <Link href={hrefDe(c.id)} className="text-[13px] text-ink hover:underline" data-testid="abrir-cuadrilla">
                {c.nombre}
              </Link>
              {!c.activa && <span className="ml-2 text-[10px] text-faint">archivada</span>}
            </Td>
            <Td className="w-[190px]">
              {c.responsable ?? <Nulo>sin responsable</Nulo>}
            </Td>
            <Td num className="w-[110px]"><Num className="text-muted">{c.integrantes}</Num></Td>
            <Td num className="w-[110px]"><CapPond cap={capacidades?.get(c.id)} /></Td>
            {hhSemana && (
              <Td num className="w-[110px]">
                {hhSemana.has(c.id)
                  ? <Num data-testid="hh-semana-cuadrilla">{horas(hhSemana.get(c.id) ?? 0)}</Num>
                  : <Nulo>—</Nulo>}
              </Td>
            )}
            <Td className="w-[240px]">
              {c.obras_actuales ?? <Nulo>sin obra vigente</Nulo>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
