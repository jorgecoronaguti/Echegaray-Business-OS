'use client'

// EJECUCIÓN — LA PANTALLA DE CAMPO. Lo que pasó hoy en la obra, y cargarlo en segundos.
//
// ═══ LA FORMA LA FIJA EL HANDOFF APROBADO (design/screens/obras.md §1c) ═══
//
//   Izquierda: el parte del día, SIEMPRE ABIERTO. Derecha: los KPIs de la jornada y la tabla de
//   partes, con la de hoy resaltada.
//
// El formulario estaba detrás de un botón «+ Registrar». Un parte diario que hay que abrir es un
// parte diario que se carga dos semanas: la acción del día tiene que estar a la vista al entrar,
// no a un clic. Por eso `abrir-registrar` ya no existe — no se escondió, se dejó de esconder.
//
// ═══ UNA CARGA, MUCHOS EFECTOS ═══
//
// El mismo envío escribe la producción en `obra_ejecucion` y las horas en `registros_hh`. Por eso
// abajo del formulario se dice, en una línea, qué se va a mover: sin eso, cargar horas acá parece
// una tercera forma de imputar HH en vez de la misma de siempre.
//
// ═══ LAS DOS TABLAS SON DOS PREGUNTAS ═══
//
// «Partes registrados» contesta qué se cargó —es la del handoff, y es la que se audita—. «Cómo
// viene cada frente» contesta cómo va cada actividad contra su objetivo, y NO se borró al rediseñar:
// es el acumulado que el jefe de obra mira para decidir a dónde mandar la cuadrilla mañana.

import { useMemo, useState } from 'react'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  CAMPO, Campo, Estado, Eyebrow, Nulo, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import type { Actividad, ParteEjecucion, Persona } from '../types'
import { deHoy, kpisDelDia } from '../services/ejecucionService'
import { FilasDeEquipo } from './FilasDeEquipo'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL } from '../types'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** El avance en una barra de 3px. No es un gráfico: es la misma cifra, legible de un vistazo. */
function Barra({ pct }: { pct: number | null }) {
  if (pct == null) return <Nulo>sin cargar</Nulo>
  return (
    <span className="flex items-center gap-2">
      <span className="h-[3px] w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
        <span className="block h-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="font-mono text-[12px] tabular-nums text-muted">{num(pct)}%</span>
    </span>
  )
}

