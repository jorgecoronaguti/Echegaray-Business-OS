'use client'

// EL GANTT DE CARTERA — UN RENGLÓN POR OBRA. La cartera entera en una pantalla.
//
// El dueño, textual: *"NO quiero las 344 actividades de todas las obras desplegadas. Quiero UN
// RENGLÓN POR OBRA"* · *"Cada barra representa: inicio global de la obra → fin global de la obra"* ·
// *"Click en una obra → abre el Gantt detallado DE ESA OBRA."*
//
// ═══ POR QUÉ ES UN COMPONENTE PROPIO Y NO `<Gantt>` CON OTRO EJE ═══
//
// `<Gantt>` está construido sobre `Actividad[]` y su unidad es la actividad: panel lateral que edita
// una, selección en lote, precedencias entre dos, agrupación con cabeceras plegables. Para que
// dibujara obras habría que fabricarle objetos `Actividad` sintéticos con las fechas agregadas —
// filas con un `id` que no existe en `obra_actividad`, que su panel abriría y su selección en lote
// intentaría editar. Inventar la forma de un dato para reusar un componente es peor que escribir el
// componente: el que viene después no puede distinguir la fila real de la fabricada.
//
// LO QUE SÍ SE COMPARTE ES LA ESCALA, que es donde está la aritmética que se equivoca en silencio:
// `services/escala.ts` — la misma función `construirEscala` que posiciona las barras del Gantt de la
// obra posiciona éstas. Si mañana se corrige el ancho de un mes, se corrige para las dos pantallas.
//
// ═══ LAS TRES COLUMNAS DE LA IZQUIERDA SON OBRA+CLIENTE · ETAPA · PLAZO ═══
//
// Es el handoff aprobado (`design/screens/obras.md` §1h). Antes eran Obra · Cliente · Etapa ·
// Avance, en cuatro columnas de una línea. Dos cambios y los dos tienen razón:
//
//   · OBRA Y CLIENTE SE APILAN en una celda. El cliente no es una columna que se compare: es de
//     quién es la barra. Apilado en 11px `faint` bajo el nombre ocupa cero ancho extra y libera
//     lugar para el PLAZO, que sí es la pregunta de esta pantalla.
//   · EL AVANCE SE VA A LA DERECHA, pegado al final de su barra. Ahí es donde el ojo ya está
//     mirando cuando quiere saber cuánto lleva; en la columna fija obligaba a cruzar la pantalla
//     entera de ida y de vuelta.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// Ni una columna de dinero, ni siquiera enmascarada: la lectura no las pide (ver `COLUMNAS_PLAZO`).
// Un Gantt es una pregunta sobre el tiempo.
//
// ═══ EL COLOR DICE EL ESTADO, NO EL CALENDARIO (20/08) ═══
//
// El dueño: *"No pintar rojo sólo porque la fecha fin pasó"* · *"que el rojo vuelva a significar
// «requiere atención»"*. Antes la barra se ponía roja con `fin < hoy && avance < 100`, y con eso
// Comedor (93%) y Galpón 9 (96%) —dos obras que están cerrando bien— salían del mismo color que
// Salón Comercial, que va 0%. Cuatro de cinco rojas: el rojo dejó de señalar nada.
//
// Ahora el color sale de `desvioDePlazo`, que compara el avance contra el calendario ya consumido.
// La REGLA vive en el servicio, no acá: este archivo sólo la pinta. El amarillo de la marca se usa
// donde lo usa el logo: la línea de HOY. Hoy no es un problema y pintarlo de rojo era decir que sí.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useEffect, useRef } from 'react'
import { construirEscala, type Escala } from '../services/escala'
import { UMBRAL_ATRASO, ventana, type Barra, type FilaObra, type Semaforo } from '../services/ganttObras'
import { ETAPA_LABEL } from '../types'

/** 48px por renglón: la celda de la izquierda apila nombre de obra y cliente, y las dos líneas
 *  tienen que respirar. El lienzo usa EXACTAMENTE el mismo número — si se separan, la barra deja de
 *  estar en la fila de su obra y el Gantt miente sin dar ningún error. */
