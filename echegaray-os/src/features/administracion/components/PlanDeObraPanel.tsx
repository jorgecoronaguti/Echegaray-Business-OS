'use client'

// PLAN DE OBRA DE UNA PERSONA — dónde está hoy y a dónde va.
//
// El dueño (08/09/2026): *«necesito que me permitas designar una obra actual, pero ya quiero poder
// definir lo de los días siguientes… una cosa es hoy y cuando planifico quiero poner lo de mañana y
// siguientes»*.
//
// ═══ PLANIFICAR NO ES OTRA PANTALLA ═══
//
// El desplegable de la grilla contesta «dónde está hoy» y se sigue tocando igual. Planificar es la
// misma pregunta corrida en el tiempo, y por eso vive AL LADO del desplegable —un panel que se abre
// sobre la grilla— y no en una página de asignaciones aparte. La página aparte es exactamente lo
// que el dueño llamó *«imposible»*: obligaba a salir de la asistencia, encontrar a la persona de
// nuevo y volver.
//
// ═══ LA LISTA VA ARRIBA DEL FORMULARIO, Y NO AL REVÉS ═══
//
// Programar un pase se decide mirando de dónde viene y qué ya está programado. Con el formulario
// primero, la decisión se toma antes de ver el dato que la condiciona — y programar dos pases
// pisados es el error que después nadie entiende.
//
// ═══ CANCELAR ESTÁ EN LA FILA, NO EN EL FORMULARIO ═══
//
// Es una acción SOBRE un tramo concreto. Un «cancelar» general obligaría a elegir cuál en un
// segundo control, y en una lista de tres pases programados eso es una equivocación esperando.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds/Drawer'
import { BotonAccion, Campo, CTRL, FormAccion } from '@/shared/components/ui/FormAccion'
import {
  cambiarObraActual, cancelarPaseProgramado, leerPlanDeObra,
} from '../services/obraActualActions'
import {
  diaSiguiente, MAX_DIAS_PROGRAMACION, papelesDeTramos, validarProgramacion,
  type PapelDeTramo, type TramoDeAsignacion,
} from '../services/planDeObraActual'

export interface ObraDelPanel { id: string; nombre: string }

/** `2026-09-10` → `jue 10/09`. El día de la semana es el dato con el que se planifica —«el lunes
 *  arranca en Quattropani»—; una fecha sola obliga a ir a buscar el calendario. */
function fechaConDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** El lunes que viene. Estrictamente posterior a hoy: si hoy ES lunes, el próximo es el de la
 *  semana que viene — «lunes próximo» no puede significar «hoy», que es lo que contesta el
 *  desplegable de al lado. */
function lunesProximo(hoy: string): string {
  let d = diaSiguiente(hoy)
  // 1 = lunes en `getUTCDay`. Se itera en vez de calcular el offset porque `diaSiguiente` ya es la
  // única aritmética de fechas del módulo y duplicarla es duplicar el bug de zona horaria.
  for (let i = 0; i < 7 && new Date(`${d}T00:00:00Z`).getUTCDay() !== 1; i += 1) d = diaSiguiente(d)
  return d
}

type Chip = 'manana' | 'lunes' | 'elegir'

// QUÉ ES CADA TRAMO LO DECIDE `papelesDeTramos`, en el módulo puro. Acá vivía un `papelDe` propio
// que llamaba «está acá» a todo lo que no fuera pasado ni futuro, y por eso el panel afirmaba dos
// obras a la vez el día que alguien corregía la obra sobre la marcha. La regla se prueba sin React.

const ROTULO: Record<PapelDeTramo, string> = {
  pasado: 'estuvo', cierra_hoy: 'cierra hoy', vigente: 'está acá', programado: 'programado',
}

/** EL BLANCO TÁCTIL DEL SISTEMA: 48px en el teléfono, 34px en escritorio. Son los dos tokens que ya
 *  usan input, select y botón (`--os-control-h-mobile` / `--os-control-h`), no un alto inventado
 *  acá. Los chips medían 25px: en obra, con guantes, eso es apuntar. */
const ALTO_TACTIL = 'min-h-control-movil sm:min-h-control'

