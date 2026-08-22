'use client'

import { useActionState, useState } from 'react'
import { Aviso, Boton } from '@/shared/components/ds'
import { Barra, Confirmacion, Nada, Panel, porcentaje } from './Piezas'
import { PieDeAccion } from './ShellJefe'
import { AVISO_CRITERIO, ROTULO_METODO, controlDe } from '../services/medicion'
import type { Metodo } from '../services/medicion'
import type { ActividadDelJefe, PasoDeActividad } from '../services/jefeService'
import { avancePorPasos } from '@/features/obras/services/avance'
import type { Esperado } from '@/features/administracion/services/presencia'

// J03 · REGISTRAR AVANCE — la pantalla donde el jefe firma un número.
//
// ═══ EL MÉTODO DECIDE EL CONTROL, Y NO HAY UN CONTROL «UNIVERSAL» ═══
//
// Pasos → una lista de casillas de 58px. Cantidad → cuántas unidades se hicieron HOY. Partes y
// manual → a cuánto llegó la tarea. Ofrecer siempre un porcentaje sería más simple de programar y
// mucho peor: en una tarea medida por producción, ese porcentaje no mueve nada y el jefe se va
// convencido de que cargó el día.
//
// ═══ LA PRIMARIA DESHABILITADA DICE POR QUÉ ═══
//
// Con método manual y sin criterio escrito, la base rechaza la fila (CHECK
// `obra_ejecucion_manual_exige_criterio`). El botón se apaga y el aviso es el texto literal de la
// regla. Un botón que se puede tocar y falla en el servidor enseña que la pantalla no sabe lo que
// la base sabe.
//
// ═══ HH NO ES AVANCE ═══
//
// «Quién lo hizo» carga HORAS y lo dice con su rótulo: se escriben en `registros_hh` y no tocan el
// porcentaje. Confundir las dos cosas es el error más caro del control de obra.

type Estado = { ok: boolean; mensaje: string } | null