const ALTO_FILA = 48
/** El encabezado de las dos mitades. Los meses del lienzo y los rótulos de la columna fija comparten
 *  altura por la misma razón que las filas. */
const ALTO_HEAD = 40

/** EL ESTADO EN UN LUGAR: el color de la barra, el del punto y la palabra del detalle salen de acá.
 *  Tres tablas separadas se desincronizan el día que alguien agrega un estado. */
const ESTADO: Record<Semaforo, { fill: string; punto: string; texto: string; palabra: string }> = {
  al_dia:         { fill: 'fill-accent', punto: 'bg-accent',      texto: 'text-muted', palabra: 'al día' },
  atraso_menor:   { fill: 'fill-warn',   punto: 'bg-warn',        texto: 'text-warn',  palabra: 'atraso menor' },
  atraso_critico: { fill: 'fill-neg',    punto: 'bg-neg',         texto: 'text-neg',   palabra: 'atraso crítico' },
  sin_datos:      { fill: 'fill-faint',  punto: 'bg-line-strong', texto: 'text-faint', palabra: 'sin datos para juzgar' },
}

/** TERMINADA ES VERDE, y es el único verde de la pantalla. `COMPONENTS.md` §Gantt row: *"relleno
 *  grafito (verde si 100%…)"*, y `COLOR.md`: verde sólo estado positivo REAL. Una obra al 100% lo
 *  es; una al 60% "yendo bien" no, y por eso el resto es grafito. */
const completa = (b: Barra) => b.avancePct != null && b.avancePct >= 100
const fillDe = (b: Barra) => (completa(b) ? 'fill-pos' : ESTADO[b.desvio.semaforo].fill)

const hrefDe = (obraId: string) => `/obras/${obraId}?vista=cronograma`

/**
 * `dd/mm` A PARTIR DEL TEXTO ISO, SIN `Intl` Y SIN `new Date`.
 *
 * `toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })` devuelve **`22/6`**, no
 * `22/06`: el patrón de es-AR es `d/M/yy` y el ICU del navegador ignora el `2-digit` del mes. Con
 * fechas apiladas en una columna, un ancho que cambia de fila en fila se lee peor y no se puede
 * comparar de un vistazo. Y `new Date(iso)` sobre una fecha sin hora abre la puerta al corrimiento
 * de un día por huso horario, que en un cronograma no es un detalle cosmético.
 */
const fmtCorto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** El resumen de una obra en texto, para el `title` del renglón y para los lectores de pantalla. */
const etapaDe = (f: FilaObra) => (f.etapa ? ETAPA_LABEL[f.etapa] : 'etapa sin declarar')

function resumen(f: FilaObra): string {
  const quien = `${f.nombre}${f.clienteNombre ? ` · ${f.clienteNombre}` : ''} · ${etapaDe(f)}`
  if (!f.barra) return `${quien}: ${f.motivo}`
  const b = f.barra
  const base = b.base ? ` · línea base ${fmtCorto(b.base.inicio)} → ${fmtCorto(b.base.fin)}` : ' · sin línea base sellada'
  const av = b.avancePct == null ? ' · sin avance publicado' : ` · avance ${b.avancePct}%`
  const d = b.desvio
  // «estimado» NO ES UNA MULETILLA: el avance esperado supone que el trabajo se reparte parejo
  // sobre el calendario, y ninguna obra avanza así. Decir «26 días de atraso» a secas convertiría
  // una estimación en un hecho, que es exactamente lo que no se hace acá.
  const estado = d.brechaPuntos == null
    ? ` · ${ESTADO[d.semaforo].palabra}`
    : ` · ${ESTADO[d.semaforo].palabra}: ${b.avancePct}% contra ${d.avanceEsperadoPct}% esperado por calendario (ESTIMACIÓN)`
      + (d.brechaPuntos > 0
          ? ` — ${d.brechaPuntos} puntos, unos ${d.atrasoDias} día${d.atrasoDias === 1 ? '' : 's'} de trabajo`
          : '')
  return `${quien}: plan ${fmtCorto(b.inicio)} → ${fmtCorto(b.fin)}${base}${av}${estado}`
}

