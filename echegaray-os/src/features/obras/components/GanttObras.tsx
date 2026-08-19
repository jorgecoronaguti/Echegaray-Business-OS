'use client'

// EL GANTT GLOBAL — UN RENGLÓN POR OBRA. La cartera entera en una pantalla.
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
// El Gantt de la obra —la pantalla más usada del módulo— no se tocó ni una línea.
//
// ═══ LO QUE NO EXISTE NO SE DIBUJA ═══
//
// Sin fechas de plan no hay barra: hay palabras. Sin línea base sellada no hay marca debajo de la
// barra (hoy: CERO de 344 actividades tienen `inicio_base`). Sin avance publicado no hay relleno.
// Una barra de tres píxeles "para que se vea algo" afirma que la obra empieza y termina el mismo
// día, y nadie la revisa porque no parece un error.
//
// ═══ EL COLOR DICE EL ESTADO, NO EL CALENDARIO (20/08) ═══
//
// El dueño: *"No pintar rojo sólo porque la fecha fin pasó"* · *"que el rojo vuelva a significar
// «requiere atención»"*. Antes la barra se ponía roja con `fin < hoy && avance < 100`, y con eso
// Comedor (93%) y Galpón 9 (96%) —dos obras que están cerrando bien— salían del mismo color que
// Salón Comercial, que va 0%. Cuatro de cinco rojas: el rojo dejó de señalar nada.
//
// Ahora el color sale de `desvioDePlazo`, que compara el avance contra el calendario ya consumido.
// La REGLA vive en el servicio, no acá: este archivo sólo la pinta. Cada renglón es plan (el mismo
// tono al 22%) y avance (sólido), en el color de su estado — al día grafito, atraso menor ámbar,
// atraso crítico rojo, sin datos gris. El amarillo de la marca se usa donde lo usa el logo: la
// regla fina que dice «acá estás», la línea de hoy. Hoy no es un problema y pintarlo de rojo era
// decir que sí.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useEffect, useRef } from 'react'
import { construirEscala, type Escala } from '../services/escala'
import { UMBRAL_ATRASO, ventana, type Barra, type FilaObra, type Semaforo } from '../services/ganttObras'
import { ETAPA_LABEL } from '../types'

const ALTO_FILA = 30

/** EL ESTADO EN UN LUGAR: el color de la barra, el de la leyenda y la palabra del detalle salen de
 *  acá. Tres tablas separadas se desincronizan el día que alguien agrega un estado. */
const ESTADO: Record<Semaforo, { fill: string, punto: string, palabra: string }> = {
  al_dia:         { fill: 'fill-accent', punto: 'bg-accent', palabra: 'al día' },
  atraso_menor:   { fill: 'fill-warn',   punto: 'bg-warn',   palabra: 'atraso menor' },
  atraso_critico: { fill: 'fill-neg',    punto: 'bg-neg',    palabra: 'atraso crítico' },
  sin_datos:      { fill: 'fill-faint',  punto: 'bg-faint',  palabra: 'sin datos para juzgar' },
}

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
    : ` · ${ESTADO[d.semaforo].palabra}: ${b.avancePct}% contra ${d.avanceEsperadoPct}% esperado por calendario`
      + (d.brechaPuntos > 0
          ? ` — ${d.brechaPuntos} puntos, unos ${d.atrasoDias} día${d.atrasoDias === 1 ? '' : 's'} de trabajo (estimado)`
          : '')
  return `${quien}: plan ${fmtCorto(b.inicio)} → ${fmtCorto(b.fin)}${base}${av}${estado}`
}

/**
 * LA LEYENDA NOMBRA LOS ESTADOS, Y ADEMÁS DICE CON QUÉ REGLA SE PINTAN.
 *
 * Un semáforo cuyo criterio no está escrito en ningún lado no se puede discutir: cada uno le
 * inventa un significado al rojo y el color deja de ser un acuerdo. La regla entra en una línea de
 * once píxeles y hace que el color rinda cuentas.
 */
