'use client'

// 13 · EL CONFIGURADOR — plantilla, frentes, y el árbol que se va a generar.
//
// ═══ TRES ZONAS, NO CINCO (Design 23/08 · COMPONENTS.md §Conversion panel) ═══
//
// El patrón canónico es «plantilla de secuencia · frentes · árbol resultante», con el árbol ANTES
// de generar y la primaria adentro de esa tercera zona. Eran cinco bloques numerados y dos de ellos
// no eran decisiones propias: el MÉTODO DE MEDICIÓN se decide con la plantilla —elegir «sin pasos»
// ya descarta «pasos ponderados»— y las FECHAS Y LA DOTACIÓN son atributos del frente, que estaban
// en una segunda tabla con las mismas filas que la primera. Un frente = una fila.
//
// El árbol pasa a la derecha, fijo: es la respuesta a «¿qué va a quedar en la obra?» y se mira
// mientras se toca el stepper, no después de scrollear.
//
// ═══ ACÁ NO VIVE NINGUNA REGLA; ACÁ SE MUESTRAN ═══
//
// «La cantidad se conserva o no genera» la hace cumplir `convertir_partida_a_plan` en Postgres, y
// si esta pantalla se equivoca la base rechaza sin crear nada. Lo que hace el control verde de acá
// es que nadie llene seis frentes para enterarse al final. El número que promete el botón —
// `actividadesPrevistas`— es el mismo `v_n_act` que cuenta la función: si prometiera otro, el
// mensaje de éxito sería el primer dato falso de la obra.
//
// ═══ EL STEPPER REPARTE IGUAL; DESPUÉS SE EDITA ═══
//
// Cambiar el número de frentes vuelve a repartir en partes iguales —es lo que significa mover el
// stepper—. Los nombres y las cantidades se editan después, y el control de cierre se recalcula en
// cada tecla.

import { useActionState, useState, startTransition } from 'react'
import { Aviso } from '@/shared/components/ds'
import type { MetodoMedicion, PartidaValorizada, Plantilla } from '../types'
import {
  actividadesPrevistas, arbolPrevisto, controlDeCierre, controlDeFechas, hhDelFrente, metodoEfectivo,
  nombresPorDefecto, repartirIgual, type Frente,
} from '../services/frentes'
import { cantidad as fCantidad, hh as fHH, rendimiento } from '../services/formato'
import { convertirPartida } from '../services/actionsConversion'
import { INICIAL, type EstadoAccion } from '../services/accion'

const MAX_FRENTES = 6

const NOTA_METODO: Record<MetodoMedicion, string> = {
  pasos: 'Cada actividad avanza por los pasos de la plantilla, con los pesos de la tipología. Es lo correcto para hormigón: medir por m³ no representa el trabajo.',
  cantidad: 'Cada actividad avanza por unidades ejecutadas sobre su cantidad. Sirve cuando lo que se mide en obra es la cantidad misma.',
  manual: 'Porcentaje declarado con criterio obligatorio y firma. Para trabajos donde ninguna medición objetiva representa el avance.',
}

