'use client'

// LOS BLOQUES DE LECTURA DEL PANEL — lo que contesta «¿cómo viene?» sin abrir nada.
//
// Plan contra Real, quién trabajó y con qué, y qué pasó estos días. Los tres se ven de entrada: son
// la razón por la que alguien toca una barra del Gantt. Lo que se abre para HACER algo —tareas,
// papeles, notas, impedimentos, precedencias— vive en `PanelGestion`.

import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../types'
import { METODO_LABEL, UNIDADES } from '../types'
import type { EquipoEnActividad, PersonaEnActividad } from '../services/recursosService'
import { n2, Plegable } from './PanelPrimitivas'
import { fecha } from './formato'

// ═══════════════════════════════════════════════════════════════════════════════
// CÓMO SE MIDE — y las lecturas que acompañan a Plan | Real
// ═══════════════════════════════════════════════════════════════════════════════
//
// El cuadro Plan|Real lo dibuja el panel con `PlanVsReal` del DS. Acá quedan las dos cosas que ese
// cuadro no puede decir: DE DÓNDE salió el avance —un 53% calculado desde 95 de 180 m² y un 53% que
// alguien tipeó no valen lo mismo— y el formulario que define la medición.

/** Las lecturas al pie del cuadro: consumo contra avance, y el origen del número. */
export function NotasDeMedicion({ a }: { a: Actividad }) {
  return (
    <>
      {/* LAS DOS MITADES O NINGUNA: decir «70% del plan» sin poder decir cuánto se avanzó es la
          mitad de una comparación, y la mitad engaña. */}
      {a.consumo_hh_pct != null && a.avance_pct != null && (
        <p className="text-[11.5px] text-muted" data-testid="avance-vs-hh">
          Avance físico <span className="font-mono tabular-nums text-ink">{n2(a.avance_pct)}%</span> · HH
          consumidas <span className="font-mono tabular-nums text-ink">{n2(a.consumo_hh_pct)}%</span> del plan
        </p>
      )}
      {a.hh_real != null && a.hh_plan == null && (
        <p className="text-[11.5px] text-warn">Hay horas imputadas pero falta la HH plan: el desvío no se puede medir.</p>
      )}
      {a.origen_avance && (
        <p className="text-[11.5px] text-faint" data-testid="origen-avance">
          Avance {a.origen_avance === 'cantidad'
            ? 'calculado desde la producción cargada'
            : a.origen_avance === 'partes' ? 'sumado de los partes diarios' : 'declarado a mano'}.
        </p>
      )}
    </>
  )
}