/**
 * LA LEYENDA NOMBRA LOS ESTADOS, Y ADEMÁS DICE CON QUÉ REGLA SE PINTAN.
 *
 * Un semáforo cuyo criterio no está escrito en ningún lado no se puede discutir: cada uno le
 * inventa un significado al rojo y el color deja de ser un acuerdo. La regla entra en una línea y
 * hace que el color rinda cuentas — incluyendo que el avance esperado contra el que se mide es una
 * ESTIMACIÓN, no un dato de la obra.
 */
function Leyenda({ hayBase, estados }: { hayBase: boolean; estados: Set<Semaforo> }) {
  const orden: Semaforo[] = ['al_dia', 'atraso_menor', 'atraso_critico', 'sin_datos']
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted">
      {/* SÓLO LOS ESTADOS QUE LA PANTALLA ESTÁ DIBUJANDO. Nombrar «atraso crítico» un día en que
          ninguna obra lo está manda a buscar una barra roja que no existe. */}
      {orden.filter((e) => estados.has(e)).map((e) => (
        <span key={e} className="inline-flex items-center gap-1.5">
          <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO[e].punto}`} />{ESTADO[e].palabra}
        </span>
      ))}
      {/* LA LÍNEA BASE SÓLO SE NOMBRA SI ALGUNA OBRA LA TIENE. Una leyenda que explica una marca que
          no aparece en ninguna fila manda a buscarla. */}
      {hayBase && <span className="inline-flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-sm bg-line-strong" />línea base</span>}
      <span className="inline-flex items-center gap-1.5"><i className="h-3 w-0.5 bg-marca" />hoy</span>
    </div>
  )
}

/**
 * EL RENGLÓN DE LA COLUMNA FIJA: obra + cliente · etapa · plazo.
 *
 * TODO EL RENGLÓN ES UN ENLACE A LA OBRA, y por eso el cliente NO es un segundo enlace acá adentro:
 * un `<a>` dentro de otro `<a>` es marcado inválido y el navegador lo desarma solo. La puerta a la
 * ficha CRM del cliente está en la cartera, que es la vista que existe para eso; acá el cliente es
 * el dato que dice de quién es la barra. En pantallas angostas se ocultan etapa y plazo —la obra y
 * su barra son lo que no puede faltar— y siguen estando en el `title`.
 */
function Renglon({ f }: { f: FilaObra }) {
  const sem = f.barra ? f.barra.desvio.semaforo : 'sin_datos'
  return (
    <Link
      href={hrefDe(f.obraId)}
      data-testid="obra-gantt"
      data-obra={f.obraId}
      data-etapa={f.etapa ?? ''}
      title={resumen(f)}
      style={{ height: ALTO_FILA }}
      className="flex w-full items-center gap-2 border-b border-[#EFEEEA] pr-3 transition-colors hover:bg-surface-quiet"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{f.nombre}</span>
        {/* SIN CLIENTE SE ESCRIBE, no se deja un guión: un «—» acá y un «—» en la columna de al lado
            no significan lo mismo y se leen igual. */}
        <span className="block truncate text-[11px] text-faint" data-testid="cliente-gantt">
          {f.clienteNombre ?? 'sin cliente declarado'}
        </span>
      </span>
      {/* «etapa sin declarar» EN GRIS Y CON ESAS PALABRAS: es el mismo texto que usa la cartera.
          Poner un default como «Desarrollo» presentaría un dato fabricado como estado del ciclo de
          vida de una obra real. */}
      <span
        className={`hidden w-[104px] shrink-0 truncate text-[12px] sm:inline ${f.etapa ? 'text-muted' : 'text-faint'}`}
        data-testid="etapa-gantt"
      >{etapaDe(f)}</span>
      {/* EL PLAZO, CON EL PUNTO DEL SEMÁFORO AL LADO. El punto ordena la atención; el número dice
          cuánto. Con «fin 27/08 / −39 pts» se ve de un vistazo que la obra debería ir por 86, sin
          pasar el mouse por encima ni abrir la ficha. */}
      <span className="hidden w-[150px] shrink-0 items-center gap-2 sm:flex" data-testid="plazo-gantt">
        <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO[sem].punto}`} aria-hidden />
        {f.barra ? (
          <span className="min-w-0 leading-tight">
            <span className="block font-mono text-[12px] tabular-nums text-muted">fin {fmtCorto(f.barra.fin)}</span>
            <span className={`block truncate text-[11px] ${ESTADO[sem].texto}`}>
              {f.barra.desvio.brechaPuntos != null && f.barra.desvio.brechaPuntos > 0
                ? `−${f.barra.desvio.brechaPuntos} pts estimados`
                : ESTADO[sem].palabra}
            </span>
          </span>
        ) : (
          // EL MOTIVO CONCRETO SE ESCRIBE UNA SOLA VEZ, Y ES SOBRE EL LIENZO —donde el ojo va a
          // buscar la barra que no está—. Acá iba el mismo texto, así que «sin cronograma cargado»
          // aparecía dos veces en la misma fila: la repetición no agrega nada y ensancha la columna
          // fija a costa del calendario.
          <span className="text-[11.5px] text-faint">sin plazo</span>
        )}
      </span>
    </Link>
  )
}

