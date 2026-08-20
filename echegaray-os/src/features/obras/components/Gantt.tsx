'use client'

// EL GANTT DE OBRA. Es la herramienta de ejecución del módulo, no un gráfico.
//
// ═══ POR QUÉ ES CÓDIGO PROPIO Y NO UNA LIBRERÍA ═══
//
// Se evaluaron las vigentes (agosto 2026). Las dos serias con licencia MIT —`dhtmlx-gantt` 10.x y
// `@svar-ui/react-gantt`— ponen **baseline y camino crítico detrás del muro PRO**, y baseline es uno
// de los cuatro requisitos declarados de este módulo. `frappe-gantt` es la más liviana pero sólo
// soporta fin-a-comienzo y no publica tipos. Además este repo no tiene NI UNA dependencia de UI de
// terceros —sólo Next, React, Supabase, Zod y Tailwind— y ninguna librería del mercado modela
// restricciones, que es lo que hace que este Gantt sirva para algo. Sumar 90 KB y 17 paquetes para
// la primera pantalla del módulo es un cambio de arquitectura, no una elección de componente.
//
// ═══ LAS DECISIONES DE IMPLEMENTACIÓN QUE IMPORTAN ═══
//
// · UN SOLO contenedor con scroll y `position: sticky` para el encabezado y la columna izquierda.
//   Sincronizar dos scrolls por JavaScript es de donde sale el tirón que hace sentir lento un Gantt.
// · La escala se acumula por celda; NUNCA `left = (fecha − inicio) × pxPorDía` sobre meses, porque
//   los meses tienen entre 28 y 31 días.
// · Sin arrastre en esta versión. Un Gantt de lectura rápido y correcto vale más que uno arrastrable
//   y con fechas que se corren solas: mover una barra escribe una fecha, y eso se hace con su
//   confirmación y su registro, en el paso siguiente.
// · Sin virtualizar: la obra más grande tiene 124 actividades. Virtualizar 124 filas es optimización
//   prematura y el precio se paga en bugs de scroll.
//
// ═══ EL COLOR SALE DE LOS TOKENS, Y NO ES COSMÉTICA ═══
//
// Las barras eran `sky-500`/`sky-700` y la línea de hoy `rose`: tres colores que no existen en el
// sistema del OS. El acento es UNO —el grafito de la marca— y el plan y lo ejecutado son el mismo
// color a distinta intensidad, que es lo que deja ver el avance de un vistazo. El rojo y el ámbar
// quedan reservados para lo que está mal (atrasado, frenado) y el amarillo de la marca se usa donde
// el logo lo usa: una regla fina que dice "acá estás" — la línea de hoy. Hoy no es un problema, y
// pintarlo de rojo era decir que sí.

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { agruparActividades, agruparPorObra, estadoDe, filasVisibles } from '../services/cronograma'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import type { ActividadHH } from '../services/personalService'
import { EstadoChip } from './EstadoChip'
import {
  DATOS_VACIOS, PanelActividad, type AccionesCronograma, type DatosDeActividad,
} from './PanelActividad'
import { construirEscala, type Escala } from '../services/escala'
import { BarraMasiva, Casilla, SellarLineaBase, type AccionesEnLote } from './AccionesMasivas'

const DIA = 86400000
// ═══ LA FILA RESPIRA (20/08/2026) ═══
// Estaba en 26px con texto de 12: la pantalla se leía como una planilla comprimida y el dueño la
// rechazó por eso. 36px es la densidad de una herramienta de trabajo —Linear, Asana— donde la
// información sigue siendo compacta pero cada renglón se distingue del de al lado sin esforzarse.
// ═══ LA ESCALA SIGUE AL ANCHO REAL, NO A UN NÚMERO FIJO (20/08/2026) ═══
//
// El dueño trabaja en un monitor de ~3.900 px CSS. Una fila de 40 px con texto de 14 ahí adentro se
// lee como una planilla de Excel comprimida —que es exactamente la palabra que usó— mientras que en
// 1.536 px la misma medida es correcta. Un tamaño absoluto no puede servir a los dos.
//
// Por eso la densidad se DERIVA del ancho medido de la caja: tres escalones, y el componente elige
// el suyo. No es zoom —los píxeles por día no cambian—: cambia cuánto ocupa una fila y cuánto mide
// su texto, que es lo que decide si la pantalla se lee o se descifra.
const ESCALONES = [
  { desde: 0, fila: 34, texto: 'text-[13px]', rotulo: 'text-[10px]', chip: 'text-[12px]', px: { mes: 11, dia: 9, barra: 10 } },
  { desde: 1200, fila: 40, texto: 'text-[14px]', rotulo: 'text-[11px]', chip: 'text-[13px]', px: { mes: 12, dia: 10, barra: 11 } },
  { desde: 1900, fila: 48, texto: 'text-[16px]', rotulo: 'text-[12px]', chip: 'text-[15px]', px: { mes: 14, dia: 12, barra: 12 } },
  { desde: 2600, fila: 58, texto: 'text-[19px]', rotulo: 'text-[14px]', chip: 'text-[18px]', px: { mes: 17, dia: 14, barra: 14 } },
  { desde: 3200, fila: 64, texto: 'text-[21px]', rotulo: 'text-[15px]', chip: 'text-[20px]', px: { mes: 19, dia: 15, barra: 15 } },
] as const

