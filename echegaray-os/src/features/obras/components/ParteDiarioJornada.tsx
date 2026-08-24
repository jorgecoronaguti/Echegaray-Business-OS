'use client'

// LA JORNADA DEL PARTE DIARIO — la columna derecha del canónico 05: «Cargado hoy» arriba y
// «Frentes en curso» abajo. Se separó del formulario porque son dos lecturas distintas: una es lo
// que YA se cargó hoy (auditable, borrable) y la otra es cómo viene cada frente (acumulado).
//
// ═══ LO QUE EL MOCKUP DIBUJA Y LOS DATOS NO SOSTIENEN ═══
//
// El canónico pone HH y PERSONAS **por fila**. Un parte de `obra_ejecucion` no sabe quién lo hizo:
// las horas viven en `registros_hh`, por persona y por día, sin puntero al parte. Repartirlas entre
// los partes de esa actividad sería una atribución fabricada —y con dos partes del mismo frente en
// el mismo día, cada fila mostraría las horas del otro—. Por eso HH y PERSONAS se publican UNA vez,
// en la cabecera de la jornada, que es la ventana donde el dato existe de verdad.

import { useMemo, useState } from 'react'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { BarraAvance, Estado, Filtros, Nulo, Plegable, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoComentario, IconoCompletar, IconoCrear } from '@/shared/components/iconos'
import type { Actividad, ParteEjecucion } from '../types'
import type { JornadaHH } from '../services/ejecucionService'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** Cuántos frentes entran sin desplegar. El canónico corta en 5 y ofrece «Ver N más». */
const VISIBLES = 5

/** El avance con la barra del sistema. Sin fracción no se dibuja la pista: el hueco ES el dato. */
function Barra({ pct }: { pct: number | null }) {
  if (pct == null) return <Nulo>sin medición</Nulo>
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1"><BarraAvance pct={pct} /></span>
      <span className="w-[36px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted">{num(pct)}%</span>
    </span>
  )
}

/** Una cifra de la cabecera de la jornada. `null` NO es cero: es que nadie lo pudo mirar. */
function Cifra({ rotulo, valor, testid }: { rotulo: string; valor: string | null; testid: string }) {
  return (
    <div data-testid={testid}>
      <span className="text-[11px] text-faint">{rotulo} </span>
      {valor == null
        ? <Nulo>sin registrar</Nulo>
        : <span className="font-mono text-[12.5px] font-semibold tabular-nums text-ink">{valor}</span>}
    </div>
  )
}

/**
 * UN PARTE, EN UNA FILA — la misma en la jornada y en el historial: si la fila de auditoría se
 * dibujara distinta, el mismo hecho tendría dos formas. La nota va como icono con el texto en el
 * `title`; una columna de comentarios es media pantalla para lo que casi siempre está vacío.
 *
 * El borrado va en la fila y NO en un `···`: ese menú dibuja sus ítems dentro de un `<button>` y
 * `BotonAccion` es un `<form>` —anidarlos es marcado inválido, y un `onClick` perdería el error del
 * servidor, que es la única prueba de que la fila se borró—. Visible en hover o al tabular: borrar
 * no puede ser lo más llamativo de una lista que se abre para LEER.
 */