export function ConfiguradorConversion({
  p, plantillas, obraId, obraNombre, cotizacionId, yaConvertida,
}: {
  p: PartidaValorizada
  plantillas: Plantilla[]
  obraId: string
  obraNombre: string
  cotizacionId: string
  yaConvertida: boolean
}) {
  const [plantillaId, setPlantillaId] = useState('')
  const [n, setN] = useState(1)
  const [frentes, setFrentes] = useState<Frente[]>(() => repartoInicial(p.cantidad, 1))
  const [metodoElegido, setMetodoElegido] = useState<MetodoMedicion | null>(null)
  const [estado, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(convertirPartida, INICIAL)

  const plantilla = plantillas.find((x) => x.id === plantillaId) ?? null
  const pasos = plantilla?.pasos ?? []
  const control = controlDeCierre(frentes, p.cantidad)
  const fechas = controlDeFechas(frentes)
  const metodo = metodoEfectivo(metodoElegido, p.metodo_medicion, plantilla !== null)
  const nActividades = actividadesPrevistas(frentes.length, pasos.length)
  // SIN `useMemo`. El compilador de React memoiza esto solo, y una lista de dependencias con
  // `pasos` —que sale de un `??` y es un array nuevo en cada render— le impide hacerlo: la
  // memoización manual quedaba rota Y bloqueaba la automática. Armar seis nodos de texto no es
  // costoso; sostener una lista de dependencias mal escrita, sí.
  const arbol = arbolPrevisto({ obra: obraNombre, rubro: p.rubro, descripcion: p.descripcion, frentes, pasos })

  function cambiarN(nuevo: number) {
    const v = Math.min(MAX_FRENTES, Math.max(1, nuevo))
    setN(v)
    setFrentes(repartoInicial(p.cantidad, v))
  }

  function generar() {
    const d = new FormData()
    d.set('partida_id', p.partida_id)
    d.set('cotizacion_id', cotizacionId)
    d.set('obra_id', obraId)
    d.set('plantilla_id', plantillaId)
    d.set('metodo', metodo)
    for (const f of frentes) {
      d.append('frente_nombre', f.nombre)
      d.append('frente_cantidad', String(f.cantidad))
      d.append('frente_inicio', f.inicio ?? '')
      d.append('frente_dotacion', f.dotacion == null ? '' : String(f.dotacion))
      d.append('frente_tope', f.tope == null ? '' : String(f.tope))
    }
    startTransition(() => ejecutar(d))
  }

  if (yaConvertida) {
    return (
      <Aviso tono="info" titulo="Esta partida ya se convirtió" testid="ya-convertida">
        Sus actividades están en la obra. Para agregar frentes se AMPLÍA el plan desde la obra: lo
        ejecutado no se toca y se reparte el resto. Convertirla de nuevo duplicaría el trabajo.
      </Aviso>
    )
  }

  return (
    <div className="min-w-0" data-testid="configurador-conversion">
      <h2 className="text-[15px] font-semibold leading-tight text-ink">{p.descripcion}</h2>
      <p className="mt-0.5 font-mono text-[12px] tabular-nums text-muted">
        {p.codigo ?? 'sin código'} · {p.cantidad === null ? 'sin cómputo' : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()} · {fHH(p.hh) ?? 'sin HH'}
      </p>
      <p className="mt-1.5 text-[11.5px] text-faint" data-testid="nota-analisis">
        {p.sin_analisis || p.hs_unitarias === null
          ? 'Sin análisis cargado: se convierte igual, sin HH ni plazo.'
          : `Del análisis: ${rendimiento(p.hs_unitarias)} hs/${p.unidad ?? 'un'} · la conversión reparte trabajo, no cambia cantidad ni costo`}
      </p>

      <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,330px)]">
        <div className="min-w-0 space-y-6">
        <section data-testid="bloque-plantilla">
          <Zona n={1}>Plantilla de secuencia</Zona>
          <div className="mt-2 space-y-1">
            {plantillas.map((pl) => (
              <Opcion key={pl.id} activa={plantillaId === pl.id} onClick={() => setPlantillaId(pl.id)}
                nombre={pl.nombre} detalle={`${pl.pasos.map((s) => s.nombre).join(' · ')} (${pl.pasos.length})`} />
            ))}
            <Opcion activa={plantillaId === ''} onClick={() => { setPlantillaId(''); setMetodoElegido(null) }}
              nombre="Sin pasos" detalle="la partida queda como una actividad por frente" testid="plantilla-sin-pasos" />
          </div>
          {plantillas.length === 0 && (
            <p className="mt-2 text-[11.5px] text-warn">No hay plantillas activas cargadas en la base maestra.</p>
          )}

          {/* EL MÉTODO VIVE CON LA PLANTILLA, no en un bloque propio: elegir «sin pasos» ya descarta
              «pasos ponderados», y tenerlos separados hacía parecer que eran dos decisiones
              independientes cuando una restringe a la otra. */}
          <div className="mt-3 border-t border-[#EFEEEA] pt-2.5" data-testid="bloque-metodo">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[11.5px] text-muted">Las actividades avanzan por</span>
              <div className="flex flex-wrap gap-1.5">
                {(['pasos', 'cantidad', 'manual'] as const).map((m) => {
                  const disponible = m !== 'pasos' || plantilla !== null
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!disponible}
                      onClick={() => setMetodoElegido(m)}
                      data-testid={`metodo-${m}`}
                      title={disponible ? NOTA_METODO[m] : 'Hace falta una plantilla con pasos'}
                      className={`rounded-control border px-2.5 py-1 text-[12px] ${
                        metodo === m ? 'border-marca bg-marca-soft font-semibold text-ink' : 'border-line text-muted'
                      } disabled:cursor-not-allowed disabled:text-faint`}
                    >
                      {m === 'pasos' ? 'Pasos ponderados' : m === 'cantidad' ? 'Cantidad' : 'Manual'}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint" data-testid="nota-metodo">{NOTA_METODO[metodo]}</p>
          </div>
        </section>

        <section data-testid="bloque-frentes">
          <Zona n={2}>Frentes</Zona>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-control border border-line px-2 py-1">
              <button type="button" onClick={() => cambiarN(n - 1)} disabled={n <= 1}
                aria-label="Un frente menos" data-testid="frentes-menos"
                className="text-[14px] text-muted disabled:text-faint">−</button>
              <span className="w-6 text-center font-mono text-[13px] tabular-nums text-ink" data-testid="n-frentes">{n}</span>
              <button type="button" onClick={() => cambiarN(n + 1)} disabled={n >= MAX_FRENTES}
                aria-label="Un frente más" data-testid="frentes-mas"
                className="text-[14px] text-muted disabled:text-faint">+</button>
            </div>
            <span className="text-[11px] text-faint">reparto igual, editable</span>
          </div>

          {/* UN FRENTE = UNA FILA. Nombre, cantidad, HH, inicio, dotación y tope eran dos tablas con
              las MISMAS filas separadas por un bloque de método: para saber qué fecha le tocaba al
              frente 3 había que contar filas en dos listas. La fecha de inicio la EXIGE la base —sin
              ella la conversión crea actividades sin dimensión temporal y `obra_avance` no las
              cuenta—; la dotación es opcional a propósito y sin ella el plan sale con inicio y sin
              fin, dicho abajo. */}
          <div className="mt-2.5 grid grid-cols-[minmax(96px,1fr)_74px_54px_128px_50px_50px] gap-x-2 pb-1 text-[10px] uppercase tracking-[0.05em] text-faint">
            <span>Frente</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">HH</span>
            <span>Inicio</span>
            <span className="text-right">Dot.</span>
            <span className="text-right">Tope</span>
          </div>
          <ul className="space-y-1.5">
            {frentes.map((f, i) => (
              <li key={i} className="grid grid-cols-[minmax(96px,1fr)_74px_54px_128px_50px_50px] items-center gap-x-2" data-testid="frente">
                <input
                  value={f.nombre}
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  aria-label={`Nombre del frente ${i + 1}`}
                  data-testid={`frente-nombre-${i}`}
                  className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
                />
                <input
                  value={String(f.cantidad).replace('.', ',')}
                  inputMode="decimal"
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value.replace(',', '.')) } : x)))}
                  aria-label={`Cantidad del frente ${i + 1}`}
                  data-testid={`frente-cantidad-${i}`}
                  className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
                <span className="truncate text-right font-mono text-[11px] tabular-nums text-faint">
                  {fHH(hhDelFrente(f.cantidad, p.hs_unitarias)) ?? 'sin HH'}
                </span>
                <input
                  type="date"
                  value={f.inicio ?? ''}
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))}
                  aria-label={`Inicio del frente ${i + 1}`}
                  data-testid={`frente-inicio-${i}`}
                  className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 font-mono text-[12px] tabular-nums text-ink"
                />
                <input
                  value={f.dotacion == null ? '' : String(f.dotacion)}
                  inputMode="numeric"
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i
                    ? { ...x, dotacion: e.target.value.trim() === '' ? null : Number(e.target.value) } : x)))}
                  aria-label={`Dotación del frente ${i + 1}`}
                  data-testid={`frente-dotacion-${i}`}
                  className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
                <input
                  value={f.tope == null ? '' : String(f.tope)}
                  inputMode="numeric"
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i
                    ? { ...x, tope: e.target.value.trim() === '' ? null : Number(e.target.value) } : x)))}
                  aria-label={`Tope del frente ${i + 1}`}
                  data-testid={`frente-tope-${i}`}
                  className="min-w-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
              </li>
            ))}
          </ul>

          <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-line pt-2" data-testid="control-cierre">
            <span className="text-[11.5px] text-muted">Suma</span>
            <span className={`font-mono text-[13px] font-semibold tabular-nums ${control.cierra ? 'text-pos' : 'text-warn'}`}>
              {fCantidad(control.suma)} {p.unidad ?? ''} {control.cierra ? '✓' : ''}
            </span>
          </div>
          {!control.cierra && (
            <p className="mt-1 text-[11.5px] text-warn" data-testid="motivo-cierre">{control.motivo}</p>
          )}
          {fechas.motivo && (
            <p className="mt-1.5 text-[11.5px] text-warn" data-testid="motivo-fechas">{fechas.motivo}</p>
          )}
          {fechas.ok && fechas.sinDotacion && (
            <p className="mt-1.5 text-[11.5px] text-muted" data-testid="aviso-sin-dotacion">
              Sin dotación el plan sale con fecha de inicio y sin fecha de fin: la duración de un paso
              sale de sus HH divididas por la gente que lo hace. El tiempo técnico (curado, fraguado)
              sí queda, porque son días fijos.
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-faint">
            El trabajo se mide en días hábiles de la obra; el tiempo técnico, en días de calendario.
          </p>
        </section>
        </div>

        {/* ═══ ZONA 3 · EL ÁRBOL, ANTES DE GENERAR ═══
            «El árbol resultante se muestra ANTES de generar» (COMPONENTS.md §Conversion panel). Por
            eso la primaria vive ACÁ y no al pie de la pantalla: el botón que promete N actividades
            tiene que estar debajo de las N actividades que promete. `nActividades` es el mismo
            `v_n_act` que cuenta la función en Postgres — si prometiera otro número, el mensaje de
            éxito sería el primer dato falso de la obra. */}
        <section className="min-w-0" data-testid="bloque-plan">
          <Zona n={3}>Lo que se va a generar</Zona>
          <div className="mt-2 rounded-card border border-line bg-surface-quiet p-3">
            <pre className="overflow-x-auto whitespace-pre font-mono text-[11.5px] leading-[1.6] text-ink-soft" data-testid="arbol-previsto">
{arbol.map((nodo) => `${'   '.repeat(Math.max(0, nodo.nivel - 1))}${nodo.nivel === 0 ? '' : '└ '}${nodo.texto}`).join('\n')}
            </pre>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={!control.cierra || !fechas.ok || pendiente || nActividades === 0}
            data-testid="generar-actividades"
            className="mt-3 w-full rounded-control bg-marca px-3.5 py-[8px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint"
          >
            {pendiente ? 'Generando…' : `Generar ${nActividades} ${nActividades === 1 ? 'actividad' : 'actividades'}`}
          </button>
          {/* La trazabilidad se dice en UNA línea, no en un párrafo (COMPONENTS.md). */}
          <p className="mt-1.5 text-[11px] text-faint">
            Cada una guarda {p.codigo ?? 'la partida'} y su análisis.
          </p>
        </section>
      </div>

      {estado.ok && (
        <div className="mt-3">
          <Aviso tono="info" titulo="Convertida" testid="conversion-ok">
            {estado.mensaje}
            {/* EL PLAN GENERADO TODAVÍA NO ES LÍNEA BASE. Las fechas que puso la conversión son
                `inicio_plan`/`fin_plan`; `inicio_base`/`fin_base` los escribe `sellarBaseline`, y
                sellar antes de revisar congela un cronograma que nadie miró. El CTA lleva a
                revisarlo, no a sellarlo. */}
            <span className="mt-2 block">
              Las fechas son del PLAN, todavía no línea base.{' '}
              <a href={`/obras/${obraId}/cronograma`} data-testid="ir-al-cronograma"
                className="font-medium text-ink underline underline-offset-2">
                Revisar el cronograma y sellar la línea base
              </a>
              {' '}— sellar antes de mirarlo congela un plan que nadie revisó, y el desvío se mide
              contra él.
            </span>
          </Aviso>
        </div>
      )}
      {estado.error && (
        // EL ERROR DE LA BASE, TAL CUAL: es el que dice cuánto suman los frentes y cuánto tiene la
        // partida. Traducirlo a «no se pudo» borraría el único dato útil que trae.
        <div className="mt-3"><Aviso tono="neg" titulo="No se generó nada" testid="conversion-error">{estado.error}</Aviso></div>
      )}
    </div>
  )
}