export function FormularioAvance({
  actividad, frente, pasos, plantel, fecha, accion,
}: {
  actividad: ActividadDelJefe
  /** El frente sale del ÁRBOL, no de `rubro`: son dos jerarquías y no coinciden. Ver `frentes.ts`. */
  frente: string | null
  pasos: PasoDeActividad[]
  plantel: Esperado[]
  fecha: string
  accion: (estado: Estado, form: FormData) => Promise<Estado>
}) {
  const metodo = (actividad.metodo_avance ?? 'manual') as Metodo
  const control = controlDe(metodo)

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(pasos.filter((p) => p.hecho_en).map((p) => p.id)))
  const [objetivo, setObjetivo] = useState<string>(
    actividad.avance_pct == null ? '' : String(actividad.avance_pct))
  const [cantidad, setCantidad] = useState('')
  const [criterio, setCriterio] = useState('')
  const [gente, setGente] = useState<Record<string, string>>({})
  const [estado, enviar, enviando] = useActionState(accion, null)

  // LA CUENTA NO SE REPITE ACÁ. `avancePorPasos` es la misma función que usa la vista y la
  // escritura; recalcularla en el formulario dejaba tres implementaciones de «peso hecho sobre peso
  // total», y la del formulario es la que la persona ve mientras decide.
  const pctPasos = avancePorPasos(pasos.map((p) => ({ peso: p.peso, hecho: marcados.has(p.id) })))
  // El peso total NO es el avance: es lo que convierte «peso 30» en «30 % de la tarea» al lado de
  // cada paso. Se queda acá porque es una etiqueta de la lista, no una segunda cuenta del avance.
  const pesoTotal = pasos.reduce((s, p) => s + p.peso, 0)
  const pctVivo = control === 'pasos' ? pctPasos : actividad.avance_pct

  const faltaCriterio = metodo === 'manual' && criterio.trim() === ''
  const hayCambio = control === 'pasos'
    ? distinto(marcados, pasos)
    : control === 'cantidad'
      ? Number(cantidad.replace(',', '.')) > 0
      : objetivo.trim() !== '' && Number(objetivo.replace(',', '.')) !== (actividad.avance_pct ?? -1)

  return (
    <form action={enviar}>
      <input type="hidden" name="actividad_id" value={actividad.actividad_id} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="pasos" value={[...marcados].join(',')} />
      <input type="hidden" name="tipo_hora" value="normal" />

      <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
        {estado?.ok && <Confirmacion testid="resultado-avance">{estado.mensaje}</Confirmacion>}
        {estado && !estado.ok && (
          <Aviso tono="neg" titulo="No se pudo guardar" testid="resultado-avance">{estado.mensaje}</Aviso>
        )}

        <section className="rounded-[16px] bg-surface p-5">
          <div className="mb-1.5 text-[11px] tracking-[0.06em] text-faint">
            {(frente ?? 'SIN FRENTE').toUpperCase()}
          </div>
          <h1 className="mb-4 text-[20px] font-semibold leading-[1.28] text-ink">{actividad.nombre}</h1>
          <div className="flex items-center gap-3.5">
            <span className="flex-1">
              <Barra pct={pctVivo} tono="marca" />
            </span>
            <span className="shrink-0 font-mono text-[28px] font-semibold leading-none tabular-nums text-ink">
              {pctVivo == null ? '—' : `${pctVivo} %`}
            </span>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Se mide por {ROTULO_METODO[metodo].toLowerCase()}
            {actividad.origen_avance ? ` · el número de arriba salió de ${actividad.origen_avance}` : ''}
            {' · lo firmás vos, ahora'}
          </p>
        </section>

        {control === 'pasos' && (
          <Panel titulo="Pasos ejecutados" testid="pasos">
            {pasos.length === 0 ? (
              <Nada>Se mide por pasos y no tiene pasos cargados. Se definen en la planificación.</Nada>
            ) : (
              <div className="flex flex-col gap-2 px-5 pb-5">
                {pasos.map((p) => {
                  const on = marcados.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-testid="paso"
                      aria-pressed={on}
                      onClick={() => setMarcados(alternar(marcados, p.id))}
                      className={`flex min-h-[58px] items-center gap-3.5 rounded-[12px] p-3.5 text-left ${
                        on ? 'bg-marca-soft' : 'bg-surface-quiet'
                      }`}
                    >
                      <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${
                        on ? 'bg-marca text-ink' : 'bg-surface-sunken text-faint'
                      }`}>
                        {on ? '✓' : '○'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[16px] ${on ? 'font-medium text-ink' : 'text-muted'}`}>
                          {p.nombre}
                        </span>
                        {p.tiempo_tecnico && (
                          <span className="mt-0.5 block text-[12px] text-warn">no se puede apurar</span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[14px] tabular-nums text-faint">
                        {pesoTotal > 0 ? `${Math.round((p.peso / pesoTotal) * 100)} %` : `peso ${p.peso}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>
        )}

        {control === 'cantidad' && (
          <Panel titulo={`Cuánto se hizo hoy`} testid="cantidad">
            <div className="px-5 pb-5">
              <label className="flex items-center gap-3 rounded-[12px] bg-surface-quiet px-4">
                <input
                  name="cantidad"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="0"
                  data-testid="campo-cantidad"
                  className="h-[52px] w-full border-none bg-transparent font-mono text-[22px] tabular-nums text-ink outline-none"
                />
                <span className="shrink-0 text-[15px] text-muted">{actividad.unidad ?? 'unidades'}</span>
              </label>
              <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
                Lo de HOY, no el acumulado.
                {actividad.cantidad_objetivo != null && (
                  <> Objetivo: {actividad.cantidad_objetivo} {actividad.unidad ?? ''}.</>
                )}
              </p>
            </div>
          </Panel>
        )}

        {control === 'porcentaje' && (
          <Panel titulo="A cuánto llegó" testid="porcentaje">
            <div className="px-5 pb-5">
              <label className="flex items-center gap-3 rounded-[12px] bg-surface-quiet px-4">
                <input
                  name="avance_pct"
                  inputMode="decimal"
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                  placeholder="0"
                  data-testid="campo-avance"
                  className="h-[52px] w-full border-none bg-transparent font-mono text-[22px] tabular-nums text-ink outline-none"
                />
                <span className="shrink-0 text-[15px] text-muted">%</span>
              </label>
              <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
                Total de la tarea, no lo de hoy. Venía en {porcentaje(actividad.avance_pct)}.
              </p>
            </div>
          </Panel>
        )}

        {metodo === 'manual' && (
          <Panel titulo="Con qué criterio" testid="criterio">
            <div className="px-5 pb-5">
              <textarea
                name="criterio"
                value={criterio}
                onChange={(e) => setCriterio(e.target.value)}
                rows={3}
                data-testid="campo-criterio"
                placeholder="Ej.: 3 de 4 paños terminados, falta el del eje sur"
                className="w-full rounded-[12px] bg-surface-quiet p-3.5 text-[15px] leading-relaxed text-ink outline-none"
              />
              {faltaCriterio && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-warn" data-testid="aviso-criterio">
                  {AVISO_CRITERIO}
                </p>
              )}
            </div>
          </Panel>
        )}

        <Panel titulo="Quién lo hizo" contador="horas" testid="quien">
          {plantel.length === 0 ? (
            <Nada>Nadie asignado a esta obra. Las carga Administración, desde Personal.</Nada>
          ) : (
            <div className="flex flex-col gap-2 px-5 pb-4">
              {plantel.map((p) => (
                <label
                  key={p.id}
                  data-testid="persona-hh"
                  className="flex min-h-[56px] items-center gap-3 rounded-[12px] bg-surface-quiet px-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{p.nombre_completo}</span>
                    <span className="block text-[12px] text-faint">{p.categoria ?? 'sin categoría'}</span>
                  </span>
                  <input
                    name={`hh_${p.id}`}
                    inputMode="decimal"
                    value={gente[p.id] ?? ''}
                    onChange={(e) => setGente({ ...gente, [p.id]: e.target.value })}
                    placeholder="—"
                    aria-label={`Horas de ${p.nombre_completo}`}
                    // 48 y no 44: es un CAMPO, y el handoff le da a los campos del teléfono los
                    // mismos 48px que a la primaria (`--os-control-h-mobile`). Con guante, 44 es el
                    // piso de lo que se toca, no la medida de lo que se escribe.
                    className="h-[48px] w-[72px] shrink-0 rounded-[10px] bg-surface text-center font-mono text-[16px] tabular-nums text-ink outline-none"
                  />
                  <span className="shrink-0 text-[12.5px] text-muted">hs</span>
                </label>
              ))}
            </div>
          )}
          {/* La línea se acorta pero NO se va: confundir HH con avance es el error más caro del
              control de obra, y el que carga tiene que verlo mientras carga. */}
          <p className="px-5 pb-4 text-[11.5px] leading-relaxed text-faint">
            Son horas: van a las HH y no mueven el avance.
          </p>
        </Panel>
      </div>

      <PieDeAccion>
        <Boton
          type="submit"
          variante="primaria"
          tamano="bloque"
          disabled={enviando || faltaCriterio || !hayCambio}
          data-testid="guardar-avance"
        >
          {enviando ? 'Guardando…' : faltaCriterio ? 'Falta el criterio' : hayCambio ? 'Guardar avance' : 'Sin cambios'}
        </Boton>
      </PieDeAccion>
    </form>
  )
}

function alternar(s: Set<string>, id: string): Set<string> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

function distinto(marcados: Set<string>, pasos: PasoDeActividad[]): boolean {
  return pasos.some((p) => marcados.has(p.id) !== !!p.hecho_en)
}
