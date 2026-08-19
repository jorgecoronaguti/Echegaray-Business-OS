'use client'

// EJECUCIÓN — LA PANTALLA DE CAMPO. Lo que pasó hoy en la obra, y cargarlo en segundos.
//
// ═══ POR QUÉ NO ES UN «DAILY LOG» ═══
//
// Un parte diario burocrático no se llena: se llena dos semanas y después nadie lo abre. Acá se pide
// SÓLO lo necesario para que el número sirva —qué actividad, cuánto se hizo— y todo lo demás
// (personas, horas, comentario) es opcional y está a la vista sin tener que expandir nada.
//
// ═══ UNA CARGA, MUCHOS EFECTOS ═══
//
// El mismo envío escribe la producción en `obra_ejecucion` y las horas en `registros_hh`. Por eso
// abajo del formulario se dice, en una línea, qué se va a mover: sin eso, cargar horas acá parece
// una tercera forma de imputar HH en vez de la misma de siempre.
//
// LA TABLA ES DE ACTIVIDADES, NO DE PARTES. La pregunta de la jornada es «¿cómo viene cada frente?»,
// no «¿qué cargué?». El detalle de partes vive abajo, plegado, para poder auditar y corregir.

import { useMemo, useState } from 'react'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../types'
import { deHoy } from '../services/ejecucionService'
import { C, Fila, Tabla, Vacio } from './tablas'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** El avance en una barra de 3px. No es un gráfico: es la misma cifra, legible de un vistazo. */
function Barra({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-faint">sin cargar</span>
  return (
    <span className="flex items-center gap-2">
      <span className="h-[3px] w-16 shrink-0 rounded-full bg-line">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tabular-nums text-[12px] text-muted">{num(pct)}%</span>
    </span>
  )
}

export function TabEjecucion({
  obraId, actividades, partes, personas, cuadrillas, integrantes, hoy, registrar, borrarParte,
}: {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string }[]
  /** Quiénes integran cada cuadrilla. Elegir una recorta la lista de casilleros a los suyos. */
  integrantes: Record<string, string[]>
  hoy: string
  registrar: AccionFormulario
  borrarParte: (parteId: string) => Promise<ResultadoAccion>
}) {
  const [abierto, setAbierto] = useState(false)
  const [dia, setDia] = useState(hoy)
  const [cuadrilla, setCuadrilla] = useState('')

  // Sólo las que se ejecutan: un rubro de resumen no se produce, se completa solo con sus hijas.
  const ejecutables = useMemo(
    () => actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada),
    [actividades])
  const movidoHoy = useMemo(() => deHoy(partes, dia), [partes, dia])
  const porActividad = useMemo(
    () => new Map(ejecutables.map((a) => [a.id, a])), [ejecutables])

  // Las que ya arrancaron primero: es lo que se carga todos los días. Lo que todavía no empezó
  // ocupa el final de la lista en vez de empujar hacia abajo lo que está en curso.
  // Elegir una cuadrilla recorta los casilleros a los suyos. Sin cuadrilla, el plantel entero: no
  // toda obra las tiene armadas, y exigirlas para poder cargar horas sería fricción por nada.
  const delReparto = useMemo(() => {
    const suyos = cuadrilla ? new Set(integrantes[cuadrilla] ?? []) : null
    return suyos ? personas.filter((p) => suyos.has(p.id)) : personas
  }, [personas, cuadrilla, integrantes])

  const orden = useMemo(() => [...ejecutables].sort((a, b) => {
    const vivo = (x: Actividad) => (x.estado_operativo === 'en_curso' ? 0 : x.avance_pct ? 1 : 2)
    return vivo(a) - vivo(b) || a.orden - b.orden
  }), [ejecutables])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wide text-faint" htmlFor="dia-ejecucion">Jornada</label>
          <input
            id="dia-ejecucion" type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            className={`${CTRL} w-[150px]`} data-testid="dia-ejecucion"
          />
        </div>
        <button
          type="button" onClick={() => setAbierto((v) => !v)} data-testid="abrir-registrar"
          className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:opacity-90"
        >{abierto ? 'Cerrar' : '+ Registrar'}</button>
      </div>

      {abierto && (
        <div className="rounded-lg border border-line bg-surface-quiet p-4" data-testid="panel-registrar">
          <FormAccion accion={registrar} testid="form-ejecucion" enviar="Guardar parte" mensajeOk="Parte guardado.">
            <input type="hidden" name="fecha" value={dia} />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Campo label="Actividad">
                <select name="actividad_id" className={CTRL} defaultValue="" data-testid="parte-actividad" required>
                  <option value="" disabled>Elegí la actividad</option>
                  {orden.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.rubro ? `${a.rubro} · ` : ''}{a.nombre}
                      {a.metodo_avance === 'cantidad' ? ` (${a.unidad})` : ''}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Cantidad ejecutada" ayuda="En las actividades que se miden por cantidad.">
                <input name="cantidad" type="number" step="any" min="0" className={CTRL} data-testid="parte-cantidad" />
              </Campo>
              <Campo label="Avance del día (%)" ayuda="En las que no son cuantificables.">
                <input name="avance_pct" type="number" step="any" min="0" max="100" className={CTRL} data-testid="parte-avance" />
              </Campo>
              <Campo label="Comentario">
                <input name="comentario" maxLength={500} className={CTRL} data-testid="parte-comentario" />
              </Campo>
            </div>

            {/* ═══ LAS HORAS SON LAS MISMAS DE PERSONAL ═══
                No es una tercera forma de imputar HH: el reparto viaja con el mismo contrato
                (`horas_<uuid>`) que la carga masiva de la pestaña Personal, y lo escribe la misma
                acción. La misma hora se carga UNA vez. */}
            <details className="mt-3 rounded-md border border-line bg-surface px-3 py-2" data-testid="parte-personal">
              <summary className="cursor-pointer text-[12px] text-muted">Personal y horas de la jornada</summary>
              <div className="mt-2">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <select
                    className={`${CTRL} w-auto`} value={cuadrilla} data-testid="parte-cuadrilla"
                    onChange={(e) => setCuadrilla(e.target.value)}
                  >
                    <option value="">Todo el plantel</option>
                    {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <span className="text-[11px] text-faint">
                    Poné las horas de quien trabajó. En blanco no se imputa.
                  </span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {delReparto.map((p) => (
                    <label key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-muted">{p.nombre_completo}</span>
                      <input
                        name={`horas_${p.id}`} type="number" step="0.5" min="0" max="24"
                        className={`${CTRL} w-[74px] shrink-0 text-right`} data-testid={`horas-${p.id}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </details>

            <p className="mt-2 text-[11px] text-faint">
              Un parte mueve la producción y el avance de la actividad; las horas van a Personal, a la
              obra y a cada persona. Se cargan una sola vez.
            </p>
          </FormAccion>
        </div>
      )}

      {orden.length === 0
        ? <Vacio>Esta obra todavía no tiene actividades cargadas. Se crean en Planificación.</Vacio>
        : (
            <Tabla
              testid="tabla-ejecucion"
              cols={[{ k: 'Actividad' }, { k: 'Jornada', num: true }, { k: 'Acumulado', num: true }, { k: 'Avance' }, { k: 'HH', num: true }]}
            >
              {orden.map((a) => {
                const hoyDe = movidoHoy.get(a.id)
                const porCantidad = a.metodo_avance === 'cantidad'
                return (
                  <Fila key={a.id}>
                    <C>
                      <span className="text-ink">{a.nombre}</span>
                      {a.rubro && <span className="block text-[11px] text-faint">{a.rubro}</span>}
                    </C>
                    <C num>
                      {hoyDe
                        ? <span className="text-ink">+{porCantidad ? `${num(hoyDe.cantidad)} ${a.unidad ?? ''}` : `${num(hoyDe.pct)}%`}</span>
                        : <span className="text-faint">—</span>}
                    </C>
                    <C num>
                      {porCantidad
                        ? <span>{num(a.cantidad_ejecutada ?? 0)}<span className="text-faint">/{num(a.cantidad_objetivo)} {a.unidad}</span></span>
                        : <span className="text-faint">{a.n_partes > 0 ? `${a.n_partes} parte(s)` : '—'}</span>}
                    </C>
                    <C><Barra pct={a.avance_pct} /></C>
                    <C num>{a.hh_real == null ? <span className="text-faint">—</span> : num(a.hh_real)}</C>
                  </Fila>
                )
              })}
            </Tabla>
          )}

      <details className="rounded-lg border border-line px-3 py-2" data-testid="detalle-partes">
        <summary className="cursor-pointer text-[12px] text-muted">
          Partes cargados ({partes.length}) — el detalle que respalda cada acumulado
        </summary>
        <div className="mt-2">
          {partes.length === 0
            ? <Vacio>Todavía no hay partes.</Vacio>
            : (
                <Tabla testid="tabla-partes" cols={[{ k: 'Fecha' }, { k: 'Actividad' }, { k: 'Cargado', num: true }, { k: 'Origen' }, { k: '' }]}>
                  {partes.slice(0, 60).map((p) => {
                    const a = porActividad.get(p.actividad_id)
                    return (
                      <Fila key={p.id}>
                        <C>{fmtFecha(p.fecha)}</C>
                        <C>{a?.nombre ?? <span className="text-faint">actividad archivada</span>}</C>
                        <C num>{p.cantidad != null ? `${num(p.cantidad)} ${a?.unidad ?? ''}` : `${num(p.avance_pct)}%`}</C>
                        <C>
                          <span className="text-[11px] text-faint">
                            {p.fuente === 'web' ? 'cargado en la web' : 'Avances de Obra'}
                          </span>
                        </C>
                        <C>
                          <BotonAccion accion={borrarParte} args={[p.id]} testid="borrar-parte" tono="peligro">
                            Borrar
                          </BotonAccion>
                        </C>
                      </Fila>
                    )
                  })}
                </Tabla>
              )}
          {partes.length > 60 && (
            <p className="mt-1.5 text-[11px] text-faint">Se muestran los 60 más recientes de {partes.length}.</p>
          )}
        </div>
      </details>
    </div>
  )
}