export function BloqueMedicion({ a, definir }: { a: Actividad; definir?: AccionFormulario }) {
  if (!definir) return null
  return (
    <Plegable titulo="Cómo se mide esta actividad" testid="bloque-medicion">
      <FormAccion accion={definir} testid="form-medicion" enviar="Guardar" mensajeOk="Guardado.">
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Unidad">
            <input name="unidad" defaultValue={a.unidad ?? ''} list="unidades-obra" maxLength={12} className={CTRL} />
          </Campo>
          <Campo label="Cantidad objetivo">
            <input name="cantidad_objetivo" type="number" step="any" min="0" defaultValue={a.cantidad_objetivo ?? ''} className={CTRL} />
          </Campo>
          <Campo label="Cómo se mide el avance" ancho="col-span-2">
            <select name="metodo_avance" defaultValue={a.metodo_avance} className={CTRL} data-testid="metodo-avance">
              {(Object.keys(METODO_LABEL) as (keyof typeof METODO_LABEL)[]).map((m) => (
                <option key={m} value={m}>{METODO_LABEL[m]}</option>
              ))}
            </select>
          </Campo>
        </div>
        <datalist id="unidades-obra">
          {UNIDADES.map((u) => <option key={u} value={u} />)}
        </datalist>
      </FormAccion>
    </Plegable>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECURSOS — quién y con qué
// ═══════════════════════════════════════════════════════════════════════════════
//
// PLAN ≠ REAL, y acá se ve mejor que en ninguna otra parte. El plan es la cuadrilla prevista y el
// responsable, que alguien escribió. El real son las personas que imputaron horas y los equipos que
// aparecieron en los partes: nadie los asigna, se deducen de los hechos.
//
// NO HAY UNA SEGUNDA ASIGNACIÓN. Si hubiera una lista de «personal de esta actividad» aparte de las
// horas, habría que mantenerla al día a mano y el día que alguien no la actualice diría que trabajó
// gente que no trabajó.

/** Quién trabajó: el plan (cuadrilla y responsable) y el real (los que imputaron horas). */
export function ListaPersonal({ a, personas, reales, obraId }: {
  a: Actividad
  /** El plantel, para poder poner nombre a un id. */
  personas: Persona[]
  reales: PersonaEnActividad[]
  /** La obra, para llevar a la solapa donde el personal se asigna de verdad. */
  obraId?: string
}) {
  const nombreDe = (id: string) => personas.find((p) => p.id === id)?.nombre_completo ?? id
  const responsable = a.responsable_id ? nombreDe(a.responsable_id) : null
  const prevista = a.cuadrilla_prevista ?? a.cuadrilla
  const hhTotal = reales.reduce((s, r) => s + r.horas, 0)
  return (
    <div data-testid="bloque-personal">
      <p className="text-[11.5px] text-faint">
        Previsto: <span className="text-muted">{prevista ?? 'sin cuadrilla asignada'}</span>
      </p>
      <p className="text-[11.5px] text-faint">
        Responsable: <span className="text-muted">{responsable ?? 'sin asignar'}</span>
      </p>
      {reales.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-faint">Nadie imputó horas todavía.</p>
      ) : (
        <ul className="mt-1.5 space-y-1" data-testid="personal-real">
          {reales.slice(0, 8).map((r) => (
            <li key={r.persona_id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-soft">{nombreDe(r.persona_id)}</span>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted">{n2(r.horas)} HH</span>
            </li>
          ))}
          {reales.length > 8 && (
            <li className="text-[11.5px] text-faint">y {reales.length - 8} más · {n2(hhTotal)} HH en total</li>
          )}
        </ul>
      )}
      {/* EL DETALLE NO SE REIMPLEMENTA ACÁ: lleva a la solapa donde ese dato se edita. Un segundo
          lugar para asignar personal sería un segundo lugar donde se escriben horas. */}
      {obraId && (
        <a href={`/obras/${obraId}?vista=personal`} className="mt-2 inline-block text-[12px] text-muted hover:text-ink" data-testid="ver-mas-bloque">
          Ver el personal de la obra →
        </a>
      )}
    </div>
  )
}

/** Con qué se hizo. No se asignan: se deducen de los partes, que es donde alguien los anotó. */
export function ListaEquipos({ equipos, obraId }: { equipos: EquipoEnActividad[]; obraId?: string }) {
  return (
    <div data-testid="bloque-equipos">
      {equipos.length === 0 ? (
        <p className="text-[12.5px] text-faint">Ninguno cargado. Se anotan al registrar la ejecución.</p>
      ) : (
        <ul className="space-y-1" data-testid="equipos-actividad">
          {equipos.slice(0, 8).map((e) => (
            <li key={e.equipo} className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-soft">{e.equipo}</span>
              {/* HORAS SIN ANOTAR NO SON CERO: se dice en cuántas jornadas apareció, que es lo
                  único que se sabe. */}
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted">
                {e.horas == null ? `${e.jornadas} jorn.` : `${n2(e.horas)} h`}
              </span>
            </li>
          ))}
          {equipos.length > 8 && <li className="text-[11.5px] text-faint">y {equipos.length - 8} más</li>}
        </ul>
      )}
      {obraId && (
        <a href={`/obras/${obraId}?vista=operacion&sub=herramientas`} className="mt-2 inline-block text-[12px] text-muted hover:text-ink" data-testid="ver-mas-bloque">
          Ver los equipos de la obra →
        </a>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EJECUCIÓN RECIENTE — el historial de la actividad, sin salir del panel
// ═══════════════════════════════════════════════════════════════════════════════

export function BloqueEjecucion({ a, partes, personasPorFecha, verTodo }: {
  a: Actividad
  partes: ParteEjecucion[]
  /** A dónde lleva «ver todo el historial». Sin él se dice cuántos quedan, sin enlace. */
  verTodo?: string
  /** Cuántas HH y cuántas personas se imputaron a ESTA actividad cada día. Sale de `registros_hh`,
   *  no del parte: el parte no guarda horas, y por eso las dos columnas pueden faltar. */
  personasPorFecha: Map<string, { horas: number; personas: number }>
}) {
  if (partes.length === 0) {
    return (
      <p data-testid="ejecucion-reciente" className="text-[12.5px] text-faint">Sin partes cargados.</p>
    )
  }
  return (
    <section data-testid="ejecucion-reciente">
      {/* SIN CAJA: la tabla se delimita con su encabezado y sus divisores de fila
          (`COMPONENTS.md` §Table). Un borde alrededor, dentro de un panel de 380px, es una línea
          más para procesar y ni un dato más. */}
      <div>
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
              <th className="px-2 py-1 font-medium">Fecha</th>
              <th className="px-2 py-1 text-right font-medium">Cant.</th>
              <th className="px-2 py-1 text-right font-medium">HH</th>
              <th className="px-2 py-1 text-right font-medium">Pers.</th>
              <th className="px-2 py-1 font-medium">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {partes.slice(0, 5).map((p) => {
              const hh = personasPorFecha.get(p.fecha)
              return (
                <tr key={p.id} className="border-b border-line/60 last:border-0" data-testid="fila-parte">
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums text-faint">{fecha(p.fecha)}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink">
                    {p.cantidad != null ? `+${n2(p.cantidad)} ${a.unidad ?? ''}` : `+${n2(p.avance_pct)}%`}
                  </td>
                  {/* SIN HORAS IMPUTADAS ESE DÍA SE DICE «—», NO «0»: nadie trabajó cero horas. */}
                  <td className="px-2 py-1 text-right tabular-nums text-muted">{hh ? n2(hh.horas) : '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted">{hh ? hh.personas : '—'}</td>
                  <td className="max-w-0 truncate px-2 py-1 text-muted" title={p.comentario ?? ''}>{p.comentario ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {verTodo ? (
        <p className="mt-2 text-[12px]">
          <a href={verTodo} className="text-muted hover:text-ink" data-testid="ver-historial">
            Ver historial ({partes.length}) →
          </a>
        </p>
      ) : partes.length > 5 ? (
        <p className="mt-1 text-[11.5px] text-faint">y {partes.length - 5} parte(s) más, en la solapa Ejecución.</p>
      ) : null}
    </section>
  )
}