/** La barra de una obra: plan, línea base cuando exista, avance proporcional cuando exista, y el
 *  porcentaje escrito al final — que es donde el ojo ya está cuando quiere saber cuánto lleva. */
function BarraObra({ b, y, x, ancho }: { b: Barra; y: number; x: (iso: string) => number; ancho: number }) {
  const x0 = x(b.inicio)
  const w = Math.max(3, x(b.fin) - x0)
  const color = fillDe(b)
  // La etiqueta se corre a la izquierda de la barra cuando no entra a la derecha: escrita fuera del
  // lienzo no se ve, y una barra sin su número obliga a cruzar la pantalla para leerlo.
  const cabeADerecha = x0 + w + 42 < ancho
  return (
    <>
      <rect x={x0} y={y + 14} width={w} height={14} rx={3} className={color} opacity={0.22}
            data-testid="barra-obra" data-semaforo={b.desvio.semaforo} />
      {b.avancePct != null && b.avancePct > 0 && (
        <rect x={x0} y={y + 14} width={Math.max(2, (w * Math.min(100, b.avancePct)) / 100)} height={14} rx={3} className={color} />
      )}
      {/* LA LÍNEA BASE VA DEBAJO Y FINA: es la referencia contra la que se compara el plan, no otro
          plan. Sólo aparece con sus dos puntas selladas. */}
      {b.base && (
        <rect x={x(b.base.inicio)} y={y + 30} width={Math.max(3, x(b.base.fin) - x(b.base.inicio))} height={3} rx={1}
              className="fill-line-strong" data-testid="linea-base-obra" />
      )}
      {/* SIN AVANCE PUBLICADO NO SE ESCRIBE UN 0%: se dice que no está cargado. */}
      <text
        x={cabeADerecha ? x0 + w + 8 : Math.max(2, x0 - 8)}
        y={y + 25}
        textAnchor={cabeADerecha ? 'start' : 'end'}
        fontSize={11}
        className={b.avancePct == null ? 'fill-faint' : 'fill-muted'}
        data-testid="avance-gantt"
      >
        {b.avancePct == null ? 'sin avance' : `${b.avancePct}%`}
      </text>
    </>
  )
}

/**
 * @param hoyIso EL DÍA LO FIJA EL SERVIDOR y viaja como texto. Si este componente leyera el reloj
 * del navegador, la línea de hoy y el orden de los renglones —que el servidor ya calculó— podrían
 * discrepar alrededor de la medianoche, y React además marcaría el desajuste de hidratación.
 */
