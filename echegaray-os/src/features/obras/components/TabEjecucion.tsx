'use client'

// EJECUCIÓN — «¿QUÉ SE HIZO HOY?». La pantalla de campo, en el lenguaje del Design canónico (05).
//
// ═══ EL FORMULARIO NO COMPITE CON EL INFORME ═══
//
//   Izquierda: el parte del día, SIEMPRE ABIERTO y de una sola lectura —Fecha → Actividad →
//   Cantidad/HH → quién y con qué → nota → Registrar—. Derecha: lo cargado en esa jornada y cómo
//   viene cada frente. Nada más: el que carga un parte a las 18:30 no necesita un tablero al lado.
//
// ═══ LO SECUNDARIO ES UN ICONO, NO UN BLOQUE ═══
//
// Personas, equipos, evidencia e impedimento eran cuatro secciones permanentes, y el reparto de
// horas dibujaba dieciocho casilleros que hay que pasar de largo todos los días para llegar al
// botón. Ahora cada uno es un chip con su icono y su cuenta. Mismos campos, mismo envío —la
// producción a `obra_ejecucion` y las horas a `registros_hh`—: lo que cambió es que el 90% de los
// partes no los ve. El «qué mueve un parte» quedó en la ayuda plegada.
//
// ═══ LO QUE NO SE PUEDE MOSTRAR, NO SE INVENTA ═══
//
// El Design pone «HH» y «PERSONAS» de la jornada en la cabecera de «Cargado hoy». Esta solapa no lee
// `registros_hh` —las horas del parte las escribe la carga de Personal— y sumarlas desde otra fuente
// sería una segunda definición de las HH del día. Se muestran el día que la página las pase; hasta
// entonces, la cabecera dice sólo lo que sabe. Ver `ejecucionService.kpisDelDia`.

import { useMemo, useState } from 'react'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  Ayuda, BarraAvance, CAMPO, Campo, Estado, Filtros, Nulo, Plegable, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import {
  IconoComentario, IconoCompletar, IconoCrear, IconoCuadrilla, IconoFoto, IconoHerramienta,
  IconoProblema,
} from '@/shared/components/iconos'
import type { Actividad, ParteEjecucion, Persona } from '../types'
import { deHoy, kpisDelDia } from '../services/ejecucionService'
import { FilasDeEquipo } from './FilasDeEquipo'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL } from '../types'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** El avance con la barra del sistema. Sin fracción no se dibuja la pista: el hueco ES el dato. */
function Barra({ pct }: { pct: number | null }) {
  if (pct == null) return <Nulo>sin medición</Nulo>
  return (
    <span className="flex items-center gap-2">
      <span className="w-16 shrink-0"><BarraAvance pct={pct} /></span>
      <span className="font-mono text-[12px] tabular-nums text-muted">{num(pct)}%</span>
    </span>
  )
}

/**
 * UN CHIP QUE ABRE LO SUYO. Es `<details>` y no un botón con estado: el contenido son CAMPOS del
 * formulario, y un campo que sólo existe cuando React decide dibujarlo no viaja en el envío si
 * alguien lo cerró antes de guardar. Con `<details>` el campo está siempre en el DOM.
 * Abierto ocupa su propia línea (`open:w-full`) para que el panel no deforme la fila de chips.
 */
