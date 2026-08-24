'use client'

// PARTE DIARIO — «¿QUÉ SE HIZO HOY?». La pantalla de campo, en la composición del canónico 05.
//
// ═══ EL FORMULARIO NO COMPITE CON EL INFORME ═══
//
//   Izquierda (404 px fijos): el parte del día, SIEMPRE ABIERTO y de una sola lectura —Actividad →
//   Cantidad/HH → quién y con qué → nota → Registrar—. Derecha: lo cargado en esa jornada y cómo
//   viene cada frente (`ParteDiarioJornada`). Nada más: el que carga un parte a las 18:30 no
//   necesita un tablero al lado.
//
// ═══ LA JORNADA SE ELIGE ARRIBA, NO ADENTRO DEL FORMULARIO ═══
//
// El canónico pone el día en una barra propia —‹ · Hoy 23/08 · ›— porque manda sobre las DOS
// columnas: el formulario carga ese día y la lista muestra ese día. Adentro del panel izquierdo
// parecía un campo más del parte, y el que retrocedía un día no entendía por qué le cambiaba la
// lista de la derecha. El chip conserva un `input[type=date]` real: las flechas resuelven el 95%
// (ayer), y una carga atrasada de una semana no puede exigir siete clics.
//
// ═══ LO SECUNDARIO ES UN ICONO, NO UN BLOQUE ═══
//
// Personas, equipos, evidencia e impedimento eran cuatro secciones permanentes, y el reparto de
// horas dibujaba dieciocho casilleros que hay que pasar de largo todos los días para llegar al
// botón. Ahora cada uno es un chip: con cuenta si la tiene, redondo de 30 px si es sólo icono.
// Mismos campos, mismo envío —la producción a `obra_ejecucion` y las horas a `registros_hh`—.

import { useMemo, useState } from 'react'
import { FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { Ayuda, CAMPO, Campo } from '@/shared/components/ds'
import {
  IconoComentario, IconoCuadrilla, IconoDesplegar, IconoFecha, IconoFoto, IconoHerramienta,
  IconoProblema,
} from '@/shared/components/iconos'
import type { Actividad, ParteEjecucion, Persona } from '../types'
import type { HoraDeJornada } from '../services/ejecucionService'
import { jornadaHH, kpisDelDia, pendienteDe } from '../services/ejecucionService'
import { FilasDeEquipo } from './FilasDeEquipo'
import { ParteDiarioJornada } from './ParteDiarioJornada'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL } from '../types'

const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** El día corrido `n` posiciones desde `iso`, en el mismo formato ISO. En UTC a propósito: con la
 *  hora local, un `Date` de medianoche en San Juan (UTC−3) retrocede al día anterior al serializar. */
function correr(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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
  /** Sin texto es un botón REDONDO de 30 px, no una píldora angosta: así lo mide el canónico. */
  texto?: string
  tono?: 'neutral' | 'falta'
  testid: string
  children: React.ReactNode
}) {
  const forma = texto
    ? 'gap-[7px] rounded-[16px] px-[11px] py-[5px] text-[12px] font-medium'
    : 'h-[30px] w-[30px] justify-center rounded-[15px]'
  return (
    <details data-testid={testid} className="min-w-0 open:order-last open:w-full">
      <summary
        title={rotulo} aria-label={rotulo}
        className={`inline-flex cursor-pointer list-none items-center border ${forma} [&::-webkit-details-marker]:hidden ${
          tono === 'falta' ? 'border-[#F0E1CD] bg-[#FDF6EE] text-warn' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
        }`}
      >
        <span className="[&>svg]:h-[14px] [&>svg]:w-[14px]">{icono}</span>
        {texto}
      </summary>
      <div className="mt-[11px]">{children}</div>
    </details>
  )
}