function FilaParte({ parte: p, actividad: a, conFecha = false, borrar }: {
  parte: ParteEjecucion
  actividad: Actividad | undefined
  conFecha?: boolean
  borrar: (parteId: string) => Promise<ResultadoAccion>
}) {
  return (
    <li className="group flex items-center gap-2 border-b border-[#F5F4F0] px-4 py-2.5 last:border-0 hover:bg-quiet">
      {conFecha
        ? <span className="w-[52px] shrink-0 font-mono text-[11px] tabular-nums text-faint">{fmtFecha(p.fecha)}</span>
        : <IconoCompletar className="h-[14px] w-[14px] shrink-0 text-pos" />}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        {a?.nombre ?? <Nulo>actividad archivada</Nulo>}
      </span>
      {p.comentario && (
        <span title={p.comentario} className="shrink-0 text-[#B9B7B1]"><IconoComentario className="h-[13px] w-[13px]" /></span>
      )}
      <span className="w-[116px] shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink">
        {p.cantidad != null
          ? `+${num(p.cantidad, 2)} ${a?.unidad ?? ''}`
          : p.avance_pct != null ? `+${num(p.avance_pct)} %` : <Nulo>—</Nulo>}
      </span>
      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <BotonAccion accion={borrar} args={[p.id]} testid="borrar-parte" tono="peligro">Borrar</BotonAccion>
      </span>
    </li>
  )
}