/** Una cifra de la jornada. `neg` sólo para el frente que hoy no reportó: eso sí es un problema. */
function Kpi({ k, v, sub, neg }: { k: string; v: string; sub: string; neg?: boolean }) {
  return (
    <div className="min-w-0" data-kpi={k}>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{k}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-mono text-[16px] font-semibold tabular-nums ${neg ? 'text-neg' : 'text-ink'}`}>{v}</span>
        <span className="truncate text-[11.5px] text-muted">{sub}</span>
      </div>
    </div>
  )
}

/** Un bloque plegado del parte: lo secundario está a un clic, no a una pantalla de distancia. */
function Extra({ titulo, testid, children }: { titulo: string; testid: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-[#EFEEEA] pt-2.5" data-testid={testid}>
      <summary className="cursor-pointer text-[12.5px] text-muted hover:text-ink">{titulo}</summary>
      <div className="mt-2.5">{children}</div>
    </details>
  )
}

export function TabEjecucion({
  actividades, partes, personas, cuadrillas, integrantes, hoy, registrar, borrarParte,
  equipos = [],
}: {
  obraId?: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string }[]
  /** Quiénes integran cada cuadrilla. Elegir una recorta la lista de casilleros a los suyos. */
  integrantes: Record<string, string[]>
  hoy: string
  /** El catálogo de equipos, como ayuda de carga. Sale de `herramientas`, el espejo del Sheet. */
  equipos?: string[]
  registrar: AccionFormulario
  borrarParte: (parteId: string) => Promise<ResultadoAccion>
}) {
  const [dia, setDia] = useState(hoy)
  const [cuadrilla, setCuadrilla] = useState('')
  const [elegida, setElegida] = useState('')
  // LAS HH DEL DÍA SE SUMAN DE LOS CASILLEROS, no de un campo aparte. El handoff dibuja «HH del
  // día» como un número suelto; acá una hora pertenece SIEMPRE a una persona, porque de esa fila
  // sale la liquidación. El número del handoff existe igual: es esta suma, en vivo.
  const [hhDelParte, setHhDelParte] = useState(0)

  // Sólo las que se ejecutan: un rubro de resumen no se produce, se completa solo con sus hijas.
  const ejecutables = useMemo(
    () => actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada),
    [actividades])
  const movidoHoy = useMemo(() => deHoy(partes, dia), [partes, dia])
  const porActividad = useMemo(() => new Map(ejecutables.map((a) => [a.id, a])), [ejecutables])
  const kpis = useMemo(() => kpisDelDia(partes, actividades, dia), [partes, actividades, dia])

  // Elegir una cuadrilla recorta los casilleros a los suyos. Sin cuadrilla, el plantel entero: no
  // toda obra las tiene armadas, y exigirlas para poder cargar horas sería fricción por nada.
  const delReparto = useMemo(() => {
    const suyos = cuadrilla ? new Set(integrantes[cuadrilla] ?? []) : null
    return suyos ? personas.filter((p) => suyos.has(p.id)) : personas
  }, [personas, cuadrilla, integrantes])

  // Las que ya arrancaron primero: es lo que se carga todos los días. Lo que todavía no empezó
  // ocupa el final de la lista en vez de empujar hacia abajo lo que está en curso.
  const orden = useMemo(() => [...ejecutables].sort((a, b) => {
    const vivo = (x: Actividad) => (x.estado_operativo === 'en_curso' ? 0 : x.avance_pct ? 1 : 2)
    return vivo(a) - vivo(b) || a.orden - b.orden
  }), [ejecutables])

  const sel = elegida ? porActividad.get(elegida) ?? null : null
  const porDeclaracion = sel != null && sel.metodo_avance === 'manual'

  function sumarHoras(e: React.FormEvent<HTMLDivElement>) {
    const casilleros = e.currentTarget.querySelectorAll<HTMLInputElement>('input[name^="horas_"]')
    let t = 0
    for (const c of casilleros) t += Number(c.value) || 0
    setHhDelParte(t)
  }

  return (
    <div className="flex flex-col gap-7 lg:flex-row lg:gap-6">
      {/* ═══ EL PARTE DEL DÍA ═══ */}
      <section
        data-testid="panel-registrar"
        className="min-w-0 lg:w-[452px] lg:shrink-0 lg:border-r lg:border-[#EFEEEA] lg:pr-6"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[14px] font-semibold text-ink">Parte del día</h2>
          <input
            type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            aria-label="Jornada del parte" data-testid="dia-ejecucion"
            className="w-[132px] rounded-control border border-line-strong bg-surface px-2 py-[3px] font-mono text-[12px] tabular-nums text-muted"
          />
          <span className="ml-auto text-[11.5px] text-faint">se carga por actividad</span>
        </div>

        <FormAccion
          accion={registrar} testid="form-ejecucion" enviar="Registrar parte"
          mensajeOk="Parte registrado." className="mt-4"
        >
          <input type="hidden" name="fecha" value={dia} />
          <div className="flex flex-col gap-3.5">
            <Campo rotulo="Actividad" ayuda={sel
              ? `${sel.rubro ? `Rubro ${sel.rubro} · ` : ''}objetivo ${num(sel.cantidad_objetivo, 2)} ${sel.unidad ?? ''} · ejecutado ${num(sel.cantidad_ejecutada ?? 0, 2)} ${sel.unidad ?? ''}`
              : undefined}>
              <select
                name="actividad_id" className={CAMPO} value={elegida} data-testid="parte-actividad" required
                onChange={(e) => setElegida(e.target.value)}
              >
                <option value="" disabled>Elegí la actividad</option>
                {orden.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.rubro ? `${a.rubro} · ` : ''}{a.nombre}
                    {a.metodo_avance === 'cantidad' ? ` (${a.unidad})` : ''}
                  </option>
                ))}
              </select>
            </Campo>

            {/* CANTIDAD Y AVANCE SON EXCLUYENTES, y el que no aplica va DESHABILITADO: un campo
                deshabilitado no viaja en el formulario, así que no se puede colar un 0 en una
                actividad que no se mide por cantidad. La actividad que avanza por partes no acepta
                ninguno de los dos —su avance es la cuenta de partes— y lo dice con esas palabras. */}
            <div className="flex gap-3">
              <Campo rotulo={porDeclaracion ? 'Avance del día' : 'Cantidad ejecutada'} className="flex-1">
                <span className="relative block">
                  <input
                    name={porDeclaracion ? 'avance_pct' : 'cantidad'}
                    type="number" step="any" min="0" max={porDeclaracion ? 100 : undefined}
                    disabled={sel != null && sel.metodo_avance === 'partes'}
                    placeholder={sel != null && sel.metodo_avance === 'partes' ? 'sin medición' : ''}
                    className={`${CAMPO} pr-11 font-mono tabular-nums`}
                    data-testid={porDeclaracion ? 'parte-avance' : 'parte-cantidad'}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11.5px] text-faint">
                    {/* SIN ACTIVIDAD ELEGIDA NO HAY UNIDAD: decía «un» sobre un campo que todavía
                        no sabe qué mide, y esa palabra es una afirmación sobre la actividad. */}
                    {porDeclaracion ? '%' : sel?.unidad ?? ''}
                  </span>
                </span>
              </Campo>
              <Campo rotulo="HH del día" className="w-[132px] shrink-0"
                ayuda={hhDelParte > 0 ? undefined : 'se cargan abajo'}>
                <span className={`${CAMPO} flex items-center justify-between font-mono tabular-nums`}>
                  <span data-testid="parte-hh-total" className={hhDelParte > 0 ? 'text-ink' : 'text-faint'}>
                    {num(hhDelParte, 2)}
                  </span>
                  <span className="text-[11.5px] text-faint">HH</span>
                </span>
              </Campo>
            </div>

            {/* ═══ LAS HORAS SON LAS MISMAS DE PERSONAL ═══
                No es una tercera forma de imputar HH: el reparto viaja con el mismo contrato
                (`horas_<uuid>`) que la carga masiva de la pestaña Personal, y lo escribe la misma
                acción. La misma hora se carga UNA vez. */}
            <div data-testid="parte-personal" onInput={sumarHoras}>
              <Campo rotulo="Cuadrilla" ayuda="Poné las horas de quien trabajó. En blanco no se imputa.">
                <select
                  className={CAMPO} value={cuadrilla} data-testid="parte-cuadrilla"
                  onChange={(e) => setCuadrilla(e.target.value)}
                >
                  <option value="">Todo el plantel · {personas.length} personas</option>
                  {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {delReparto.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-2 rounded-control border border-line px-2.5 py-1 text-[12px]">
                    <span className="min-w-0 truncate text-ink-soft">{p.nombre_completo}</span>
                    <input
                      name={`horas_${p.id}`} type="number" step="0.5" min="0" max="24" placeholder="HH"
                      className="w-[58px] shrink-0 bg-transparent text-right font-mono text-[12px] tabular-nums text-ink outline-none placeholder:text-faint"
                      data-testid={`horas-${p.id}`}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* ═══ EL EQUIPO NO ES UNA PERSONA ═══
                Las horas de una persona van a `registros_hh` —de donde sale la liquidación— y las de
                una máquina a `obra_ejecucion_equipo`. Si compartieran tabla, el costo de mano de
                obra incluiría a la hormigonera. */}
            <Extra titulo="Equipos utilizados" testid="parte-equipos">
              <FilasDeEquipo catalogo={equipos} />
            </Extra>

            <Campo rotulo="Comentario">
              {/* El comentario NO usa `CAMPO`: esa clase fija el alto del control (34px, 48 en el
                  teléfono) y un área de texto tiene que poder crecer. Mismo borde, mismo radio,
                  mismo tamaño de letra. */}
              <textarea
                name="comentario" maxLength={500} rows={2} data-testid="parte-comentario"
                className="w-full rounded-control border border-line-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint"
                placeholder="Muro norte 2ª hilada. Falta bloque 18×18 para el muro sur."
              />
            </Campo>

            {/* ═══ EL IMPEDIMENTO SE ANOTA CUANDO PASA ═══
                El que hay que ir a cargar a otra pantalla se anota mañana o nunca. Sale por la MISMA
                acción que lo anota en Operación, atado a la actividad de este parte. */}
            <Extra titulo="Anotar impedimento" testid="parte-impedimento">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Campo rotulo="Qué frenó el trabajo" className="sm:col-span-2">
                  <input name="impedimento" maxLength={300} className={CAMPO} data-testid="parte-impedimento-desc" />
                </Campo>
                <Campo rotulo="Tipo">
                  <select name="impedimento_tipo" defaultValue="material" className={CAMPO}>
                    {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Quién lo resuelve">
                  <input name="impedimento_responsable" maxLength={120} className={CAMPO} />
                </Campo>
                <Campo rotulo="Para cuándo" className="sm:col-span-2"
                  ayuda="Sin responsable y sin fecha no es gestión: es una queja anotada, y por eso no se guarda.">
                  <input type="date" name="impedimento_compromiso" className={CAMPO} />
                </Campo>
              </div>
            </Extra>

            {/* LA EVIDENCIA NO SE COPIA: se guarda el vínculo de Drive, y queda colgada de la
                actividad — no suelta en la obra. */}
            <Extra titulo="Evidencia (foto, remito, plano)" testid="parte-evidencia">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Campo rotulo="Enlace de Drive" className="sm:col-span-2">
                  <input name="evidencia" className={CAMPO} placeholder="https://drive.google.com/file/d/…" data-testid="parte-evidencia-enlace" />
                </Campo>
                <Campo rotulo="Nombre" ayuda="Sólo si el archivo no está en el índice de Drive.">
                  <input name="evidencia_nombre" maxLength={300} className={CAMPO} />
                </Campo>
              </div>
            </Extra>

            <p className="text-[11px] leading-relaxed text-faint">
              Un parte mueve la producción y el avance de la actividad; las horas van a Personal, a la
              obra y a cada persona; el equipo y la evidencia quedan en la actividad. Se carga una
              sola vez, y no cierra el día.
            </p>
          </div>
        </FormAccion>
      </section>

      {/* ═══ LA JORNADA, Y LO QUE LA RESPALDA ═══ */}
      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <div className="flex flex-wrap gap-x-9 gap-y-4" data-testid="kpis-jornada">
          <Kpi k="Partes de la jornada" v={String(kpis.partes)} sub={fmtFecha(dia)} />
          <Kpi k="Actividades tocadas" v={String(kpis.tocadas)} sub={`de ${kpis.enCurso} en curso`} />
          <Kpi
            k="Sin parte" v={String(kpis.sinParte)} neg={kpis.sinParte > 0}
            sub={kpis.enCurso === 0 ? 'ningún frente declarado en curso' : 'frentes en curso sin reportar'}
          />
        </div>

        <section>
          <Eyebrow className="mb-2.5">Partes registrados</Eyebrow>
          {partes.length === 0 ? (
            <Vacio>Todavía no se cargó ningún parte. El primero se registra en el formulario de la izquierda.</Vacio>
          ) : (
            <>
              <Tabla testid="tabla-partes" minWidth={720}>
                <THead>
                  <Th>Fecha</Th><Th>Actividad</Th><Th num>Cantidad</Th>
                  <Th>Comentario</Th><Th>Origen</Th><Th num />
                </THead>
                <tbody>
                  {partes.slice(0, 60).map((p) => {
                    const a = porActividad.get(p.actividad_id)
                    return (
                      // La fila de la jornada que se está cargando se marca con la regla de marca,
                      // que es como el sistema dice «esto es lo que estás mirando».
                      <Tr key={p.id} compacta seleccionada={p.fecha === dia} className="group">
                        <Td num className="whitespace-nowrap text-muted">{fmtFecha(p.fecha)}</Td>
                        <Td fuerte>{a?.nombre ?? <Nulo>actividad archivada</Nulo>}</Td>
                        <Td num>
                          {p.cantidad != null
                            ? `+${num(p.cantidad, 2)} ${a?.unidad ?? ''}`
                            : p.avance_pct != null ? `+${num(p.avance_pct)}%` : <Nulo>sin medición</Nulo>}
                        </Td>
                        <Td className="max-w-[240px] truncate">{p.comentario ?? ''}</Td>
                        <Td>
                          <span className="text-[11.5px] text-faint">
                            {p.fuente === 'web' ? 'cargado en la web' : 'Avances de Obra'}
                          </span>
                        </Td>
                        {/* El borrado va en la celda y NO en el `···` del sistema: el menú
                            contextual dibuja sus ítems dentro de un `<button>`, y `BotonAccion` es
                            un `<form>` —anidarlos es marcado inválido, y reemplazarlo por un
                            `onClick` perdería el error del servidor, que es la única prueba de que
                            la fila se borró de verdad. */}
                        <Td num>
                          {/* «Acciones de fila: sólo en hover o menú contextual» — sesenta botones
                              rojos apilados convierten la columna de borrar en lo más llamativo de
                              una tabla que se abre para LEER. Sigue alcanzable con el teclado:
                              `focus-within` la muestra al tabular. */}
                          <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <BotonAccion accion={borrarParte} args={[p.id]} testid="borrar-parte" tono="peligro">
                              Borrar
                            </BotonAccion>
                          </span>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Tabla>
              <p className="mt-2.5 text-[11.5px] text-faint">
                {partes.length > 60 && `Se muestran los 60 más recientes de ${partes.length}. `}
                Las actividades sin medición definida no aceptan cantidad — sólo HH y comentario. No
                se cargan como 0.
              </p>
            </>
          )}
        </section>

        <section>
          <Eyebrow className="mb-2.5">Cómo viene cada frente</Eyebrow>
          {orden.length === 0
            ? <Vacio>Esta obra todavía no tiene actividades cargadas. Se crean en Planificación.</Vacio>
            : (
                <Tabla testid="tabla-ejecucion" minWidth={680}>
                  <THead>
                    <Th>Actividad</Th><Th num>Jornada</Th><Th num>Acumulado</Th>
                    <Th>Avance</Th><Th num>HH</Th>
                  </THead>
                  <tbody>
                    {orden.map((a) => {
                      const hoyDe = movidoHoy.get(a.id)
                      const cant = a.metodo_avance === 'cantidad'
                      return (
                        <Tr key={a.id} compacta>
                          <Td fuerte>
                            {a.nombre}
                            {a.rubro && <span className="block text-[11px] text-faint">{a.rubro}</span>}
                          </Td>
                          <Td num>
                            {hoyDe
                              ? <span className="text-ink">+{cant ? `${num(hoyDe.cantidad, 2)} ${a.unidad ?? ''}` : `${num(hoyDe.pct)}%`}</span>
                              : <Nulo>—</Nulo>}
                          </Td>
                          <Td num>
                            {cant
                              ? <span>{num(a.cantidad_ejecutada ?? 0, 2)}<span className="text-faint">/{num(a.cantidad_objetivo, 2)} {a.unidad}</span></span>
                              : a.n_partes > 0
                                ? <span className="text-muted">{a.n_partes} parte(s)</span>
                                : <Nulo>sin medición</Nulo>}
                          </Td>
                          <Td>
                            {a.estado_operativo === 'bloqueada'
                              ? <Estado tono="neg" clave="bloqueada">bloqueada</Estado>
                              : <Barra pct={a.avance_pct} />}
                          </Td>
                          <Td num>{a.hh_real == null ? <Nulo>—</Nulo> : num(a.hh_real)}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Tabla>
              )}
        </section>
      </div>
    </div>
  )
}