export function TabEjecucion({
  actividades, partes, personas, cuadrillas, integrantes, hoy, registrar, borrarParte,
  equipos = [], registrosHH,
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
  /** `registros_hh` de la obra, para HH y PERSONAS de la jornada. OPCIONAL a propósito: sin él la
   *  cabecera dice «sin registrar», que es la verdad —no cero—. Ver `jornadaHH`. */
  registrosHH?: HoraDeJornada[]
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
  // horas puestas — que es lo que el canónico muestra sin abrir la lista.
  const [reparto, setReparto] = useState({ hh: 0, gente: 0 })

  // Sólo las que se ejecutan: un rubro de resumen no se produce, se completa solo con sus hijas.
  const ejecutables = useMemo(
    () => actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada),
    [actividades])
  const porActividad = useMemo(() => new Map(ejecutables.map((a) => [a.id, a])), [ejecutables])
  const kpis = useMemo(() => kpisDelDia(partes, actividades, dia), [partes, actividades, dia])
  const delDia = useMemo(() => partes.filter((p) => p.fecha === dia), [partes, dia])
  const jornada = useMemo(() => jornadaHH(registrosHH, dia), [registrosHH, dia])

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

  const flecha = 'flex h-[27px] w-[27px] items-center justify-center rounded-control border border-line bg-surface text-muted transition-colors enabled:hover:text-ink disabled:text-line-strong'

  return (
    <div className="flex flex-col gap-3">
      {/* ═══ LA JORNADA, ARRIBA DE TODO: manda sobre las dos columnas ═══ */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button" title="Día anterior" aria-label="Día anterior" data-testid="dia-anterior"
          onClick={() => setDia((d) => correr(d, -1))} className={flecha}
        ><IconoDesplegar className="h-[14px] w-[14px] rotate-90" /></button>
        <label className="flex items-center gap-[7px] rounded-control border border-line bg-surface px-2.5 py-1">
          <IconoFecha className="h-[13px] w-[13px] text-muted" />
          <span className="text-[12.5px] font-semibold text-ink">
            {dia === hoy ? 'Hoy' : dia === correr(hoy, -1) ? 'Ayer' : 'Día'}
          </span>
          {/* El `input` es el dato Y el control: una carga atrasada elige la fecha sin contar clics. */}
          <input
            type="date" value={dia} max={hoy} onChange={(e) => e.target.value && setDia(e.target.value)}
            aria-label="Jornada del parte" data-testid="dia-ejecucion"
            className="w-[104px] bg-transparent font-mono text-[11.5px] tabular-nums text-muted outline-none"
          />
        </label>
        <button
          type="button" title="Día siguiente" aria-label="Día siguiente" data-testid="dia-siguiente"
          onClick={() => setDia((d) => correr(d, 1))} disabled={dia >= hoy} className={flecha}
        ><IconoDesplegar className="h-[14px] w-[14px] -rotate-90" /></button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* ═══ EL PARTE DEL DÍA ═══ */}
        <section
          data-testid="panel-registrar"
          className="min-w-0 rounded-card border border-line bg-surface px-4 pb-4 pt-[14px] lg:w-[404px] lg:shrink-0"
        >
          <h2 className="text-[14px] font-semibold text-ink">¿Qué se hizo hoy?</h2>

          <FormAccion
            accion={registrar} testid="form-ejecucion" enviar="Registrar"
            mensajeOk="Parte registrado." className="mt-[13px]"
            bloqueado={falta !== null} motivoBloqueo={falta}
          >
            <input type="hidden" name="fecha" value={dia} />
            <div className="flex flex-col gap-3">
              <Campo rotulo="Actividad">
                <select
                  name="actividad_id" className={CAMPO} value={elegida} data-testid="parte-actividad" required
                  onChange={(e) => setElegida(e.target.value)}
                >
                  <option value="" disabled>Elegí la actividad</option>
                  {orden.map((a) => {
                    // EL PENDIENTE VA EN LA OPCIÓN, como en el canónico: es el número que decide
                    // cuánto cargar, y buscarlo en otra pantalla es abandonar el parte a medias.
                    const p = pendienteDe(a)
                    return (
                      <option key={a.id} value={a.id}>
                        {a.rubro ? `${a.rubro} · ` : ''}{a.nombre}
                        {p ? ` — ${num(p.cantidad, 2)} ${p.unidad} pendiente` : ''}
                      </option>
                    )
                  })}
                </select>
              </Campo>

              {/* CANTIDAD Y AVANCE SON EXCLUYENTES: se dibuja UNO, el que mueve el número de esta
                  actividad. El otro nombre no existe en el DOM, así que no se puede colar un 0 en
                  una actividad que no se mide así. */}
              <div className="grid grid-cols-[1fr_96px] gap-2.5">
                <Campo rotulo={porDeclaracion ? 'Avance del día' : 'Cantidad ejecutada'}>
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
                <Campo rotulo="HH">
                  <span className={`${CAMPO} flex items-center font-mono tabular-nums`}>
                    <span data-testid="parte-hh-total" className={reparto.hh > 0 ? 'text-ink' : 'text-faint'}>
                      {num(reparto.hh, 2)}
                    </span>
                  </span>
                </Campo>
              </div>
              {/* EL AVISO DEL NO-OP SILENCIOSO: en una actividad medida por pasos, la cantidad de
                  este parte se guarda y su porcentaje NO se mueve —lo produce el tildado de los
                  pasos—. Éxito informado con el dato quieto es el peor modo de falla. */}
              {sel?.metodo_avance === 'pasos' && (
                <p className="-mt-1 flex items-center gap-1.5 text-[11px] text-warn" data-testid="aviso-pasos">
                  <IconoProblema className="h-[13px] w-[13px] shrink-0" />
                  Se mide por pasos: su avance sale de tildarlos, no de este parte
                </p>
              )}

              {/* ═══ LO SECUNDARIO, A UN TOQUE ═══ */}
              <div className="flex flex-wrap items-start gap-2">
                {/* LAS HORAS SON LAS MISMAS DE PERSONAL: el reparto viaja con el mismo contrato
                    (`horas_<uuid>`) que la carga masiva de la pestaña Personal, y lo escribe la
                    misma acción. La misma hora se carga UNA vez. */}
                <Chip
                  icono={<IconoCuadrilla />} testid="parte-personal" rotulo="Quién trabajó y cuántas horas"
                  texto={reparto.gente > 0 ? `${reparto.gente} personas` : 'quién trabajó'}
                  tono={reparto.gente > 0 ? 'neutral' : 'falta'}
                >
                  {/* SIN PLANTEL NO HAY LISTA VACÍA: una grilla de cero casilleros se lee como
                      «no trabajó nadie». Lo que pasa es que esta obra no tiene gente asignada. */}
                  {personas.length === 0 ? (
                    <p className="text-[12px] text-faint" data-testid="parte-sin-plantel">
                      Sin personas fichadas hoy. Se asignan en Personal.
                    </p>
                  ) : (
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
                  )}
                </Chip>

                {/* EL EQUIPO NO ES UNA PERSONA: las horas de una persona van a `registros_hh` —de
                    donde sale la liquidación— y las de una máquina a `obra_ejecucion_equipo`. Si
                    compartieran tabla, el costo de mano de obra incluiría a la hormigonera. */}
                <Chip icono={<IconoHerramienta />} rotulo="Equipos utilizados" texto="equipos" testid="parte-equipos">
                  <FilasDeEquipo catalogo={equipos} />
                </Chip>

                {/* LA EVIDENCIA NO SE COPIA: no hay subida de archivos en el OS —se sube a Drive y
                    se guarda el VÍNCULO, colgado de la actividad—. El bloque lo dice en vez de
                    ofrecer un botón de adjuntar que no existe. */}
                <Chip icono={<IconoFoto />} rotulo="Adjuntar foto o remito" testid="parte-evidencia">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Campo rotulo="Enlace de Drive" className="sm:col-span-2"
                      ayuda="La foto se sube a la carpeta de la obra en Drive y acá se pega el enlace: el OS guarda el vínculo, no una copia.">
                      <input name="evidencia" className={CAMPO} placeholder="https://drive.google.com/file/d/…" data-testid="parte-evidencia-enlace" />
                    </Campo>
                    <Campo rotulo="Nombre" ayuda="Sólo si el archivo no está en el índice de Drive.">
                      <input name="evidencia_nombre" maxLength={300} className={CAMPO} />
                    </Campo>
                  </div>
                </Chip>

                {/* EL IMPEDIMENTO SE ANOTA CUANDO PASA. El que hay que ir a cargar a otra pantalla
                    se anota mañana o nunca. Sale por la MISMA acción que lo anota en Operación,
                    atado a la actividad de este parte. */}
                <Chip icono={<IconoProblema />} rotulo="Anotar un impedimento" testid="parte-impedimento">
                  <div className="grid gap-2 rounded-[8px] border border-[#F3DDDA] bg-[#FEF6F5] p-2.5 sm:grid-cols-2">
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
                  tiene que poder crecer. Mismo borde, mismo tamaño de letra, radio de contenedor. */}
              <div className="flex items-start gap-2 rounded-[8px] border border-line px-2.5 py-[9px]">
                <IconoComentario className="mt-[2px] h-[14px] w-[14px] shrink-0 text-faint" />
                <textarea
                  name="comentario" maxLength={500} rows={2} data-testid="parte-comentario"
                  aria-label="Nota del día" placeholder="Nota del día"
                  className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-ink outline-none placeholder:text-faint"
                />
              </div>

              <Ayuda titulo="Qué mueve un parte" testid="ayuda-parte-diario">
                Un mismo parte escribe la producción de la actividad y las horas: van a Personal, a
                la obra y a cada persona. Se carga una sola vez —no hay que repetir las horas en
                Personal— y no cierra el día.
              </Ayuda>
            </div>
          </FormAccion>
        </section>

        <ParteDiarioJornada
          dia={dia} esHoy={dia === hoy} partes={partes} delDia={delDia} frentes={frentes}
          elegida={elegida} sinParte={kpis.sinParte} jornada={jornada} soloCurso={soloCurso}
          verCurso={setSoloCurso} elegir={setElegida} borrarParte={borrarParte}
          porActividad={porActividad}
        />
      </div>
    </div>
  )
}