export function ParteDiarioJornada({
  dia, esHoy, partes, delDia, frentes, elegida, sinParte, jornada, soloCurso, verCurso, elegir, borrarParte,
  porActividad,
}: {
  dia: string
  esHoy: boolean
  /** Todos los partes de la obra, para el historial plegado. */
  partes: ParteEjecucion[]
  delDia: ParteEjecucion[]
  frentes: Actividad[]
  elegida: string
  sinParte: number
  /** `null` = la página no pasó `registros_hh`: no se sabe, no es cero. */
  jornada: JornadaHH | null
  soloCurso: boolean
  verCurso: (v: boolean) => void
  elegir: (actividadId: string) => void
  borrarParte: (parteId: string) => Promise<ResultadoAccion>
  porActividad: Map<string, Actividad>
}) {
  const [todos, setTodos] = useState(false)
  const lista = useMemo(() => (todos ? frentes : frentes.slice(0, VISIBLES)), [frentes, todos])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <section className="overflow-hidden rounded-card border border-line bg-surface" data-testid="cargado-hoy">
        <div className="flex items-center gap-2.5 border-b border-[#EFEEEA] px-4 py-[11px]">
          <h2 className="text-[13px] font-semibold text-ink">
            {esHoy ? 'Cargado hoy' : `Cargado el ${fmtFecha(dia)}`}
          </h2>
          <span className="font-mono text-[11.5px] tabular-nums text-muted">
            {delDia.length} {delDia.length === 1 ? 'parte' : 'partes'}
          </span>
          <div className="ml-auto flex items-center gap-[18px]">
            <Cifra rotulo="HH" valor={jornada && num(jornada.hh)} testid="jornada-hh" />
            <Cifra rotulo="PERSONAS" valor={jornada && String(jornada.personas)} testid="jornada-personas" />
          </div>
        </div>
        {delDia.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-faint">
            {esHoy ? 'Todavía no se cargó nada de hoy.' : 'No se cargó nada en esa jornada.'}
          </p>
        ) : (
          <ul>
            {delDia.map((p) => (
              <FilaParte key={p.id} parte={p} actividad={porActividad.get(p.actividad_id)} borrar={borrarParte} />
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface" data-testid="frentes">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#EFEEEA] px-4 py-[11px]">
          {/* EL TÍTULO NO PUEDE MENTIR: con el filtro en «Todos» la lista ya no son los frentes en
              curso, y dejar el rótulo fijo convertiría una obra terminada en una obra en marcha. */}
          <h2 className="text-[13px] font-semibold text-ink">{soloCurso ? 'Frentes en curso' : 'Frentes'}</h2>
          {/* EL PROBLEMA, VISIBLE SIN ABRIR NADA: frentes en curso que hoy no reportaron. */}
          {sinParte > 0 && <Estado tono="warn" clave="sin-parte">{sinParte} sin parte</Estado>}
          <div className="ml-auto">
            <Filtros
              testid="frentes-filtro"
              opciones={[
                { label: 'En curso', activo: soloCurso, onClick: () => verCurso(true), testid: 'frentes-curso' },
                { label: 'Todos', activo: !soloCurso, onClick: () => verCurso(false), testid: 'frentes-todo' },
              ]}
            />
          </div>
        </div>
        {frentes.length === 0
          ? (
              <div className="px-4 py-4"><Vacio>{soloCurso
                ? 'Ningún frente declarado en curso. Están en «Todos».'
                : 'Esta obra todavía no tiene actividades cargadas. Se crean en Cronograma.'}</Vacio></div>
            )
          : (
              <Tabla testid="tabla-ejecucion" minWidth={560} className="border-t-0 px-4">
                <THead>
                  <Th>Actividad</Th>
                  <Th num style={{ width: 128 }}>Acumulado</Th>
                  <Th style={{ width: 128 }}>Avance</Th>
                  <Th num style={{ width: 60 }}>HH</Th>
                  <Th num style={{ width: 22 }} />
                </THead>
                <tbody>
                  {lista.map((a) => {
                    const cant = a.metodo_avance === 'cantidad'
                    return (
                      <Tr key={a.id} compacta seleccionada={a.id === elegida}>
                        <Td fuerte>
                          {a.nombre}
                          {a.rubro && <span className="block text-[11px] text-faint">{a.rubro}</span>}
                        </Td>
                        <Td num>
                          {/* NUNCA «0,00 / 96,00»: un frente que todavía no reportó nada no
                              ejecutó cero, es que no hay medición cargada. El canónico escribe
                              «sin registrar» en esas filas, y en gris. */}
                          {cant && a.cantidad_ejecutada != null
                            ? <span>{num(a.cantidad_ejecutada, 2)}<span className="text-faint"> / {num(a.cantidad_objetivo, 2)} {a.unidad}</span></span>
                            : !cant && a.n_partes > 0
                              ? <span className="text-muted">{a.n_partes} parte(s)</span>
                              : <Nulo>sin registrar</Nulo>}
                        </Td>
                        <Td>
                          {a.estado_operativo === 'bloqueada'
                            ? <Estado tono="neg" clave="bloqueada">bloqueada</Estado>
                            : <Barra pct={a.avance_pct} />}
                        </Td>
                        <Td num>{a.hh_real == null ? <Nulo>—</Nulo> : num(a.hh_real)}</Td>
                        <Td num>
                          <button
                            type="button" onClick={() => elegir(a.id)}
                            title="Cargar el parte de este frente" aria-label={`Cargar el parte de ${a.nombre}`}
                            data-testid={`cargar-frente-${a.id}`}
                            className="text-[#C9C4C2] transition-colors hover:text-ink"
                          ><IconoCrear className="h-[14px] w-[14px]" /></button>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Tabla>
            )}
        {frentes.length > VISIBLES && (
          <button
            type="button" onClick={() => setTodos((v) => !v)} data-testid="frentes-ver-mas"
            className="flex w-full items-center justify-center gap-[7px] py-2.5 text-[12px] text-ink-soft transition-colors hover:bg-quiet hover:text-ink"
          >
            {todos ? 'Ver menos' : `Ver ${frentes.length - VISIBLES} más`}
          </button>
        )}
      </section>

      {/* EL HISTORIAL COMPLETO NO ES LA PANTALLA: es la auditoría de la pantalla. Plegado, porque
          el que carga el parte del día no lo abre nunca y el que audita lo abre una vez. */}
      {partes.length > 0 && (
        <Plegable titulo="Todos los partes" cuenta={partes.length} testid="todos-los-partes">
          <ul data-testid="lista-partes" className="rounded-card border border-line bg-surface">
            {partes.slice(0, 60).map((p) => (
              <FilaParte key={p.id} parte={p} actividad={porActividad.get(p.actividad_id)} conFecha borrar={borrarParte} />
            ))}
          </ul>
          {partes.length > 60 && (
            <p className="mt-2 text-[11.5px] text-faint">Se muestran los 60 más recientes de {partes.length}.</p>
          )}
        </Plegable>
      )}
    </div>
  )
}