type Escalon = (typeof ESCALONES)[number]

function escalonDe(ancho: number): Escalon {
  let e: Escalon = ESCALONES[0]
  for (const x of ESCALONES) if (ancho >= x.desde) e = x
  return e
}

const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const fmtCorto = (iso: string | null) =>
  iso ? aDate(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—'

export function Gantt({
  actividades,
  restricciones = [],
  dependencias = [],
  hoy = new Date(),
  personas = [],
  acciones,
  yaSellada = false,
  seleccionInicial = null,
  masivas,
  obras,
  hhPorActividad,
  datosPorActividad,
  rubros = [],
  obraId,
}: {
  actividades: Actividad[]
  restricciones?: Restriccion[]
  /** Las precedencias declaradas. Vacío es lo normal hoy: se dibuja sin una sola flecha. */
  dependencias?: Dependencia[]
  hoy?: Date
  /** El plantel elegible como responsable. Sin él, el panel deja el selector vacío y lo dice. */
  personas?: Persona[]
  /** Sin `acciones` el Gantt es de sólo lectura y no dibuja un solo control que no funcione. */
  acciones?: AccionesCronograma
  yaSellada?: boolean
  /** Qué actividad viene abierta de la URL. Sólo el arranque: después la selección es local, porque
   *  escribir la URL en cada clic haría una vuelta al servidor por cada barra que se toca. */
  seleccionInicial?: string | null
  /** Las acciones en lote. Sin ellas NO se dibuja una sola casilla: seleccionar cincuenta filas para
   *  descubrir que no hay nada que hacer con ellas es peor que no poder seleccionarlas. */
  masivas?: AccionesEnLote
  /**
   * EL EJE DE AGRUPACIÓN. Ausente (la ficha de la obra) = se agrupa por la sección del tracker.
   * Presente (el Gantt global de `/obras/cronograma`) = se agrupa por obra, con estos nombres.
   *
   * Es UN componente para las dos pantallas a propósito: *"El Gantt global y el Gantt de una obra
   * deben consumir exactamente las mismas actividades canónicas"*. Un segundo Gantt para la vista
   * global habría empezado igual y divergido en el primer arreglo que se le hiciera a uno solo.
   */
  obras?: { id: string; nombre: string }[]
  /** HH plan contra real por actividad, indexada por id. Sale de `obra_actividad_hh`, la MISMA
   *  vista que lee la solapa Personal: el Cronograma no recalcula nada, muestra el mismo número.
   *  Opcional, como el resto de los props de este componente — el Gantt global no la trae. */
  hhPorActividad?: Map<string, ActividadHH>
  /** TODO lo que el panel muestra de cada actividad —partes, tareas, notas, papeles, personal real
   *  y equipos—, ya indexado. Va junto y no en seis mapas sueltos: el Gantt no los mira, sólo se los
   *  pasa al panel, y seis props es seis oportunidades de olvidarse uno. */
  datosPorActividad?: Map<string, DatosDeActividad>
  /** Los rubros de la obra, para poder mover la actividad de grupo desde el panel. */
  rubros?: string[]
  /** La obra, para que el panel pueda llevar al historial completo. El Gantt global no la pasa:
   *  ahí cada fila es de una obra distinta. */
  obraId?: string
}) {
  const [escala, setEscala] = useState<Escala>('semana')
  // ═══ EL LIENZO TIENE QUE LLENAR EL LUGAR QUE TIENE (20/08/2026) ═══
  //
  // El Gantt GLOBAL estiraba los píxeles por día hasta llenar el ancho disponible desde el 19/08; el
  // de la OBRA —que es la pantalla más usada del módulo— nunca recibió ese ancho. Resultado, medido
  // en producción sobre «Galpón 9»: una obra de seis semanas dibujaba las barras apretadas en el 40%
  // izquierdo y dejaba el 60% en blanco, con las actividades de un día convertidas en una rayita de
  // tres píxeles. Se lee como una pantalla rota, y por eso el objetivo no se parecía al resultado.
  //
  // Se OBSERVA en vez de calcularse una vez: el panel lateral aparece y desaparece, y el ancho libre
  // cambia sin que la ventana cambie de tamaño. Mientras no se midió vale 0 y manda la escala
  // elegida — nunca se dibuja más chico de lo que corresponde.
  // ═══ EL REPARTO DEL ANCHO ES UNA PROPORCIÓN, NO UN NÚMERO FIJO (20/08/2026) ═══
  //
  // La columna de actividades tenía un ancho por punto de quiebre (`lg:w-[520px]`), y los puntos de
  // quiebre miran la VENTANA, no el lugar que queda. Medido en 1536 con el panel de actividad
  // abierto: tabla 620 px, panel 520 y calendario 345 — el Gantt, que es la superficie principal,
  // era la más chica de las tres y no se veía una sola barra. Ahora la caja se mide y la tabla toma
  // el 40% de lo que haya, con un piso de 168 px (el teléfono) y un techo de 640 (un monitor de
  // 27"): el objetivo declarado —tabla 35-45%, calendario 55-65%— se cumple con el panel abierto y
  // con el panel cerrado, sin un punto de quiebre que adivine cuál de los dos es.
  const cajaRef = useRef<HTMLDivElement>(null)
  const [anchoCaja, setAnchoCaja] = useState(0)
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja || typeof ResizeObserver === 'undefined') return
    const medir = () => setAnchoCaja(caja.clientWidth)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(caja)
    return () => obs.disconnect()
  }, [])
  // La tabla toma el 38% de lo que haya: el objetivo pide 35-40% para la tabla y 60-65% para el
  // calendario, y el techo sube con la pantalla en vez de quedar clavado.
  const esc = escalonDe(anchoCaja || 1400)
  const ALTO_FILA = esc.fila
  // LAS DOS CABECERAS MIDEN LO MISMO o las filas de la tabla y las del calendario arrancan
  // desfasadas, y a partir de ahí cada renglón miente sobre qué barra le toca.
  const ALTO_CABECERA = esc.fila + 12
  const anchoFijo = anchoCaja
    ? Math.round(Math.min(Math.max(560, anchoCaja * 0.38), Math.max(168, anchoCaja * 0.38)))
    : 0
  const anchoLibre = anchoCaja ? anchoCaja - anchoFijo : 0
  // EL NOMBRE DE LA ACTIVIDAD MANDA SOBRE LAS COLUMNAS DE APOYO. Con el panel abierto la tabla mide
  // ~390 px y las cuatro columnas de la derecha se comían 300: quedaban 88 px para el nombre y la
  // pantalla decía «Muro G 1/…». El estado y el avance se quedan —son los que se leen de un vistazo—
  // y las fechas se van cuando no hay lugar: están en la barra, que es lo que se está mirando, y
  // enteras en el panel de la actividad.
  const mostrarFechas = anchoFijo === 0 || anchoFijo >= 500
  // NO HAY DESPLAZAMIENTO AUTOMÁTICO. Se probó centrar en hoy y es peor: en «San Francisco» las
  // primeras veinte filas son de junio y hoy cae en agosto, así que la pantalla abría en un
  // rectángulo vacío con las barras de las filas visibles fuera de cuadro. El plan se lee de
  // principio a fin; la línea de hoy dice dónde estamos y se llega arrastrando.
  const [selId, setSelId] = useState<string | null>(seleccionInicial)
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(new Set())
  // LA SELECCIÓN EN LOTE VIVE EN EL CLIENTE Y NO VIAJA EN LA URL. Tildar cincuenta casillas serían
  // cincuenta vueltas al servidor, y encima un enlace compartido resucitaría una selección que el
  // que lo abre no hizo — sobre acciones que escriben. Es estado de trabajo, no una vista.
  const [enLote, setEnLote] = useState<ReadonlySet<string>>(new Set())

  // LA SELECCIÓN SE GUARDA POR ID, NO POR OBJETO. Guardando el objeto, después de editar una
  // actividad el panel seguía mostrando los valores viejos: el servidor revalidaba y mandaba filas
  // nuevas, pero el estado local conservaba la copia vieja y parecía que el guardado no había hecho
  // nada. Por id, el panel siempre lee la fila que acaba de llegar.
  const sel = selId ? (actividades.find((a) => a.id === selId) ?? null) : null

  // Las actividades con restricción abierta se marcan en la barra: es lo que conecta el cronograma
  // con el make-ready sin abrir otra pantalla.
  const abiertas = useMemo(() => restricciones.filter((r) => r.estado !== 'liberada'), [restricciones])
  const conRestriccion = useMemo(() => {
    const s = new Set<string>()
    for (const r of abiertas) if (r.actividad_id) s.add(r.actividad_id)
    return s
  }, [abiertas])

  const nombreDeObra = useMemo(() => new Map((obras ?? []).map((o) => [o.id, o.nombre])), [obras])
  const grupos = useMemo(
    () => (obras ? agruparPorObra(actividades, nombreDeObra) : agruparActividades(actividades)),
    [actividades, obras, nombreDeObra],
  )
  const filas = useMemo(() => filasVisibles(grupos, colapsados), [grupos, colapsados])
  const hoyIso = isoDe(hoy)

  const rango = useMemo(() => {
    let min = Infinity; let max = -Infinity
    for (const a of actividades) {
      if (!a.inicio_plan) continue
      const i = aDate(a.inicio_plan).getTime()
      const f = aDate(a.fin_plan ?? a.inicio_plan).getTime()
      const b0 = a.inicio_base ? aDate(a.inicio_base).getTime() : i
      const b1 = a.fin_base ? aDate(a.fin_base).getTime() : f
      min = Math.min(min, i, b0); max = Math.max(max, f, b1)
    }
    if (min === Infinity) return null
    // Un margen de una semana a cada lado para que la primera barra no nazca pegada al borde.
    return { desde: new Date(min - 7 * DIA), hasta: new Date(max + 7 * DIA) }
  }, [actividades])

  const alternar = (clave: string) =>
    setColapsados((prev) => {
      const s = new Set(prev)
      if (s.has(clave)) s.delete(clave)
      else s.add(clave)
      return s
    })

  // ── LA SELECCIÓN EN LOTE ───────────────────────────────────────────────────
  //
  // Se elige sobre las HIJAS de los grupos y NUNCA sobre una fila de resumen: un resumen no es
  // trabajo —agrupa el de otros—, y darle un responsable o cargarle HH plan metería horas que
  // después se cuentan dos veces, una en la cabecera y otra en cada hija. `agruparActividades` ya
  // consume la fila de resumen como cabecera, así que la casilla del grupo alcanza a sus hijas.
  const seleccionables = useMemo(() => grupos.flatMap((g) => g.hijas.map((h) => h.id)), [grupos])
  // Los ids salen del ORDEN del cronograma y no del orden en que se fue tildando: así el resultado
  // de una acción se puede leer contra la pantalla.
  const idsEnLote = useMemo(() => seleccionables.filter((id) => enLote.has(id)), [seleccionables, enLote])

  const marcar = (ids: string[], puesto: boolean) =>
    setEnLote((prev) => {
      const s = new Set(prev)
      for (const id of ids) { if (puesto) s.add(id); else s.delete(id) }
      return s
    })
  const todasEnLote = seleccionables.length > 0 && idsEnLote.length === seleccionables.length

  // LA BARRA SE ARMA ANTES DEL CORTE POR "SIN FECHAS", y no es un detalle de orden: una obra sin
  // ninguna actividad con fecha es exactamente donde hace falta poder crear la primera. Hasta acá,
  // ese caso devolvía un cartel de aviso y ni un solo control.
  const barra = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-accent/25" />plan</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-accent" />ejecutado</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-line-strong" />línea base</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rotate-45 bg-accent" />hito</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-1 rounded-sm bg-warn" />con impedimento</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-0.5 bg-marca" />hoy</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {grupos.length > 1 && (
          <button
            type="button"
            onClick={() => setColapsados((p) => (p.size ? new Set() : new Set(grupos.map((g) => g.clave))))}
            data-testid="alternar-grupos"
            className="rounded-control border border-line px-2.5 py-1 text-[12px] text-muted hover:bg-surface-sunken hover:text-ink"
          >{colapsados.size ? 'Expandir todo' : 'Contraer todo'}</button>
        )}
        {acciones && <SellarLineaBase sellar={acciones.sellar} yaSellada={yaSellada} />}
        <div className="flex overflow-hidden rounded-control border border-line text-[12px]">
          {(['semana', 'mes'] as Escala[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEscala(e)}
              className={`px-3 py-1 capitalize ${escala === e ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-surface-sunken'}`}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  )

  // LA BARRA DE LOTE SE ARMA CON EL RESTO Y NO ADENTRO DEL RETORNO: se dibuja igual arriba de la
  // grilla, y así se ve dónde aparece sin leer el JSX entero.
  const barraLote = masivas
    ? <BarraMasiva ids={idsEnLote} personas={personas} acciones={masivas} alLimpiar={() => setEnLote(new Set())} />
    : null

  if (!rango) {
    return (
      <div data-testid="gantt" className="rounded-card border border-line bg-surface">
        {barra}
        <p className="px-4 py-8 text-center text-[13px] text-muted">
          {actividades.length
            ? 'Hay actividades cargadas, pero ninguna tiene fecha: sin fechas no hay cronograma que dibujar.'
            : 'Esta obra todavía no tiene ninguna actividad.'}
        </p>
      </div>
    )
  }

  const { px, ancho, x, meses, ticks, porDia } = construirEscala(rango.desde, rango.hasta, escala, anchoLibre)
  const medio = Math.round(ALTO_CABECERA / 2)
  const alto = filas.length * ALTO_FILA
  const xHoy = x(hoyIso)
  const hoyVisible = xHoy >= 0 && xHoy <= ancho

  // ═══ EL CALENDARIO TIENE QUE PARECER UN CALENDARIO ═══
  //
  // El cuerpo dibujaba UNA línea por mes: entre el 1° de julio y el 1° de agosto no había una sola
  // referencia vertical, así que una barra flotaba en un rectángulo blanco y no se podía decir de
  // un vistazo en qué semana caía. Ahora: los sábados y domingos sombreados —en obra no se trabaja,
  // y ver dónde están explica los saltos del plan—, una línea por semana y una por mes.
  //
  // Sólo cuando el día mide lo suficiente: en escala «mes» son 4px por día y sombrear los fines de
  // semana sería una trama gris, no información.
  const finesDeSemana: { x: number; w: number }[] = []
  if (px >= 7) {
    const d = new Date(rango.desde)
    let i = 0
    while (d.getTime() < rango.hasta.getTime()) {
      if (d.getUTCDay() === 6) finesDeSemana.push({ x: i * px, w: px * 2 })
      d.setUTCDate(d.getUTCDate() + 1); i++
    }
  }

  // La fila donde quedó cada actividad, para colgar de ahí las flechas de precedencia. Una actividad
  // dentro de un grupo contraído no está en el mapa: su flecha no se dibuja en vez de apuntar a la
  // fila que le tocó el lugar.
  const filaDe = new Map<string, number>()
  filas.forEach((f, i) => { if (f.tipo === 'actividad') filaDe.set(f.actividad.id, i) })

  return (
    <div data-testid="gantt" className="rounded-card border border-line bg-surface">
      {barra}
      {barraLote}

      {/* EL PANEL VA AL COSTADO, NO DEBAJO. Lo que se está decidiendo al editar una actividad es su
          fecha CONTRA la de las de al lado: si el cronograma se va de la pantalla para dejar lugar
          al formulario, se edita a ciegas. En el teléfono no hay ancho para las dos cosas y el panel
          sube desde abajo como una hoja, tapando el cronograma en vez de aplastarlo. */}
      <div className="flex flex-col lg:flex-row">
        <div ref={cajaRef} className="relative max-h-[78vh] min-h-[360px] min-w-0 flex-1 overflow-auto overscroll-x-contain">
          {/* EL ANCHO DE LA COLUMNA FIJA ES RESPONSIVO, Y NO ES UN DETALLE ESTÉTICO (17/08/2026).
              Estaba clavado en 340px por estilo en línea. En un teléfono de 390px el contenedor
              visible mide 348px: la columna de nombres se comía el 97,7% y NO SE VEÍA UNA SOLA BARRA
              —ni la línea de hoy, ni el cronograma— aunque el scroll horizontal funcionara. El Gantt
              es la vista más importante del módulo y el teléfono es el aparato del jefe de obra.
              Ahora: 148px en móvil, 340px de `sm` para arriba, y las columnas de fecha se ocultan en
              pantalla chica porque esa información ya está en la barra. */}
          <div className="flex w-max">
            {/* ── COLUMNA FIJA: la grilla de actividades ───────────────────────────────── */}
            <div
              data-columna-fija
              style={anchoFijo ? { width: anchoFijo } : undefined}
              className="sticky left-0 z-20 w-[168px] shrink-0 border-r border-line bg-surface sm:w-[400px] lg:w-[460px]"
            >
              <div className={`sticky top-0 z-10 flex items-end gap-2 border-b border-line bg-surface-quiet px-3 pb-2 font-medium uppercase tracking-wide text-faint ${esc.rotulo}`} style={{ height: ALTO_CABECERA }}>
                {masivas && (
                  <Casilla
                    puesta={todasEnLote}
                    alCambiar={(v) => marcar(seleccionables, v)}
                    etiqueta={`Seleccionar las ${seleccionables.length} actividades`}
                    testid="masiva-todas"
                  />
                )}
                <span className="flex-1">Actividad</span>
                <span className="hidden w-[96px] px-2 sm:inline">Estado</span>
                {mostrarFechas && <span className="hidden w-[68px] px-2 text-right sm:inline">Inicio</span>}
                {mostrarFechas && <span className="hidden w-[68px] px-2 text-right sm:inline">Fin</span>}
                <span className="hidden w-[64px] px-2 text-right sm:inline">%</span>
              </div>
              {filas.map((f) => {
                if (f.tipo === 'grupo') {
                  const g = f.grupo
                  const cerrado = colapsados.has(g.clave)
                  const suyas = g.hijas.map((h) => h.id)
                  return (
                    <div
                      key={f.clave}
                      style={{ height: ALTO_FILA }}
                      className="flex w-full items-center gap-1.5 border-b border-line bg-surface-quiet px-3 hover:bg-surface-sunken"
                    >
                      {masivas && suyas.length > 0 && (
                        <Casilla
                          puesta={suyas.every((id) => enLote.has(id))}
                          alCambiar={(v) => marcar(suyas, v)}
                          etiqueta={`Seleccionar ${g.nombre}`}
                          testid="masiva-grupo"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => alternar(g.clave)}
                        aria-expanded={!cerrado}
                        data-testid="grupo-cronograma"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        {/* EL RUBRO ES UN NIVEL, NO UNA FILA MÁS. Versalitas, negrita y su propia
                            banda: la jerarquía Rubro → Actividad tiene que verse sin leer. */}
                        <span aria-hidden className={`shrink-0 text-[9px] text-muted transition-transform ${cerrado ? '' : 'rotate-90'}`}>▶</span>
                        <span className={`min-w-0 flex-1 truncate font-semibold uppercase tracking-wide text-ink ${esc.texto}`} title={g.nombre}>{g.nombre}</span>
                        <span className={`shrink-0 tabular-nums text-muted ${esc.chip}`}>
                          {g.pct == null ? `${g.hijas.length}` : `${g.pct}%`}
                        </span>
                      </button>
                    </div>
                  )
                }
                const a = f.actividad
                return (
                  <div
                    key={f.clave}
                    style={{ height: ALTO_FILA }}
                    className={`flex w-full cursor-pointer items-center border-b border-line/60 pl-3 hover:bg-surface-sunken ${esc.texto} ${sel?.id === a.id ? 'bg-marca-soft' : ''}`}
                  >
                    {masivas && (
                      <Casilla
                        puesta={enLote.has(a.id)}
                        alCambiar={(v) => marcar([a.id], v)}
                        etiqueta={`Seleccionar ${a.nombre}`}
                        testid="masiva-actividad"
                      />
                    )}
                  <button
                    type="button"
                    onClick={() => setSelId(a.id)}
                    data-testid="actividad-cronograma"
                    // DE QUÉ OBRA ES CADA FILA, siempre — también en la ficha, donde es redundante
                    // para el que mira. No es adorno: es lo que deja CONTAR desde afuera que la
                    // lista global y la de la obra traen exactamente las mismas actividades. Sin
                    // esto, "no hay dos sistemas" es una afirmación sin forma de verificarla.
                    data-obra={a.obra_id}
                    data-tipo={a.tipo}
                    // El alto, el borde y el padding los pone la ENVOLTURA de la fila, que además
                    // sostiene la casilla de selección en lote. Repetirlos acá los duplicaba.
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {/* INDENTADA BAJO SU RUBRO, y en el color del texto —no en gris—: es el dato
                        principal de la fila. El `title` da el nombre entero cuando no entra. */}
                    <span
                      className="min-w-0 flex-1 truncate py-2 pl-4 pr-2 text-ink"
                      title={[a.seccion, a.codigo, a.nombre].filter(Boolean).join(' · ')}
                    >{a.nombre}</span>
                    {/* EL ESTADO OPERATIVO, no el guardado: una actividad con un impedimento
                        abierto dice «Bloqueada» aunque su estado cargado siga siendo «En curso». Es
                        la misma derivación que usa el tablero — un solo lugar donde se decide. */}
                    <span className="hidden h-full w-[96px] shrink-0 items-center border-l border-line/50 px-2 sm:flex">
                      <EstadoChip estado={a.estado_operativo} />
                    </span>
                    {mostrarFechas && <span className={`hidden h-full w-[68px] shrink-0 items-center justify-end border-l border-line/50 px-2 tabular-nums text-muted sm:flex ${esc.chip}`}>{fmtCorto(a.inicio_plan)}</span>}
                    {mostrarFechas && <span className={`hidden h-full w-[68px] shrink-0 items-center justify-end border-l border-line/50 px-2 tabular-nums text-muted sm:flex ${esc.chip}`}>{fmtCorto(a.fin_plan)}</span>}
                    {/* EL AVANCE CALCULADO, no el declarado: es el mismo número que muestra el panel
                        y el que promedia la obra. «—» cuando no hay ninguno — un 0% inventado diría
                        que la actividad no arrancó cuando lo que pasa es que nadie la midió. */}
                    <span className={`hidden h-full w-[64px] shrink-0 items-center justify-end border-l border-line/50 px-2 font-medium tabular-nums text-ink sm:flex ${esc.chip}`}>
                      {a.avance_pct == null ? <span className="font-normal text-faint">—</span> : `${Math.round(Number(a.avance_pct))}%`}
                    </span>
                  </button>
                  </div>
                )
              })}
            </div>

            {/* ── LÍNEA DE TIEMPO ──────────────────────────────────────────────────────── */}
            <div className="relative shrink-0" style={{ width: ancho }}>
              <div className="sticky top-0 z-10 border-b border-line bg-surface-quiet" style={{ height: ALTO_CABECERA }}>
                <svg width={ancho} height={ALTO_CABECERA} className="block">
                  {finesDeSemana.map((f) => (
                    <rect key={'hfs' + f.x} x={f.x} y={medio} width={f.w} height={ALTO_CABECERA - medio} className="fill-surface-sunken" />
                  ))}
                  {meses.map((m) => (
                    <g key={m.label + m.x0}>
                      <line x1={m.x0} y1={0} x2={m.x0} y2={ALTO_CABECERA} className="stroke-line-strong" />
                      <text x={m.x0 + 8} y={medio - 7} fontSize={esc.px.mes} className="fill-ink capitalize" fontWeight={600}>{m.label}</text>
                    </g>
                  ))}
                  <line x1={0} y1={medio} x2={ancho} y2={medio} className="stroke-line" />
                  {/* LA COLUMNA DEL DÍA, con su número. Es lo que deja decir «esto arranca el martes»
                      sin contar cuadraditos contra la regla de arriba. */}
                  {ticks.map((t) => (
                    <g key={t.x}>
                      <line x1={t.x} y1={medio} x2={t.x} y2={ALTO_CABECERA} className="stroke-line" />
                      <text
                        x={porDia ? t.x + px / 2 : t.x + 4}
                        y={ALTO_CABECERA - 7}
                        fontSize={esc.px.dia}
                        textAnchor={porDia ? 'middle' : 'start'}
                        className={t.finde ? 'fill-faint tabular-nums' : 'fill-muted tabular-nums'}
                      >{t.label}</text>
                    </g>
                  ))}
                  {/* HOY: la pastilla amarilla del objetivo sobre el número del día. */}
                  {hoyVisible && (
                    <>
                      <rect
                        x={porDia ? xHoy + 1 : xHoy - 14}
                        y={medio + 3}
                        width={porDia ? Math.max(18, px - 2) : 28}
                        height={ALTO_CABECERA - medio - 6}
                        rx={4}
                        className="fill-marca"
                      />
                      <text
                        x={porDia ? xHoy + px / 2 : xHoy}
                        y={ALTO_CABECERA - 7}
                        fontSize={esc.px.dia}
                        textAnchor="middle"
                        className="fill-ink tabular-nums"
                        fontWeight={700}
                      >{porDia ? hoyIso.slice(8, 10) : 'hoy'}</text>
                    </>
                  )}
                </svg>
              </div>

              <svg width={ancho} height={alto} className="block">
                <defs>
                  <marker id="flecha-dep" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" className="fill-muted" />
                  </marker>
                </defs>

                {finesDeSemana.map((f) => (
                  <rect key={'fs' + f.x} x={f.x} y={0} width={f.w} height={alto} className="fill-surface-quiet" />
                ))}

                {/* LA FILA DE LA TABLA Y LA DEL CALENDARIO SON UNA SOLA FILA. Sin estas separaciones
                    el ojo pierde el renglón a los tres nombres y se lee la barra equivocada. */}
                {filas.map((_, i) => (
                  <line key={'h' + i} x1={0} y1={(i + 1) * ALTO_FILA} x2={ancho} y2={(i + 1) * ALTO_FILA} className="stroke-line/50" />
                ))}

                {ticks.map((t) => (
                  <line key={'t' + t.x} x1={t.x} y1={0} x2={t.x} y2={alto} className={porDia ? 'stroke-line/40' : 'stroke-line/70'} />
                ))}

                {meses.map((m) => (
                  <line key={'g' + m.x0} x1={m.x0} y1={0} x2={m.x0} y2={alto} className="stroke-line-strong" />
                ))}

                {/* LA LÍNEA DE HOY va en el amarillo de la marca: es el "acá estás" del logo, no un
                    estado. Estaba en rojo, que en este sistema significa problema. La banda detrás
                    la hace encontrable sin buscarla — es la referencia que más se usa. */}
                {hoyVisible && (
                  <>
                    <rect x={xHoy - Math.max(3, px / 2)} y={0} width={Math.max(6, px)} height={alto} className="fill-marca" opacity={0.16} />
                    <line x1={xHoy} y1={0} x2={xHoy} y2={alto} className="stroke-marca" strokeWidth={2} data-testid="linea-hoy" />
                  </>
                )}

                {filas.map((f, i) => {
                  const y = i * ALTO_FILA
                  // ── LA BARRA DEL GRUPO: se DERIVA de sus hijas, porque la fila de resumen del
                  //    tracker no trae fechas. Se dibuja también contraído: es la única manera de
                  //    ver la obra entera de un vistazo sin abrir los doce grupos.
                  if (f.tipo === 'grupo') {
                    const g = f.grupo
                    if (!g.inicio) return null
                    const x0 = x(g.inicio)
                    const w = Math.max(8, x(g.fin ?? g.inicio) - x0)
                    return (
                      <g key={f.clave}>
                        <rect x={x0} y={y + ALTO_FILA / 2 - 3} width={w} height={6} rx={1} className="fill-ink" opacity={0.85} />
                        <rect x={x0} y={y + ALTO_FILA / 2 - 3} width={3} height={11} className="fill-ink" opacity={0.85} />
                        <rect x={x0 + w - 3} y={y + ALTO_FILA / 2 - 3} width={3} height={11} className="fill-ink" opacity={0.85} />
                      </g>
                    )
                  }

                  const a = f.actividad
                  if (!a.inicio_plan) return null
                  const x0 = x(a.inicio_plan)
                  const x1 = x(a.fin_plan ?? a.inicio_plan)
                  // 8 px Y NO 3: una actividad de un solo día —la mitad de las de una obra— se
                  // dibujaba como una rayita que no se distingue de una línea de la grilla.
                  const w = Math.max(8, x1 - x0)
                  const frenada = conRestriccion.has(a.id)
                  const hb = Math.max(12, Math.round(ALTO_FILA * 0.42))
                  const centro = Math.round(ALTO_FILA / 2)
                  const atrasada = estadoDe(a, hoyIso) === 'atrasada'
                  // ═══ LA BARRA DICE EN QUÉ ESTADO ESTÁ, NO SÓLO CUÁNDO ═══
                  //
                  // Eran todas del mismo grafito: treinta barras iguales donde hay hechas, en curso
                  // y pendientes, y para saber cuál era cuál había que leer la columna «Estado» de
                  // la izquierda renglón por renglón. El color es el MISMO del chip de estado —una
                  // sola definición de qué significa cada uno—: verde hecha, rojo bloqueada o
                  // atrasada, el acento en curso, y gris lo que todavía no arrancó.
                  const tono = atrasada || a.estado_operativo === 'bloqueada'
                    ? 'fill-neg'
                    : a.estado_operativo === 'hecha'
                      ? 'fill-pos'
                      : a.estado_operativo === 'en_curso'
                        ? 'fill-accent'
                        : 'fill-line-strong'
                  return (
                    <g key={f.clave} onClick={() => setSelId(a.id)} className="cursor-pointer">
                      {/* LÍNEA BASE — sólo si está sellada. Sin baseline no se dibuja una sombra en
                          el mismo lugar que el plan: eso haría parecer que el desvío es cero. */}
                      {a.inicio_base && a.fin_base && (
                        <rect x={x(a.inicio_base)} y={y + ALTO_FILA - 9} width={Math.max(8, x(a.fin_base) - x(a.inicio_base))} height={3} rx={1} className="fill-line-strong" />
                      )}
                      {a.tipo === 'hito' ? (
                        <rect x={x0 - hb / 2} y={y + centro - hb / 2} width={hb} height={hb} className={tono} transform={`rotate(45 ${x0} ${y + centro})`} />
                      ) : (
                        <>
                          {/* LA BARRA ES GRUESA Y REDONDEADA como en el objetivo: el plan en tono
                              suave y lo ejecutado en pleno, uno encima del otro. Dos barras finas
                              apiladas obligaban a comparar dos alturas en vez de leer un relleno. */}
                          <rect x={x0} y={y + centro - hb / 2} width={w} height={hb} rx={hb / 3} className={tono} opacity={0.18} />
                          {a.pct != null && a.pct > 0 && (
                            <rect x={x0} y={y + centro - hb / 2} width={Math.max(3, (w * Math.min(100, a.pct)) / 100)} height={hb} rx={hb / 3} className={tono} />
                          )}
                          {frenada && <rect x={x0 - 5} y={y + centro - hb / 2 - 2} width={3} height={hb + 4} rx={1} className="fill-warn" />}
                          {/* EL AVANCE AL LADO DE LA BARRA. La mitad de las actividades de una obra
                              duran un día: sin este número la barra es un cuadradito de 8 px y la
                              fila no dice nada de un vistazo. Es el MISMO valor de la columna «%»
                              —no un segundo cálculo—: lo que cambia es que acá se lee sobre el
                              calendario, que es donde se compara contra las de al lado. */}
                          {a.avance_pct != null && (
                            <text x={x0 + w + 7} y={y + centro + esc.px.barra / 2 - 1} fontSize={esc.px.barra} className="fill-muted tabular-nums">
                              {Math.round(Number(a.avance_pct))}%
                            </text>
                          )}
                        </>
                      )}
                    </g>
                  )
                })}

                {/* ── LAS PRECEDENCIAS. Hoy no hay ninguna declarada en ninguna obra y por eso no se
                    ve una sola flecha: es el estado real del dato, no una función que falta. */}
                {dependencias.map((d) => {
                  const io = filaDe.get(d.origen_id); const id = filaDe.get(d.destino_id)
                  if (io == null || id == null) return null
                  const o = filas[io]; const t = filas[id]
                  if (o.tipo !== 'actividad' || t.tipo !== 'actividad') return null
                  const finO = o.actividad.fin_plan ?? o.actividad.inicio_plan
                  const iniT = t.actividad.inicio_plan
                  if (!finO || !iniT) return null
                  const ox = x(finO); const oy = io * ALTO_FILA + ALTO_FILA / 2
                  const dx = x(iniT); const dy = id * ALTO_FILA + ALTO_FILA / 2
                  const codo = ox + 8
                  return (
                    <path
                      key={d.id}
                      d={`M ${ox} ${oy} H ${codo} V ${dy} H ${dx}`}
                      fill="none"
                      className="stroke-muted"
                      strokeWidth={1}
                      markerEnd="url(#flecha-dep)"
                    />
                  )
                })}
              </svg>
            </div>
          </div>
        </div>

        {sel && (
          acciones
            ? (
                // TODOS los impedimentos de esta actividad, no sólo los abiertos: el panel cuenta
                // los ya resueltos, y eso es la diferencia entre «no hay problemas» y «hubo tres».
                <PanelActividad
                  actividad={sel}
                  personas={personas}
                  hh={hhPorActividad?.get(sel.id)}
                  datos={datosPorActividad?.get(sel.id) ?? DATOS_VACIOS}
                  rubros={rubros}
                  {...(obraId ? { obraId } : {})}
                  acciones={acciones}
                  actividades={actividades}
                  dependencias={dependencias}
                  impedimentos={restricciones.filter((r) => r.actividad_id === sel.id)}
                  hoy={hoy}
                  alCerrar={() => setSelId(null)}
                />
              )
            : (
                // Sin acciones el panel muestra lo que hay, y NADA que parezca editable: un campo que
                // no persiste es peor que no tenerlo.
                <aside data-testid="panel-actividad" className="w-full shrink-0 border-t border-line bg-surface-quiet px-4 py-3 lg:w-[340px] lg:border-l lg:border-t-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-faint">{[sel.seccion, sel.codigo, sel.tipo].filter(Boolean).join(' · ')}</p>
                      <p className="truncate text-[14px] font-semibold text-ink">{sel.nombre}</p>
                    </div>
                    <button type="button" onClick={() => setSelId(null)} className="shrink-0 text-[12px] text-muted hover:text-ink">cerrar</button>
                  </div>
                  {/* LA VISTA GLOBAL NO EDITA: lleva a la obra, que es donde la actividad se toca.
                      Reimplementar acá el panel de edición sería el segundo lugar donde se escribe
                      una fecha, con su propia validación y su propio permiso. */}
                  {obras && (
                    <Link
                      href={`/obras/${sel.obra_id}?vista=cronograma&act=${sel.id}`}
                      data-testid="ir-a-la-obra"
                      className="mt-2 inline-block text-[12px] text-ink underline underline-offset-2"
                    >Abrir en {nombreDeObra.get(sel.obra_id) ?? sel.obra_id} →</Link>
                  )}
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                    <div><dt className="text-faint">Plan</dt><dd className="tabular-nums text-ink">{fmtCorto(sel.inicio_plan)} → {fmtCorto(sel.fin_plan)}</dd></div>
                    <div><dt className="text-faint">Línea base</dt><dd className="tabular-nums text-ink">{sel.inicio_base ? `${fmtCorto(sel.inicio_base)} → ${fmtCorto(sel.fin_base)}` : 'sin sellar'}</dd></div>
                    <div><dt className="text-faint">Avance</dt><dd className="tabular-nums text-ink">{sel.pct == null ? '—' : `${sel.pct}%`}</dd></div>
                    <div><dt className="text-faint">Días plan / real</dt><dd className="tabular-nums text-ink">{sel.dias_plan ?? '—'} / {sel.dias_real ?? '—'}</dd></div>
                  </dl>
                </aside>
              )
        )}
      </div>
    </div>
  )
}
