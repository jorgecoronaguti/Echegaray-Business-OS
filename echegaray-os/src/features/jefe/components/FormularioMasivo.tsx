'use client'

import { useActionState, useState } from 'react'
import { Aviso } from '@/shared/components/ds'
import { AccionPrimaria, Confirmacion, Nada, Panel, Rotulo } from './Piezas'
import { PieDeAccion } from './ShellJefe'
import { AVISO_CRITERIO, VALORES_MASIVOS, avisoDePrecision, renglones } from '../services/medicion'
import type { Renglon } from '../services/medicion'
import type { ActividadDelJefe } from '../services/jefeService'

// J04 · AVANCE DEL DÍA — «tocá las que avanzaron».
//
// ═══ LA TAREA QUE NO SE PUEDE APLICAR SE MUESTRA APAGADA, NO SE ESCONDE ═══
//
// Una medida por cantidad o por pasos no se mueve con un porcentaje: la vista la calcula de otra
// manera y la fila entraría sin efecto. Esconderla dejaría al jefe buscando una tarea que él sabe
// que existe; mostrarla tocable produciría un éxito informado con el dato quieto, que es peor. Va a
// la vista, apagada, con la unidad real escrita al lado.
//
// ═══ EL PIE APARECE CUANDO HAY ALGO ELEGIDO ═══
//
// Sin nada marcado, el pie dice qué hacer en vez de mostrar un botón que no puede hacer nada. Es la
// misma idea del panel que no se dibuja cuando no tiene nada que decir.

type Estado = { ok: boolean; mensaje: string } | null