/** El rótulo de una de las TRES zonas del patrón. El número va en su propio disco, no en el texto. */
function Zona({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-[10px] tabular-nums text-muted"
      >
        {n}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">{children}</span>
    </h3>
  )
}

function repartoInicial(cantidadPartida: number | null, n: number): Frente[] {
  const partes = repartirIgual(cantidadPartida, n)
  const nombres = nombresPorDefecto(n)
  // Sin cómputo no hay reparto posible: los frentes nacen en 0 y el control lo dice. No se inventa
  // una cantidad para que el formulario "se vea completo".
  return nombres.map((nombre, i) => ({ nombre, cantidad: partes?.[i] ?? 0 }))
}

function Opcion({ activa, onClick, nombre, detalle, testid }: {
  activa: boolean; onClick: () => void; nombre: string; detalle: string; testid?: string
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={activa}
      className="flex w-full items-start gap-2 rounded-control px-1.5 py-1.5 text-left hover:bg-surface-quiet">
      <span aria-hidden className={`mt-[3px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border ${
        activa ? 'border-marca bg-marca' : 'border-line-strong'}`} />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium leading-tight text-ink">{nombre}</span>
        <span className="block text-[11px] leading-tight text-muted">{detalle}</span>
      </span>
    </button>
  )
}
