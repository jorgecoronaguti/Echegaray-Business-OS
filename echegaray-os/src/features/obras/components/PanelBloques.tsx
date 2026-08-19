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
import { Dato, n2, Plegable, Rotulo } from './PanelPrimitivas'
import { fecha } from './formato'

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN CONTRA REAL — el bloque central del panel
// ═══════════════════════════════════════════════════════════════════════════════
//
// Un avance calculado desde 95 de 180 m² y un 53% que alguien tipeó no valen lo mismo, y la pantalla
// tiene que poder distinguirlos. Por eso el método es un CAMPO —no una deducción de «¿tiene unidad
// cargada?»— y `origen_avance` viaja al lado del número.

export function BloqueMedicion({ a, definir }: { a: Actividad; definir?: AccionFormulario }) {
  return (
    <div data-testid="bloque-medicion" className="space-y-2">
      {/* PLAN Y REAL ENFRENTADOS. Es la pregunta del panel —¿cómo viene contra lo previsto?— y por
          eso se lee sin abrir nada. Dos listas una debajo de la otra obligan a recordar el número
          de arriba mientras se lee el de abajo. */}
      <div className="grid grid-cols-2 gap-2">
        <section className="rounded-md border border-line bg-surface px-2.5 py-2">
          <Rotulo>Plan</Rotulo>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">
            <Dato k="Unidad" v={a.unidad} />
            <Dato k="Objetivo" v={n2(a.cantidad_objetivo)} />
            <Dato k="Inicio" v={a.inicio_plan ? fecha(a.inicio_plan) : null} />
            <Dato k="Fin" v={a.fin_plan ? fecha(a.fin_plan) : null} />
            <Dato k="HH plan" v={n2(a.hh_plan)} />
          </dl>
        </section>
        <section className="rounded-md border border-line bg-surface px-2.5 py-2">
          <Rotulo>Real</Rotulo>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">
            <Dato
              k="Ejecutado"
              v={a.metodo_avance === 'cantidad' ? n2(a.cantidad_ejecutada ?? 0) : `${a.n_partes} parte(s)`}
            />
            <Dato k="Avance" v={a.avance_pct == null ? null : `${n2(a.avance_pct)}%`} />
            <Dato k="Inicio" v={a.inicio_real ? fecha(a.inicio_real) : null} />
            <Dato k="Último parte" v={a.ultimo_parte ? fecha(a.ultimo_parte) : null} />
            <Dato k="HH reales" v={n2(a.hh_real)} />
            {/* LA PRODUCTIVIDAD EXISTE SÓLO CON LAS DOS PUNTAS. Con una sola sería una división por
                un dato que falta, no un indicador bajo — así es como una obra sana parece
                improductiva. */}
            {a.productividad != null && <Dato k="Prod." v={`${n2(a.productividad)} ${a.unidad}/HH`} />}
          </dl>
        </section>
      </div>

      {/* EL CONSUMO DE HH CONTRA EL AVANCE FÍSICO. Las dos mitades o ninguna: decir «70% del plan»
          sin poder decir cuánto se avanzó es la mitad de una comparación, y la mitad engaña. */}
      {a.consumo_hh_pct != null && a.avance_pct != null && (
        <p className="text-[11px] text-muted" data-testid="avance-vs-hh">
          Avance físico <span className="tabular-nums text-ink">{n2(a.avance_pct)}%</span> · HH
          consumidas <span className="tabular-nums text-ink">{n2(a.consumo_hh_pct)}%</span> del plan
        </p>
      )}
      {a.hh_real != null && a.hh_plan == null && (
        <p className="text-[11px] text-warn">Hay horas imputadas pero falta la HH plan: el desvío no se puede medir.</p>
      )}

      {/* DE DÓNDE SALIÓ EL AVANCE. Quien decide tiene que poder distinguir un número calculado de
          uno tipeado sin ir a buscarlo. */}
      {a.origen_avance && (
        <p className="text-[11px] text-faint" data-testid="origen-avance">
          Avance {a.origen_avance === 'cantidad'
            ? 'calculado desde la producción cargada'
            : a.origen_avance === 'partes' ? 'sumado de los partes diarios' : 'declarado a mano'}.
        </p>
      )}

      {definir && (
        <Plegable titulo="Cómo se mide esta actividad">
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
      )}
    </div>
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

export function BloqueRecursos({ a, personas, reales, equipos, obraId }: {
  a: Actividad
  /** El plantel, para poder poner nombre a un id. */
  personas: Persona[]
  reales: PersonaEnActividad[]
  equipos: EquipoEnActividad[]
  /** La obra, para llevar a la solapa donde el recurso se asigna de verdad. */
  obraId?: string
}) {
  const nombreDe = (id: string) => personas.find((p) => p.id === id)?.nombre_completo ?? id
  const responsable = a.responsable_id ? nombreDe(a.responsable_id) : null
  const prevista = a.cuadrilla_prevista ?? a.cuadrilla
  const hhTotal = reales.reduce((s, r) => s + r.horas, 0)

  return (
    <div className="grid grid-cols-2 gap-2" data-testid="bloque-recursos">
      <section className="rounded-md border border-line bg-surface px-2.5 py-2">
        <Rotulo
          cuenta={reales.length}
          {...(obraId ? { verMas: `/obras/${obraId}?vista=personal`, verMasTitulo: 'Ver el personal de la obra' } : {})}
        >Personal</Rotulo>
        <p className="text-[11px] text-faint">
          Previsto: <span className="text-muted">{prevista ?? 'sin cuadrilla asignada'}</span>
        </p>
        <p className="text-[11px] text-faint">
          Responsable: <span className="text-muted">{responsable ?? 'sin asignar'}</span>
        </p>
        {reales.length === 0 ? (
          <p className="mt-1 text-[12px] text-faint">Nadie imputó horas todavía.</p>
        ) : (
          <ul className="mt-1 space-y-0.5" data-testid="personal-real">
            {reales.slice(0, 6).map((r) => (
              <li key={r.persona_id} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-muted">{nombreDe(r.persona_id)}</span>
                <span className="shrink-0 tabular-nums text-ink">{n2(r.horas)} h</span>
              </li>
            ))}
            {reales.length > 6 && (
              <li className="text-[11px] text-faint">y {reales.length - 6} más · {n2(hhTotal)} h en total</li>
            )}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-line bg-surface px-2.5 py-2">
        <Rotulo
          cuenta={equipos.length}
          {...(obraId ? { verMas: `/obras/${obraId}?vista=operacion&sub=herramientas`, verMasTitulo: 'Ver los equipos de la obra' } : {})}
        >Equipos</Rotulo>
        {equipos.length === 0 ? (
          <p className="text-[12px] text-faint">Ninguno cargado. Se anotan al registrar la ejecución.</p>
        ) : (
          <ul className="space-y-0.5" data-testid="equipos-actividad">
            {equipos.slice(0, 6).map((e) => (
              <li key={e.equipo} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-muted">{e.equipo}</span>
                {/* HORAS SIN ANOTAR NO SON CERO: se dice en cuántas jornadas apareció, que es lo
                    único que se sabe. */}
                <span className="shrink-0 tabular-nums text-ink">
                  {e.horas == null ? `${e.jornadas} jorn.` : `${n2(e.horas)} h`}
                </span>
              </li>
            ))}
            {equipos.length > 6 && <li className="text-[11px] text-faint">y {equipos.length - 6} más</li>}
          </ul>
        )}
      </section>
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
      <section data-testid="ejecucion-reciente">
        <Rotulo>Ejecución reciente</Rotulo>
        <p className="text-[12px] text-faint">Sin partes cargados.</p>
      </section>
    )
  }
  return (
    <section data-testid="ejecucion-reciente">
      <Rotulo cuenta={a.n_partes}>Ejecución reciente</Rotulo>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <table className="w-full text-left text-[12px]">
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
      {partes.length > 5 && (
        <p className="mt-1 text-[11px] text-faint">
          {verTodo
            ? <a href={verTodo} className="text-muted underline underline-offset-2" data-testid="ver-historial">
                Ver todo el historial ({partes.length}) →
              </a>
            : `y ${partes.length - 5} parte(s) más, en la solapa Ejecución.`}
        </p>
      )}
    </section>
  )
}