function Leyenda({ hayBase, estados }: { hayBase: boolean, estados: Set<Semaforo> }) {
  const orden: Semaforo[] = ['al_dia', 'atraso_menor', 'atraso_critico', 'sin_datos']
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-muted">
        {/* SÓLO LOS ESTADOS QUE LA PANTALLA ESTÁ DIBUJANDO. Nombrar «atraso crítico» un día en que
            ninguna obra lo está manda a buscar una barra roja que no existe. */}
        {orden.filter((e) => estados.has(e)).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-4 rounded-sm ${ESTADO[e].punto}`} />{ESTADO[e].palabra}
          </span>
        ))}
        {/* LA LÍNEA BASE SÓLO SE NOMBRA SI ALGUNA OBRA LA TIENE. Una leyenda que explica una marca que
            no aparece en ninguna fila manda a buscarla, y hoy no hay una sola actividad sellada. */}
        {hayBase && <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-line-strong" />línea base</span>}
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-0.5 bg-marca" />hoy</span>
      </div>
      <p className="text-[10.5px] leading-tight text-faint">
        Atraso = avance que falta contra el calendario ya consumido. Menor: más de {UMBRAL_ATRASO.menorPuntos} puntos
        o {UMBRAL_ATRASO.menorDias} días. Crítico: más de {UMBRAL_ATRASO.criticoPuntos} puntos o {UMBRAL_ATRASO.criticoDias} días.
      </p>
    </div>
  )
}

/**
 * EL RENGLÓN DE LA COLUMNA FIJA: obra · cliente · etapa · avance.
 *
 * El dueño (20/08): *"Cada fila debe permitir ver: OBRA · CLIENTE · ETAPA · BARRA TEMPORAL ·
 * AVANCE"*. Cliente y etapa NO se calculan acá: vienen en la misma fila de `obra_plan_vs_real` que
 * trae las fechas, que es la misma que alimenta el Resumen.
 *
 * TODO EL RENGLÓN ES UN ENLACE A LA OBRA, y por eso el cliente NO es un segundo enlace acá adentro:
 * un `<a>` dentro de otro `<a>` es marcado inválido y el navegador lo desarma solo. La puerta a la
 * ficha CRM del cliente está en el Resumen, que es la vista que existe para eso; acá el cliente es
 * el dato que dice de quién es la barra. En pantallas angostas se oculta —la obra y su barra son lo
 * que no puede faltar— y sigue estando en el `title` para lectores de pantalla.
 */
function Renglon({ f }: { f: FilaObra }) {
  return (
    <Link
      href={hrefDe(f.obraId)}
      data-testid="obra-gantt"
      data-obra={f.obraId}
      data-etapa={f.etapa ?? ''}
      title={resumen(f)}
      style={{ height: ALTO_FILA }}
      className="flex w-full items-center gap-2 border-b border-line/60 px-3 hover:bg-surface-sunken"
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{f.nombre}</span>
      <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-muted sm:inline" data-testid="cliente-gantt">
        {f.clienteNombre ?? '—'}
      </span>
      {/* «etapa sin declarar» EN GRIS Y CON ESAS PALABRAS: es el mismo texto que usa el Resumen.
          Poner un default como «Desarrollo» presentaría un dato fabricado como estado del ciclo de
          vida de una obra real. */}
      <span
        className={`hidden w-[118px] shrink-0 truncate text-[11.5px] sm:inline ${f.etapa ? 'text-muted' : 'text-faint'}`}
        data-testid="etapa-gantt"
      >{etapaDe(f)}</span>
      {/* LA BRECHA EN NÚMERO, AL LADO DEL AVANCE. El color solo ordena la atención pero no dice
          cuánto: con «47% −39» se ve de un vistazo que la obra debería ir por 86, sin pasar el
          mouse por encima ni abrir la ficha. Sólo aparece cuando hay atraso. */}
      {f.barra && f.barra.desvio.brechaPuntos != null && f.barra.desvio.brechaPuntos > 0 && (
        <span
          className={`shrink-0 text-[10.5px] tabular-nums ${f.barra.desvio.semaforo === 'atraso_critico' ? 'text-neg' : 'text-warn'}`}
        >−{f.barra.desvio.brechaPuntos}</span>
      )}
      <span className="shrink-0 text-[11px] tabular-nums text-faint">
        {f.avancePct == null ? '—' : `${f.avancePct}%`}
      </span>
    </Link>
  )
}

/** La barra de una obra: plan, línea base cuando exista, y avance proporcional cuando exista. */
function BarraObra({ b, y, x }: { b: Barra, y: number, x: (iso: string) => number }) {
  const x0 = x(b.inicio)
  const w = Math.max(3, x(b.fin) - x0)
  const color = ESTADO[b.desvio.semaforo].fill
  return (
    <>
      <rect x={x0} y={y + 8} width={w} height={13} rx={3} className={color} opacity={0.22}
            data-testid="barra-obra" data-semaforo={b.desvio.semaforo} />
      {b.avancePct != null && b.avancePct > 0 && (
        <rect x={x0} y={y + 8} width={Math.max(2, (w * Math.min(100, b.avancePct)) / 100)} height={13} rx={3} className={color} />
      )}
      {/* LA LÍNEA BASE VA DEBAJO Y FINA: es la referencia contra la que se compara el plan, no otro
          plan. Sólo aparece con sus dos puntas selladas. */}
      {b.base && (
        <rect x={x(b.base.inicio)} y={y + 22} width={Math.max(3, x(b.base.fin) - x(b.base.inicio))} height={3} rx={1} className="fill-line-strong" data-testid="linea-base-obra" />
      )}
    </>
  )
}

/**
 * @param hoyIso EL DÍA LO FIJA EL SERVIDOR y viaja como texto. Si este componente leyera el reloj
 * del navegador, la línea de hoy y el orden de los renglones —que el servidor ya calculó— podrían
 * discrepar alrededor de la medianoche, y React además marcaría el desajuste de hidratación.
 */
export function GanttObras({ filas, hoyIso }: { filas: FilaObra[], hoyIso: string }) {
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

  const controles = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <Leyenda hayBase={hayBase} estados={estados} />
      <div className="flex overflow-hidden rounded-control border border-line text-[12px]">
        {(['semana', 'mes'] as Escala[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEscala(e)}
            aria-pressed={escala === e}
            className={`px-3 py-1 capitalize ${escala === e ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-surface-sunken'}`}
          >{e}</button>
        ))}
      </div>
    </div>
  )

  if (!rango) {
    return (
      <div data-testid="gantt-obras" className="rounded-card border border-line bg-surface">
        {controles}
        <ul className="divide-y divide-line/60">{filas.map((f) => <li key={f.obraId}><Renglon f={f} /></li>)}</ul>
        <p className="border-t border-line px-4 py-6 text-center text-[13px] text-muted">
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
    <div data-testid="gantt-obras" className="rounded-card border border-line bg-surface">
      {controles}

      {/* UN SOLO CONTENEDOR CON SCROLL, y el desplazamiento pasa ACÁ ADENTRO: en un teléfono de
          390px la página no se corre de costado, se corre el Gantt. `overscroll-x-contain` evita
          que al llegar al borde el gesto arrastre la pantalla entera. */}
      <div ref={cajaRef} data-gantt-caja className="relative max-h-[72vh] overflow-auto overscroll-x-contain">
        <div className="flex w-max">
          {/* ── COLUMNA FIJA: las obras ────────────────────────────────────────── */}
          <div data-columna-fija className="sticky left-0 z-20 w-[148px] shrink-0 border-r border-line bg-surface sm:w-[452px]">
            <div className="sticky top-0 z-10 flex h-11 items-end gap-2 border-b border-line bg-surface px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
              <span className="flex-1">Obra</span>
              <span className="hidden flex-1 sm:inline">Cliente</span>
              <span className="hidden w-[118px] shrink-0 sm:inline">Etapa</span>
              <span className="shrink-0">Avance</span>
            </div>
            {filas.map((f) => <Renglon key={f.obraId} f={f} />)}
          </div>

          {/* ── LÍNEA DE TIEMPO ────────────────────────────────────────────────── */}
          <div className="relative shrink-0" style={{ width: ancho }}>
            <div className="sticky top-0 z-10 h-11 border-b border-line bg-surface">
              <svg width={ancho} height={44} className="block">
                {meses.map((m) => (
                  <g key={m.label + m.x0}>
                    <line x1={m.x0} y1={0} x2={m.x0} y2={44} className="stroke-line" />
                    <text x={m.x0 + 6} y={16} fontSize={11} className="fill-muted capitalize">{m.label}</text>
                  </g>
                ))}
                {ticks.map((t) => <text key={t.x} x={t.x + 2} y={35} fontSize={9} className="fill-faint">{t.label}</text>)}
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
                    <line x1={0} y1={y + ALTO_FILA} x2={ancho} y2={y + ALTO_FILA} className="stroke-line/50" />
                    {f.barra
                      ? <BarraObra b={f.barra} y={y} x={x} />
                      : (
                          // LA AUSENCIA SE ESCRIBE. Va acá y no en la columna de la izquierda porque
                          // es acá donde el ojo va a buscar la barra que no está.
                          <text x={6} y={y + 19} fontSize={11} className="fill-faint" data-testid="obra-sin-plan">{f.motivo}</text>
                        )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