export function FormularioMasivo({
  actividades, frentes, fecha, obraNombre, accion,
}: {
  actividades: ActividadDelJefe[]
  /** `actividad_id` → nombre del frente, sacado del ÁRBOL. Ver el porqué en `frentes.ts`. */
  frentes: Record<string, string>
  fecha: string
  obraNombre: string
  accion: (estado: Estado, form: FormData) => Promise<Estado>
}) {
  const filas = renglones(actividades)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [objetivo, setObjetivo] = useState<number>(100)
  const [criterio, setCriterio] = useState('')
  const [estado, enviar, enviando] = useActionState(accion, null)

  const aplicables = filas.filter((f) => f.aplicable)
  const seleccion = filas.filter((f) => elegidas.has(f.actividad_id))
  const aviso = avisoDePrecision(seleccion)
  const exigeCriterio = seleccion.some((f) => f.metodo === 'manual')
  const faltaCriterio = exigeCriterio && criterio.trim() === ''

  const grupos = agrupar(actividades, filas, frentes)

  return (
    <form action={enviar}>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="objetivo" value={objetivo} />
      <input type="hidden" name="tareas" value={[...elegidas].join(',')} />

      <div className="flex items-start gap-3 px-4 pb-2.5 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-semibold leading-tight text-ink">Avance del día</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{obraNombre} · tocá las que avanzaron</p>
        </div>
        {aplicables.length > 0 && (
          <button
            type="button"
            data-testid="todas-ninguna"
            onClick={() => setElegidas(elegidas.size < aplicables.length
              ? new Set(aplicables.map((f) => f.actividad_id))
              : new Set())}
            className="flex h-[44px] shrink-0 items-center text-[13.5px] font-medium text-ink"
          >
            {elegidas.size < aplicables.length ? 'Todas' : 'Ninguna'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3.5 px-4 pb-6">
        {estado?.ok && <Confirmacion testid="resultado-masivo">{estado.mensaje}</Confirmacion>}
        {estado && !estado.ok && (
          <Aviso tono="neg" titulo="No se pudo aplicar" testid="resultado-masivo">{estado.mensaje}</Aviso>
        )}

        {filas.length === 0 ? (
          <Panel testid="masivo-vacio">
            <Nada>
              Esta obra no tiene tareas que se puedan medir. Los frentes agrupan, no se miden: el
              avance se carga en las tareas que cuelgan de ellos.
            </Nada>
          </Panel>
        ) : (
          grupos.map((g) => (
            <div key={g.nombre}>
              <Rotulo>{g.nombre.toUpperCase()}</Rotulo>
              <Panel>
                {g.filas.map((f) => {
                  const marcada = elegidas.has(f.actividad_id)
                  return (
                    <button
                      key={f.actividad_id}
                      type="button"
                      disabled={!f.aplicable}
                      data-testid={f.aplicable ? 'tarea-masiva' : 'tarea-no-aplicable'}
                      aria-pressed={marcada}
                      onClick={() => setElegidas(alternar(elegidas, f.actividad_id))}
                      className={`flex min-h-[64px] w-full items-center gap-3.5 border-t border-surface-sunken px-4 py-3.5 text-left first:border-t-0 disabled:cursor-not-allowed ${
                        marcada ? 'bg-marca-soft' : ''
                      }`}
                    >
                      <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[14px] font-semibold ${
                        !f.aplicable ? 'border-line bg-surface-sunken text-faint'
                          : marcada ? 'border-marca bg-marca text-ink' : 'border-line-strong bg-surface'
                      }`}>
                        {marcada ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] leading-tight ${
                          f.aplicable ? 'text-ink' : 'text-muted'} ${marcada ? 'font-semibold' : ''}`}>
                          {f.nombre}
                        </span>
                        {/* El motivo va APAGADO, no en ámbar: «ya está al 100 %» es trabajo hecho,
                            no un problema, y en esta obra son 60 de 89 filas. Un color de alerta que
                            cubre dos tercios de la lista deja de ser una alerta. */}
                        <span className={`mt-0.5 block text-[12.5px] ${f.aplicable ? 'text-muted' : 'text-faint'}`}>
                          {f.motivo ?? `se mide por ${f.metodo}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[17px] font-semibold tabular-nums text-ink">
                        {f.avance_pct == null ? '—' : `${f.avance_pct} %`}
                      </span>
                    </button>
                  )
                })}
              </Panel>
            </div>
          ))
        )}
      </div>

      <PieDeAccion testid="pie-masivo">
        {elegidas.size === 0 ? (
          <p className="py-3 text-center text-[14px] text-muted" data-testid="sin-eleccion">
            {aplicables.length === 0
              ? 'Ninguna tarea de esta obra se puede cargar por porcentaje.'
              : 'Elegí las tareas que avanzaron'}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[14px] font-semibold text-ink">
                {elegidas.size} {elegidas.size === 1 ? 'tarea' : 'tareas'}
              </span>
              <span className="text-[12.5px] text-muted">poner el avance en</span>
            </div>
            <div className="mb-3 flex gap-2">
              {VALORES_MASIVOS.map((v) => (
                <button
                  key={v}
                  type="button"
                  data-testid={`valor-${v}`}
                  aria-pressed={objetivo === v}
                  onClick={() => setObjetivo(v)}
                  className={`h-[46px] flex-1 rounded-[11px] border-[1.5px] font-mono text-[15px] font-semibold tabular-nums text-ink ${
                    objetivo === v ? 'border-marca bg-marca-soft' : 'border-line-strong bg-surface'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
            {exigeCriterio && (
              <textarea
                name="criterio"
                value={criterio}
                onChange={(e) => setCriterio(e.target.value)}
                rows={2}
                data-testid="criterio-masivo"
                placeholder="Con qué criterio (lo exige el método manual)"
                className="mb-3 w-full rounded-[12px] bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none"
              />
            )}
            {(aviso || faltaCriterio) && (
              <p className="mb-3 flex gap-2.5 rounded-[10px] bg-warn-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-warn" data-testid="aviso-masivo">
                <span aria-hidden>△</span>
                <span>{faltaCriterio ? AVISO_CRITERIO : aviso}</span>
              </p>
            )}
            <AccionPrimaria type="submit" disabled={enviando || faltaCriterio} testid="aplicar-masivo">
              {enviando ? 'Aplicando…' : `Aplicar a ${elegidas.size} ${elegidas.size === 1 ? 'tarea' : 'tareas'}`}
            </AccionPrimaria>
            <button
              type="button"
              onClick={() => setElegidas(new Set())}
              className="mt-2 h-[44px] w-full text-[14px] text-muted"
            >
              Cancelar
            </button>
          </>
        )}
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

/** Los renglones agrupados por su frente, conservando el orden constructivo en que llegaron. */
function agrupar(
  actividades: ActividadDelJefe[], filas: Renglon[], frentes: Record<string, string>,
): { nombre: string; filas: Renglon[] }[] {
  const rubroDe = new Map(actividades.map(
    (a) => [a.actividad_id, frentes[a.actividad_id] ?? a.rubro?.trim() ?? 'Sin frente']))
  const salida: { nombre: string; filas: Renglon[] }[] = []
  const indice = new Map<string, { nombre: string; filas: Renglon[] }>()
  for (const f of filas) {
    const nombre = rubroDe.get(f.actividad_id) ?? 'Sin frente'
    let g = indice.get(nombre)
    if (!g) {
      g = { nombre, filas: [] }
      indice.set(nombre, g)
      salida.push(g)
    }
    g.filas.push(f)
  }
  return salida
}