function Chip({ icono, rotulo, texto, tono = 'neutral', testid, children }: {
  icono: React.ReactNode
  /** El nombre accesible, SIEMPRE. Un chip de sólo icono sin `title` es un botón sin nombre. */
  rotulo: string
  /** Sin texto, el chip es sólo icono: toolbar, no botonera. */
  texto?: string
  tono?: 'neutral' | 'falta'
  testid: string
  children: React.ReactNode
}) {
  return (
    <details data-testid={testid} className="min-w-0 open:order-last open:w-full">
      <summary
        title={rotulo} aria-label={rotulo}
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] [&::-webkit-details-marker]:hidden ${
          tono === 'falta' ? 'border-warn/40 bg-warn-soft text-warn' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
        }`}
      >
        <span className="[&>svg]:h-[15px] [&>svg]:w-[15px]">{icono}</span>
        {texto}
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  )
}

/**
 * UN PARTE, EN UNA FILA — la misma en la jornada y en el historial: si la fila de auditoría se
 * dibujara distinta, el mismo hecho tendría dos formas. La nota va como icono con el texto en el
 * `title`; una columna de comentarios es media pantalla para lo que casi siempre está vacío.
 *
 * El borrado va en la fila y NO en el `···`: ese menú dibuja sus ítems dentro de un `<button>` y
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
    <li className="group flex items-center gap-2.5 border-b border-[#F5F4F0] px-4 py-2 last:border-0">
      {conFecha
        ? <span className="w-[52px] shrink-0 font-mono text-[11px] tabular-nums text-faint">{fmtFecha(p.fecha)}</span>
        : <IconoCompletar className="h-[14px] w-[14px] shrink-0 text-pos" />}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        {a?.nombre ?? <Nulo>actividad archivada</Nulo>}
      </span>
      {p.comentario && (
        <span title={p.comentario} className="shrink-0 text-faint"><IconoComentario className="h-[13px] w-[13px]" /></span>
      )}
      <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-ink">
        {p.cantidad != null
          ? `+${num(p.cantidad, 2)} ${a?.unidad ?? ''}`
          : p.avance_pct != null ? `+${num(p.avance_pct)}%` : <Nulo>sin medición</Nulo>}
      </span>
      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <BotonAccion accion={borrar} args={[p.id]} testid="borrar-parte" tono="peligro">Borrar</BotonAccion>
      </span>
    </li>
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
  const [hayMedida, setHayMedida] = useState(false)
  const [soloCurso, setSoloCurso] = useState(true)
  // LAS HH DEL DÍA SE SUMAN DE LOS CASILLEROS, no de un campo aparte: una hora pertenece SIEMPRE a
  // una persona, porque de esa fila sale la liquidación. El chip dice cuántas personas ya tienen
  // horas puestas — que es lo que el Design muestra sin abrir la lista.
  const [reparto, setReparto] = useState({ hh: 0, gente: 0 })

  // Sólo las que se ejecutan: un rubro de resumen no se produce, se completa solo con sus hijas.
  const ejecutables = useMemo(
    () => actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada),
    [actividades])
  const movidoHoy = useMemo(() => deHoy(partes, dia), [partes, dia])
  const porActividad = useMemo(() => new Map(ejecutables.map((a) => [a.id, a])), [ejecutables])
  const kpis = useMemo(() => kpisDelDia(partes, actividades, dia), [partes, actividades, dia])
  const delDia = useMemo(() => partes.filter((p) => p.fecha === dia), [partes, dia])

  // Elegir una cuadrilla recorta los casilleros a los suyos. Sin cuadrilla, el plantel entero: no
  // toda obra las tiene armadas, y exigirlas para poder cargar horas sería fricción por nada.
  const delPlantel = useMemo(() => {
    const suyos = cuadrilla ? new Set(integrantes[cuadrilla] ?? []) : null
    return suyos ? personas.filter((p) => suyos.has(p.id)) : personas
  }, [personas, cuadrilla, integrantes])

  // Las que ya arrancaron primero: es lo que se carga todos los días. Lo que todavía no empezó
  // ocupa el final de la lista en vez de empujar hacia abajo lo que está en curso.
  const orden = useMemo(() => [...ejecutables].sort((a, b) => {
    const vivo = (x: Actividad) => (x.estado_operativo === 'en_curso' ? 0 : x.avance_pct ? 1 : 2)
    return vivo(a) - vivo(b) || a.orden - b.orden
  }), [ejecutables])

  // EN CURSO ES UN HECHO, NO UN RÓTULO: la actividad declarada en curso, o la que tiene avance
  // empezado y sin terminar. Con sólo el rótulo, un frente que avanza y nadie declaró desaparece
  // de la lista donde se lo carga.
  const enCurso = (a: Actividad) =>
    a.estado_operativo === 'en_curso' || (a.avance_pct != null && a.avance_pct > 0 && a.avance_pct < 100)
  const frentes = soloCurso ? orden.filter(enCurso) : orden

  const sel = elegida ? porActividad.get(elegida) ?? null : null
  // EL % DEL DÍA ES EL CAMPO DE `manual` **Y** DE `partes`: la vista de control suma
  // `obra_ejecucion.avance_pct` para los dos. El campo estaba deshabilitado para `partes` con el
  // rótulo «sin medición», y como la acción exige cantidad o avance, una actividad medida por sus
  // partes no podía recibir un parte por ninguna puerta: el formulario rebotaba siempre.
  const porDeclaracion = sel != null && (sel.metodo_avance === 'manual' || sel.metodo_avance === 'partes')
  // LO QUE FALTA SE NOMBRA, y es lo que el SERVIDOR exige: sin cantidad ni avance devuelve «Poné la
  // cantidad ejecutada o el avance del día». Las HH solas no alcanzan, y prometer que sí sería
  // mandar a la persona a un error que la pantalla ya conocía.
  const falta = sel == null
    ? 'Elegí la actividad'
    : !hayMedida
      ? (porDeclaracion ? 'Cargá el avance del día' : 'Cargá la cantidad')
      : null

  function sumarHoras(e: React.FormEvent<HTMLDivElement>) {
    const casilleros = e.currentTarget.querySelectorAll<HTMLInputElement>('input[name^="horas_"]')
    let hh = 0
    let gente = 0
    for (const c of casilleros) {
      const v = Number(c.value) || 0
      hh += v
      if (v > 0) gente += 1
    }
    setReparto({ hh, gente })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ═══ EL PARTE DEL DÍA ═══ */}
      <section
        data-testid="panel-registrar"
        className="min-w-0 rounded-card border border-line bg-surface p-4 lg:w-[420px] lg:shrink-0"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-[14px] font-semibold text-ink">¿Qué se hizo hoy?</h2>
          <input
            type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            aria-label="Jornada del parte" data-testid="dia-ejecucion"
            className="ml-auto w-[128px] rounded-control border border-line bg-surface px-2 py-[3px] font-mono text-[12px] tabular-nums text-muted"
          />
        </div>

        <FormAccion
          accion={registrar} testid="form-ejecucion" enviar="Registrar parte"
          mensajeOk="Parte registrado." className="mt-3.5"
          bloqueado={falta !== null} motivoBloqueo={falta}
        >
          <input type="hidden" name="fecha" value={dia} />
          <div className="flex flex-col gap-3">
            <Campo rotulo="Actividad" ayuda={sel && sel.metodo_avance === 'cantidad'
              ? `${num(sel.cantidad_ejecutada ?? 0, 2)} de ${num(sel.cantidad_objetivo, 2)} ${sel.unidad ?? ''}`
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

            {/* CANTIDAD Y AVANCE SON EXCLUYENTES: se dibuja UNO, el que mueve el número de esta
                actividad. El otro nombre no existe en el DOM, así que no se puede colar un 0 en una
                actividad que no se mide así. */}
            <div className="flex gap-2.5">
              <Campo rotulo={porDeclaracion ? 'Avance del día' : 'Cantidad ejecutada'} className="flex-1">
                <span className="relative block">
                  <input
                    name={porDeclaracion ? 'avance_pct' : 'cantidad'}
                    type="number" step="any" min="0" max={porDeclaracion ? 100 : undefined}
                    placeholder="0,00"
                    onChange={(e) => setHayMedida(e.target.value !== '')}
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
              <Campo rotulo="HH" className="w-[96px] shrink-0">
                <span className={`${CAMPO} flex items-center justify-between font-mono tabular-nums`}>
                  <span data-testid="parte-hh-total" className={reparto.hh > 0 ? 'text-ink' : 'text-faint'}>
                    {num(reparto.hh, 2)}
                  </span>
                </span>
              </Campo>
            </div>
            {/* EL AVISO DEL NO-OP SILENCIOSO: en una actividad medida por pasos, la cantidad de este
                parte se guarda y su porcentaje NO se mueve —lo produce el tildado de los pasos—.
                Éxito informado con el dato quieto es el peor modo de falla, y acá se dice antes. */}
            {sel?.metodo_avance === 'pasos' && (
              <p className="-mt-1 flex items-center gap-1.5 text-[11.5px] text-warn" data-testid="aviso-pasos">
                <IconoProblema className="h-[13px] w-[13px] shrink-0" />
                Se mide por pasos: su avance sale de tildarlos, no de este parte
              </p>
            )}

            {/* ═══ LO SECUNDARIO, A UN TOQUE ═══ */}
            <div className="flex flex-wrap items-start gap-2">
              {/* LAS HORAS SON LAS MISMAS DE PERSONAL: el reparto viaja con el mismo contrato
                  (`horas_<uuid>`) que la carga masiva de la pestaña Personal, y lo escribe la misma
                  acción. La misma hora se carga UNA vez. */}
              <Chip
                icono={<IconoCuadrilla />} testid="parte-personal" rotulo="Quién trabajó y cuántas horas"
                texto={reparto.gente > 0 ? `${reparto.gente} personas` : 'quién trabajó'}
                tono={reparto.gente > 0 ? 'neutral' : 'falta'}
              >
                <div onInput={sumarHoras}>
                  <select
                    className={CAMPO} value={cuadrilla} data-testid="parte-cuadrilla"
                    aria-label="Cuadrilla" onChange={(e) => setCuadrilla(e.target.value)}
                  >
                    <option value="">Todo el plantel · {personas.length} personas</option>
                    {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {delPlantel.map((p) => (
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
              </Chip>

              {/* EL EQUIPO NO ES UNA PERSONA: las horas de una persona van a `registros_hh` —de
                  donde sale la liquidación— y las de una máquina a `obra_ejecucion_equipo`. Si
                  compartieran tabla, el costo de mano de obra incluiría a la hormigonera. */}
              <Chip icono={<IconoHerramienta />} rotulo="Equipos utilizados" texto="equipos" testid="parte-equipos">
                <FilasDeEquipo catalogo={equipos} />
              </Chip>

              {/* LA EVIDENCIA NO SE COPIA: se guarda el vínculo de Drive, y queda colgada de la
                  actividad — no suelta en la obra. */}
              <Chip icono={<IconoFoto />} rotulo="Adjuntar foto o remito" testid="parte-evidencia">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo rotulo="Enlace de Drive" className="sm:col-span-2">
                    <input name="evidencia" className={CAMPO} placeholder="https://drive.google.com/file/d/…" data-testid="parte-evidencia-enlace" />
                  </Campo>
                  <Campo rotulo="Nombre" ayuda="Sólo si el archivo no está en el índice de Drive.">
                    <input name="evidencia_nombre" maxLength={300} className={CAMPO} />
                  </Campo>
                </div>
              </Chip>

              {/* EL IMPEDIMENTO SE ANOTA CUANDO PASA. El que hay que ir a cargar a otra pantalla se
                  anota mañana o nunca. Sale por la MISMA acción que lo anota en Operación, atado a
                  la actividad de este parte. */}
              <Chip icono={<IconoProblema />} rotulo="Anotar un impedimento" testid="parte-impedimento">
                <div className="grid gap-2 sm:grid-cols-2">
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
              </Chip>
            </div>

            {/* El comentario NO usa `CAMPO`: esa clase fija el alto del control y un área de texto
                tiene que poder crecer. Mismo borde, mismo radio, mismo tamaño de letra. */}
            <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface px-2.5 py-2">
              <IconoComentario className="mt-[3px] h-[14px] w-[14px] shrink-0 text-faint" />
              <textarea
                name="comentario" maxLength={500} rows={2} data-testid="parte-comentario"
                aria-label="Nota del día" placeholder="Nota del día"
                className="w-full bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint"
              />
            </div>

            <Ayuda titulo="Qué mueve un parte" testid="ayuda-parte-diario">
              Un mismo parte escribe la producción de la actividad y las horas: van a Personal, a la
              obra y a cada persona. Se carga una sola vez —no hay que repetir las horas en
              Personal— y no cierra el día.
            </Ayuda>
          </div>
        </FormAccion>
      </section>

      {/* ═══ LA JORNADA, Y CÓMO VIENE CADA FRENTE ═══ */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className="rounded-card border border-line bg-surface" data-testid="cargado-hoy">
          <div className="flex items-center gap-2.5 border-b border-[#EFEEEA] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink">
              {dia === hoy ? 'Cargado hoy' : `Cargado el ${fmtFecha(dia)}`}
            </h2>
            <span className="font-mono text-[11.5px] tabular-nums text-muted">
              {delDia.length} {delDia.length === 1 ? 'parte' : 'partes'}
            </span>
          </div>
          {delDia.length === 0 ? (
            <p className="px-4 py-5 text-[12.5px] text-faint">Todavía no se cargó nada de esta jornada.</p>
          ) : (
            <ul>
              {delDia.map((p) => (
                <FilaParte key={p.id} parte={p} actividad={porActividad.get(p.actividad_id)} borrar={borrarParte} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-line bg-surface" data-testid="frentes">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#EFEEEA] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink">Frentes</h2>
            {/* EL PROBLEMA, VISIBLE SIN ABRIR NADA: frentes en curso que hoy no reportaron. */}
            {kpis.sinParte > 0 && <Estado tono="warn" clave="sin-parte">{kpis.sinParte} sin parte</Estado>}
            <div className="ml-auto">
              <Filtros
                testid="frentes-filtro"
                opciones={[
                  { label: 'En curso', activo: soloCurso, onClick: () => setSoloCurso(true), testid: 'frentes-curso' },
                  { label: 'Todos', activo: !soloCurso, onClick: () => setSoloCurso(false), testid: 'frentes-todo' },
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
                <Tabla testid="tabla-ejecucion" minWidth={620} className="border-t-0 px-4">
                  <THead>
                    <Th>Actividad</Th><Th num>Jornada</Th><Th num>Acumulado</Th>
                    <Th>Avance</Th><Th num>HH</Th><Th num />
                  </THead>
                  <tbody>
                    {frentes.map((a) => {
                      const hoyDe = movidoHoy.get(a.id)
                      const cant = a.metodo_avance === 'cantidad'
                      return (
                        <Tr key={a.id} compacta seleccionada={a.id === elegida}>
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
                          <Td num>
                            <button
                              type="button" onClick={() => setElegida(a.id)}
                              title="Cargar el parte de este frente" aria-label={`Cargar el parte de ${a.nombre}`}
                              data-testid={`cargar-frente-${a.id}`}
                              className="text-faint transition-colors hover:text-ink"
                            ><IconoCrear className="h-[14px] w-[14px]" /></button>
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Tabla>
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
    </div>
  )
}