export function GanttObras({ filas, hoyIso }: { filas: FilaObra[]; hoyIso: string }) {
  const router = useRouter()
  const [escala, setEscala] = useState<Escala>('semana')
  // SE MIDE EL LUGAR REAL, no se supone. El lienzo tiene que llenar lo que le queda al lado de la
  // columna fija; cuánto es eso depende de la ventana del navegador y cambia al rotar el teléfono o
  // arrastrar el borde, así que se observa en vez de calcularse una vez. Mientras no se midió vale 0
  // y manda la escala elegida: nunca se dibuja más chico de lo que corresponde.
  const cajaRef = useRef<HTMLDivElement>(null)
  const [anchoLibre, setAnchoLibre] = useState(0)
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const fija = caja.querySelector('[data-columna-fija]')
      setAnchoLibre(Math.max(0, caja.clientWidth - (fija?.clientWidth ?? 0)))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(caja)
    return () => obs.disconnect()
  }, [])
  const rango = useMemo(() => ventana(filas, hoyIso), [filas, hoyIso])
  const hayBase = filas.some((f) => f.barra?.base)
  const estados = useMemo(
    () => new Set(filas.filter((f) => f.barra).map((f) => f.barra!.desvio.semaforo)),
    [filas],
  )

  // LA ESCALA ES UNA SUB-VISTA, NO UN BOTÓN. `COMPONENTS.md` §Secondary tabs: texto con subrayado
  // ink, sin pastillas rellenas. Era un par de botones con fondo grafito, que en esta pantalla
  // competía con las barras —que también son grafito— por la misma atención.
  const controles = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-3">
      <Leyenda hayBase={hayBase} estados={estados} />
      <div className="flex items-center gap-3.5">
        <span className="text-[12px] text-faint">Escala</span>
        {(['semana', 'mes'] as Escala[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEscala(e)}
            aria-pressed={escala === e}
            data-testid={`escala-${e}`}
            className={`pb-[2px] text-[12.5px] capitalize transition-colors ${
              escala === e ? 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]' : 'text-muted hover:text-ink'
            }`}
          >{e}</button>
        ))}
      </div>
    </div>
  )

  // LA CABECERA DE LA COLUMNA FIJA. Los tres rótulos son los del handoff y están en 10px versalitas
  // `faint`, igual que el `<Th>` de cualquier tabla del OS: la columna fija de un Gantt es una tabla
  // aunque no esté hecha de `<td>`.
  const rotulos = (
    <div
      style={{ height: ALTO_HEAD }}
      className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#EFEEEA] bg-surface pr-3 text-[10px] font-medium uppercase tracking-[0.06em] text-faint"
    >
      <span className="flex-1">Obra</span>
      <span className="hidden w-[104px] shrink-0 sm:inline">Etapa</span>
      <span className="hidden w-[150px] shrink-0 sm:inline">Plazo</span>
    </div>
  )

  if (!rango) {
    return (
      <div data-testid="gantt-obras">
        {controles}
        <div className="border-t border-line">
          {rotulos}
          {filas.map((f) => <Renglon key={f.obraId} f={f} />)}
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Ninguna obra visible tiene fechas de plan: sin fechas no hay eje de tiempo que dibujar.
        </p>
      </div>
    )
  }

  const { ancho, x, meses, ticks } = construirEscala(rango.desde, rango.hasta, escala, anchoLibre)
  const alto = filas.length * ALTO_FILA
  const xHoy = x(hoyIso)
  const hoyVisible = xHoy >= 0 && xHoy <= ancho

  return (
    <div data-testid="gantt-obras">
      {controles}

      {/* SIN CAJA: hairline superior y los divisores de fila, como cualquier tabla del OS.
          UN SOLO CONTENEDOR CON SCROLL, y el desplazamiento pasa ACÁ ADENTRO: en un teléfono de
          390px la página no se corre de costado, se corre el Gantt. `overscroll-x-contain` evita
          que al llegar al borde el gesto arrastre la pantalla entera. */}
      <div ref={cajaRef} data-gantt-caja className="relative max-h-[72vh] overflow-auto overscroll-x-contain border-t border-line">
        <div className="flex w-max">
          {/* ── COLUMNA FIJA: las obras ────────────────────────────────────────── */}
          <div data-columna-fija className="sticky left-0 z-20 w-[168px] shrink-0 border-r border-[#EFEEEA] bg-surface sm:w-[460px]">
            {rotulos}
            {filas.map((f) => <Renglon key={f.obraId} f={f} />)}
          </div>

          {/* ── LÍNEA DE TIEMPO ────────────────────────────────────────────────── */}
          <div className="relative shrink-0" style={{ width: ancho }}>
            <div className="sticky top-0 z-10 border-b border-[#EFEEEA] bg-surface" style={{ height: ALTO_HEAD }}>
              <svg width={ancho} height={ALTO_HEAD} className="block">
                {meses.map((m) => (
                  <g key={m.label + m.x0}>
                    <line x1={m.x0} y1={0} x2={m.x0} y2={ALTO_HEAD} className="stroke-line" />
                    <text x={m.x0 + 6} y={15} fontSize={11} className="fill-muted capitalize">{m.label}</text>
                  </g>
                ))}
                {ticks.map((t) => <text key={t.x} x={t.x + 2} y={32} fontSize={10} className="fill-faint">{t.label}</text>)}
              </svg>
            </div>

            <svg width={ancho} height={alto} className="block">
              {meses.map((m) => <line key={'g' + m.x0} x1={m.x0} y1={0} x2={m.x0} y2={alto} className="stroke-line/70" />)}
              {hoyVisible && (
                <line x1={xHoy} y1={0} x2={xHoy} y2={alto} className="stroke-marca" strokeWidth={2} data-testid="linea-hoy-obras" />
              )}

              {filas.map((f, i) => {
                const y = i * ALTO_FILA
                return (
                  <g
                    key={f.obraId}
                    onClick={() => router.push(hrefDe(f.obraId))}
                    className="cursor-pointer"
                    // El renglón de la izquierda ya es un enlace real y es el que usan el teclado y
                    // los lectores de pantalla. Esto es el mismo destino para el que hace click
                    // sobre la barra, que es donde se está mirando.
                    aria-hidden
                  >
                    <rect x={0} y={y} width={ancho} height={ALTO_FILA} className="fill-transparent" />
                    <line x1={0} y1={y + ALTO_FILA} x2={ancho} y2={y + ALTO_FILA} className="stroke-[#EFEEEA]" />
                    {f.barra
                      ? <BarraObra b={f.barra} y={y} x={x} ancho={ancho} />
                      : (
                          // LA AUSENCIA SE ESCRIBE. Va acá y no en la columna de la izquierda porque
                          // es acá donde el ojo va a buscar la barra que no está.
                          <text x={6} y={y + 28} fontSize={11} className="fill-faint" data-testid="obra-sin-plan">{f.motivo}</text>
                        )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* LA REGLA DEL COLOR, ESCRITA. Un semáforo cuyo criterio no está en ningún lado no se puede
          discutir, y el que lo mira le inventa un significado al rojo. Los cuatro umbrales salen de
          `UMBRAL_ATRASO`, que es de donde los lee la función que pinta: si mañana cambian, este
          párrafo cambia solo. */}
      <p className="mt-3 max-w-[900px] text-[11.5px] leading-relaxed text-faint" data-testid="regla-semaforo">
        La obra sin fechas de plan no dibuja barra: no se le inventa un inicio, se dice el motivo. El
        rojo no es «se pasó la fecha»: es una brecha de más de {UMBRAL_ATRASO.criticoPuntos} puntos
        contra el avance esperado, o más de {UMBRAL_ATRASO.criticoDias} días de atraso —ámbar a partir
        de {UMBRAL_ATRASO.menorPuntos} puntos o {UMBRAL_ATRASO.menorDias} días—. Terminada al 100% va
        al día aunque haya cerrado tarde. El avance esperado es una <strong className="font-medium text-muted">ESTIMACIÓN</strong>:
        supone que el trabajo se reparte parejo sobre el calendario, y ninguna obra avanza así. Sirve
        para ordenar la atención, no para afirmar cuánto se atrasó una obra.
      </p>
    </div>
  )
}