export function PlanDeObraPanel({ persona, obras, hoy, onCerrar }: {
  persona: { id: string; nombre: string }
  /** Las mismas opciones que el desplegable de la grilla: obras activas, con la RLS ya aplicada. */
  obras: ObraDelPanel[]
  /**
   * HOY SEGÚN EL SERVIDOR, y OBLIGATORIO.
   *
   * Tenía un default con la fecha local del navegador, que a las 23:55 de un teléfono con otra zona
   * es el día siguiente: «Mañana» y «Lunes próximo» resolvían a un día distinto del que la acción
   * —que usa su propio hoy— iba a validar, y el pase rebotaba con «no se puede programar hacia
   * atrás». Era un error visible y no una escritura equivocada, pero el default lo hacía invisible
   * en el código: quien montara el panel en otra pantalla heredaba el bug sin enterarse. Sin
   * default, el compilador exige la fecha del servidor y no hay dónde equivocarse.
   */
  hoy: string
  onCerrar: () => void
}) {
  const router = useRouter()
  const [tramos, setTramos] = useState<TramoDeAsignacion[] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [chip, setChip] = useState<Chip>('manana')
  const [fechaElegida, setFechaElegida] = useState('')
  const [hasta, setHasta] = useState('')
  const [obraId, setObraId] = useState('')

  const aplicar = useCallback((r: Awaited<ReturnType<typeof leerPlanDeObra>>) => {
    if (r.ok) { setTramos(r.tramos); setErrorLectura(null) }
    // UN ERROR DE LECTURA NO SE MUESTRA COMO «no tiene tramos». Una lista vacía afirma que la
    // persona no tiene nada programado; no poder leer no afirma nada.
    else { setTramos([]); setErrorLectura(r.error) }
  }, [])

  const releer = useCallback(async () => aplicar(await leerPlanDeObra(persona.id)), [aplicar, persona.id])

  // LA GUARDA `vivo` NO ES CEREMONIA. El panel se cierra con Escape o con un clic sobre la grilla, y
  // la lectura puede volver después: sin ella se escribe estado sobre un componente desmontado y,
  // peor, una lectura vieja de OTRA persona pisa la nueva si se abren dos fichas seguidas.
  useEffect(() => {
    let vivo = true
    leerPlanDeObra(persona.id).then((r) => { if (vivo) aplicar(r) })
    return () => { vivo = false }
  }, [persona.id, aplicar])

  const desde = chip === 'manana' ? diaSiguiente(hoy) : chip === 'lunes' ? lunesProximo(hoy) : fechaElegida
  const problema = desde ? validarProgramacion({ hoy, desde, hasta: hasta || null }) : 'Elegí desde qué día.'

  const programar = async () => {
    const r = await cambiarObraActual({
      persona_id: persona.id, obra_id: obraId || null, desde, hasta: hasta || null,
    })
    if (r.ok) { await releer(); router.refresh() }
    return r
  }

  const cancelar = async (tramoId: string) => {
    const r = await cancelarPaseProgramado({ persona_id: persona.id, tramo_id: tramoId })
    if (r.ok) { await releer(); router.refresh() }
    return r
  }

  const ordenados = papelesDeTramos(tramos ?? [], hoy)
    .map(({ tramo, papel }) => ({ t: tramo, papel }))
    // Los pasados se recortan a los tres últimos: el panel es para decidir el pase que viene, y una
    // cronología entera acá compite con el historial de asignaciones, que es su propia pantalla.
    .filter((x, _i, todos) => x.papel !== 'pasado'
      || todos.filter((y) => y.papel === 'pasado').slice(0, 3).includes(x))
    .sort((a, b) => (a.t.desde ?? '').localeCompare(b.t.desde ?? ''))

  return (
    <Drawer
      titulo={`Plan de obra · ${persona.nombre}`}
      subtitulo={`Programado hasta ${MAX_DIAS_PROGRAMACION} días adelante. Para mover a alguien HOY está el desplegable de la grilla.`}
      onCerrar={onCerrar}
      ancho={440}
      testid="panel-plan-obra"
    >
      <section className="mb-6">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Sus tramos</h3>
        {errorLectura && (
          <p className="mb-2 text-[12px] text-neg" data-testid="plan-obra-error-lectura">{errorLectura}</p>
        )}
        {tramos === null && <p className="text-[12px] text-faint">Leyendo…</p>}
        {tramos !== null && ordenados.length === 0 && !errorLectura && (
          <p className="text-[12px] text-faint" data-testid="plan-obra-vacio">
            No tiene ninguna asignación cargada.
          </p>
        )}
        <ul className="divide-y divide-line-hairline">
          {ordenados.map(({ t, papel }) => (
            <li
              key={t.id} data-testid="tramo-plan-obra" data-papel={papel}
              className="flex items-start gap-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[12.5px] text-ink">{t.nombre}</span>
                  <span className={`shrink-0 text-[10.5px] ${papel === 'vigente' ? 'text-ink-soft' : 'text-faint'}`}>
                    {ROTULO[papel]}
                  </span>
                </span>
                <span className="mt-px block text-[11px] text-faint">
                  {/* UNA FILA SIN `desde` NO SE INVENTA UNA FECHA. Las hay en la base: las creó la
                      web antes de exigirlo, y escribirles un inicio plausible sería fabricar el dato. */}
                  {t.desde ? fechaConDia(t.desde) : 'sin fecha de inicio'}
                  {' → '}
                  {t.hasta ? fechaConDia(t.hasta) : 'hasta nuevo aviso'}
                </span>
              </span>
              {papel === 'programado' && (
                <BotonAccion
                  accion={cancelar} args={[t.id]} testid="cancelar-pase" tono="neutral"
                  className="shrink-0"
                >
                  Cancelar
                </BotonAccion>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line pt-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
          Programar un cambio
        </h3>
        <FormAccion
          accion={programar} enviar="Programar" testid="form-programar-pase" tactil
          bloqueado={Boolean(problema)} motivoBloqueo={problema}
          mensajeOk="Programado."
        >
          <div className="flex flex-col gap-3">
            <Campo label="Obra">
              {/* «Sin obra» ES UNA OPCIÓN, igual que en el desplegable: alguien puede salir del
                  plantel de obra sin entrar a otra. Ocultarla obligaría a inventar un destino. */}
              <select
                value={obraId} onChange={(e) => setObraId(e.target.value)}
                className={`${CTRL} ${ALTO_TACTIL}`} data-testid="plan-obra-select-obra"
                aria-label="Obra del pase programado"
              >
                <option value="">Sin obra</option>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </Campo>

            <div>
              <span className="text-[11px] text-faint">Desde</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {([['manana', 'Mañana'], ['lunes', 'Lunes próximo'], ['elegir', 'Elegir fecha']] as const)
                  .map(([clave, texto]) => (
                    <button
                      key={clave} type="button" onClick={() => setChip(clave)}
                      data-testid={`chip-${clave}`} aria-pressed={chip === clave}
                      className={`${ALTO_TACTIL} rounded-control border px-3 py-1 text-[12px] transition-colors ${
                        chip === clave
                          ? 'border-ink bg-ink text-[color:var(--os-on-ink,#fff)]'
                          : 'border-line text-muted hover:bg-surface-quiet hover:text-ink'
                      }`}
                    >
                      {texto}
                    </button>
                  ))}
                {chip === 'elegir' && (
                  <input
                    type="date" value={fechaElegida} onChange={(e) => setFechaElegida(e.target.value)}
                    min={diaSiguiente(hoy)} data-testid="plan-obra-desde"
                    aria-label="Primer día del pase"
                    className={`${ALTO_TACTIL} rounded-control border border-line bg-white px-2 py-1 text-[12.5px] text-ink`}
                  />
                )}
              </div>
              {/* LA FECHA RESUELTA SE ESCRIBE. «Mañana» y «Lunes próximo» son atajos, y un atajo que
                  no muestra a qué día resolvió obliga a confiar. */}
              {desde && (
                <p className="mt-1.5 text-[11px] text-muted" data-testid="plan-obra-desde-resuelto">
                  {fechaConDia(desde)}
                </p>
              )}
            </div>

            <Campo
              label="Hasta (opcional)"
              ayuda="En blanco: hasta nuevo aviso. Con fecha, vuelve a su obra actual al día siguiente."
            >
              <input
                type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                min={desde || diaSiguiente(hoy)} className={`${CTRL} ${ALTO_TACTIL}`}
                data-testid="plan-obra-hasta"
                aria-label="Último día del pase"
              />
            </Campo>
          </div>
        </FormAccion>
      </section>
    </Drawer>
  )
}
