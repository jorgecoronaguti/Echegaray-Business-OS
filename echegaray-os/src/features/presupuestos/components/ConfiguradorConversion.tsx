'use client'

// 13 · EL CONFIGURADOR — plantilla, frentes, método, y el árbol que se va a generar.
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

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section data-testid="bloque-plantilla">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">1 · Plantilla de secuencia</h3>
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
        </section>

        <section data-testid="bloque-frentes">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">2 · Frentes</h3>
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

          <ul className="mt-2.5 space-y-1.5">
            {frentes.map((f, i) => (
              <li key={i} className="flex items-center gap-2" data-testid="frente">
                <input
                  value={f.nombre}
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  aria-label={`Nombre del frente ${i + 1}`}
                  data-testid={`frente-nombre-${i}`}
                  className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
                />
                <input
                  value={String(f.cantidad).replace('.', ',')}
                  inputMode="decimal"
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value.replace(',', '.')) } : x)))}
                  aria-label={`Cantidad del frente ${i + 1}`}
                  data-testid={`frente-cantidad-${i}`}
                  className="w-[86px] shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
                <span className="w-[64px] shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">
                  {fHH(hhDelFrente(f.cantidad, p.hs_unitarias)) ?? 'sin HH'}
                </span>
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
        </section>

        <section data-testid="bloque-metodo">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
            3 · Método de medición de las actividades
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['pasos', 'cantidad', 'manual'] as const).map((m) => {
              const disponible = m !== 'pasos' || plantilla !== null
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!disponible}
                  onClick={() => setMetodoElegido(m)}
                  data-testid={`metodo-${m}`}
                  className={`rounded-control border px-2.5 py-1 text-[12px] ${
                    metodo === m ? 'border-marca bg-marca-soft font-semibold text-ink' : 'border-line text-muted'
                  } disabled:cursor-not-allowed disabled:text-faint`}
                >
                  {m === 'pasos' ? 'Pasos ponderados' : m === 'cantidad' ? 'Cantidad' : 'Manual'}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted" data-testid="nota-metodo">{NOTA_METODO[metodo]}</p>
        </section>

        {/* ═══ 4 · FECHAS Y DOTACIÓN ═══════════════════════════════════════════════════════════
            La fecha de inicio de cada frente es OBLIGATORIA y la exige la base. Sin ella, la
            conversión creaba actividades que parecen planificadas y no tienen dimensión temporal:
            `obra_avance` sólo cuenta las que tienen inicio, así que la obra recién convertida
            publicaba «sin actividades medidas» con el plan entero cargado.

            La dotación es opcional a propósito — hay obras que se planifican antes de saber con
            cuánta gente— y sin ella el plan sale con inicio y SIN fin, dicho en el resultado. */}
        <section data-testid="bloque-fechas">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
            4 · Fechas y dotación por frente
          </h3>
          <ul className="mt-2 space-y-1.5">
            {frentes.map((f, i) => (
              <li key={i} className="flex items-center gap-2" data-testid="frente-plan">
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{f.nombre}</span>
                <input
                  type="date"
                  value={f.inicio ?? ''}
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))}
                  aria-label={`Inicio del frente ${i + 1}`}
                  data-testid={`frente-inicio-${i}`}
                  className="w-[130px] shrink-0 rounded-control border border-line bg-surface px-2 py-1 font-mono text-[12px] tabular-nums text-ink"
                />
                <input
                  value={f.dotacion == null ? '' : String(f.dotacion)}
                  inputMode="numeric"
                  placeholder="dot."
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i
                    ? { ...x, dotacion: e.target.value.trim() === '' ? null : Number(e.target.value) } : x)))}
                  aria-label={`Dotación del frente ${i + 1}`}
                  data-testid={`frente-dotacion-${i}`}
                  className="w-[58px] shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
                <input
                  value={f.tope == null ? '' : String(f.tope)}
                  inputMode="numeric"
                  placeholder="tope"
                  onChange={(e) => setFrentes(frentes.map((x, j) => (j === i
                    ? { ...x, tope: e.target.value.trim() === '' ? null : Number(e.target.value) } : x)))}
                  aria-label={`Tope del frente ${i + 1}`}
                  data-testid={`frente-tope-${i}`}
                  className="w-[58px] shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink"
                />
              </li>
            ))}
          </ul>
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

        <section data-testid="bloque-plan">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">5 · Plan que se va a generar</h3>
          <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-[12px] leading-[1.6] text-ink-soft" data-testid="arbol-previsto">
{arbol.map((nodo) => `${'   '.repeat(Math.max(0, nodo.nivel - 1))}${nodo.nivel === 0 ? '' : '└ '}${nodo.texto}`).join('\n')}
          </pre>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={generar}
          disabled={!control.cierra || !fechas.ok || pendiente || nActividades === 0}
          data-testid="generar-actividades"
          className="rounded-control bg-marca px-3.5 py-[7px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint"
        >
          {pendiente ? 'Generando…' : `Generar ${nActividades} ${nActividades === 1 ? 'actividad' : 'actividades'}`}
        </button>
        <span className="text-[11.5px] text-faint">
          Cada una guarda {p.codigo ?? 'la partida'} y su análisis.
        </span>
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
