'use client'

// EL PANEL CONTEXTUAL DEL CRONOGRAMA — se selecciona una barra y aparece acá lo que se puede hacer
// con ella. No es una pantalla aparte: el cronograma tiene que seguir a la vista mientras se edita,
// porque lo que se está decidiendo es la fecha de esta actividad CONTRA las de al lado.
//
// ═══ QUÉ CONTESTA, EN ESTE ORDEN ═══
//
//   1. ¿Qué la está frenando?              impedimentos, con responsable y compromiso
//   2. ¿Cómo viene contra lo previsto?     Plan | Real enfrentados
//   3. ¿Quién y con qué?                   personal real y equipos
//   4. ¿Qué pasó estos días?               ejecución reciente
//   … y plegado, lo que se abre cuando se va a HACER algo: tareas, papeles, notas, edición y
//   precedencias. Eso es progressive disclosure: la misma información en dos tiempos.
//
// ═══ EN EL TELÉFONO ES UNA HOJA QUE SUBE, NO UNA COLUMNA ═══
//
// Un panel de 340px al costado, en una pantalla de 390px, deja 50px para el cronograma: no es una
// versión angosta de la pantalla, es ninguna de las dos cosas. Debajo del `lg` el panel se despega
// del flujo y sube desde abajo ocupando el ancho completo y hasta el 85% del alto, con el
// cronograma detrás. Es el mismo componente y el mismo marcado: cambia dónde se apoya.
//
// En escritorio ocupa un tercio del ancho —no 340px fijos—, que es lo que el objetivo pide y lo que
// hace que la tabla de Plan|Real entre sin partirse en un monitor grande.
//
// ═══ LA LÍNEA BASE NO SE TOCA DESDE ACÁ, Y ES LA REGLA DURA DEL MÓDULO ═══
//
// Guardar el formulario de edición mueve `inicio_plan`/`fin_plan` y NADA MÁS. `inicio_base`/`fin_base`
// sólo los escribe `sellarBaseline`, una vez. Si la edición moviera también la base, replanificar
// dejaría el desvío en cero para siempre y el tablero diría que la obra siempre va en fecha.

import { useState } from 'react'
import { BotonAccion, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type {
  Actividad, Dependencia, DocumentoObra, ParteEjecucion, Persona, Restriccion,
} from '../types'
import type { ActividadHH } from '../services/personalService'
import type { EquipoEnActividad, NotaActividad, PersonaEnActividad } from '../services/recursosService'
import { EstadoChip } from './EstadoChip'
import { BloqueEjecucion, BloqueMedicion, BloqueRecursos } from './PanelBloques'
import {
  BloqueDocumentos, BloqueImpedimentosActividad, BloqueNotas, BloqueTareas, Dependencias,
  SelectorDeRubro,
} from './PanelGestion'
import { fecha } from './formato'

export type AccionesCronograma = {
  crear: (form: FormData) => Promise<ResultadoAccion>
  editar: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  avance: (actividadId: string, pct: number) => Promise<ResultadoAccion>
  archivar: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  hito: (actividadId: string, esHito: boolean) => Promise<ResultadoAccion>
  sellar: () => Promise<ResultadoAccion>
  /** Opcionales a propósito: una pantalla que todavía no las ata sigue compilando y no dibuja el
   *  control. Un botón que no persiste es peor que no tenerlo. */
  agregarDependencia?: (destinoId: string, form: FormData) => Promise<ResultadoAccion>
  quitarDependencia?: (dependenciaId: string) => Promise<ResultadoAccion>
  /** Unidad, cantidad objetivo y método de avance de la actividad. */
  definirMedicion?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  /** Agregar una tarea a la actividad, y marcarla hecha o reabrirla. */
  crearTarea?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  cambiarEstadoTarea?: (tareaId: string, estado: string) => Promise<ResultadoAccion>
  /** Notas de la actividad. */
  agregarNota?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  borrarNota?: (notaId: string) => Promise<ResultadoAccion>
  /** Impedimentos: la MISMA acción que usa Operación, con `actividad_id` en el formulario. */
  crearImpedimento?: AccionFormulario
  liberarImpedimento?: (restriccionId: string) => Promise<ResultadoAccion>
  /** Papeles de la actividad. `vincularDocumento` lleva `actividad_id` en el formulario. */
  vincularDocumento?: AccionFormulario
  soltarDocumento?: (driveFileId: string) => Promise<ResultadoAccion>
  /** Mover la actividad a otro rubro. */
  moverDeRubro?: (actividadId: string, rubro: string) => Promise<ResultadoAccion>
  /** Crear un rubro desde el cronograma. La usa la barra, no el panel. */
  crearRubro?: AccionFormulario
}

/** Todo lo que el panel muestra de UNA actividad. Va en un objeto y no en doce props sueltos porque
 *  el Gantt lo arma de una vez y así no hay doce oportunidades de olvidarse uno. */
export interface DatosDeActividad {
  partes: ParteEjecucion[]
  tareas: Actividad[]
  notas: NotaActividad[]
  documentos: DocumentoObra[]
  personasReales: PersonaEnActividad[]
  equipos: EquipoEnActividad[]
  /** HH y personas imputadas por día a ESTA actividad. Alimenta las dos columnas de la tabla de
   *  ejecución reciente, que el parte no puede llenar porque no guarda horas. */
  hhPorFecha: Map<string, { horas: number; personas: number }>
}

export const DATOS_VACIOS: DatosDeActividad = {
  partes: [], tareas: [], notas: [], documentos: [], personasReales: [], equipos: [],
  hhPorFecha: new Map(),
}

const fmt = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function SelectResponsable({ personas, valor }: { personas: Persona[]; valor: string | null }) {
  return (
    <select name="responsable_id" defaultValue={valor ?? ''} className={CTRL}>
      <option value="">sin responsable asignado</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>{p.nombre_completo}</option>
      ))}
    </select>
  )
}

/** Los campos comunes al alta y a la edición. Uno solo: si se separaran, el alta y la edición
 *  terminarían aceptando cosas distintas y el desvío entre las dos se descubriría tarde. */
function CamposActividad({ a, personas, hh, rubros = [] }: {
  a?: Actividad; personas: Persona[]; hh?: ActividadHH; rubros?: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Actividad" ancho="col-span-2">
        <input name="nombre" defaultValue={fmt(a?.nombre)} required minLength={2} maxLength={200} className={CTRL} />
      </Campo>
      {!a && (
        // EL RUBRO SE ELIGE DE LOS QUE YA EXISTEN, y el campo libre queda para el que no está.
        // Escribiéndolo a mano cada vez, «Mampostería» y «MAMPOSTERIA» terminan siendo dos grupos.
        <Campo label="Rubro" ancho="col-span-2" ayuda="Agrupa la actividad en el cronograma. Se puede cambiar después.">
          <input name="seccion" maxLength={120} list="rubros-obra" className={CTRL} placeholder="opcional" data-testid="alta-rubro" />
          <datalist id="rubros-obra">
            {rubros.map((r) => <option key={r} value={r} />)}
          </datalist>
        </Campo>
      )}
      <Campo label="Inicio previsto"><input type="date" name="inicio_plan" defaultValue={fmt(a?.inicio_plan)} className={CTRL} /></Campo>
      <Campo label="Fin previsto"><input type="date" name="fin_plan" defaultValue={fmt(a?.fin_plan)} className={CTRL} /></Campo>
      <Campo label="Días"><input type="number" name="dias_plan" min={0} step={1} defaultValue={fmt(a?.dias_plan)} className={CTRL} /></Campo>
      <Campo label="Avance %"><input type="number" name="pct" min={0} max={100} step={1} defaultValue={fmt(a?.pct)} className={CTRL} /></Campo>
      <Campo label="HH plan"><input type="number" name="hh_plan" min={0} step="0.5" defaultValue={fmt(a?.hh_plan)} className={CTRL} /></Campo>
      {/* ═══ HH REAL NO ES UN CAMPO ═══
          Hasta el 19/08/2026 acá había un `input` que escribía `obra_actividad.hh_real` a mano, al
          lado de las horas imputadas de verdad en `registros_hh`: dos números para el mismo hecho.
          La columna se borró (0 filas cargadas de 344) y esto muestra lo que publica
          `obra_actividad_hh`, la MISMA vista que lee la solapa Personal. Un solo cálculo. */}
      <Campo label="HH real" ayuda="Suma de las horas imputadas a esta actividad.">
        <p className="mt-1 py-1.5 text-[13px] tabular-nums text-ink" data-testid="actividad-hh-real">
          {hh?.hh_real == null
            ? <span className="text-faint">sin imputar</span>
            : `${Number(hh.hh_real).toLocaleString('es-AR', { maximumFractionDigits: 1 })}`}
          {hh?.desvio_pct != null && (
            <span className="ml-2 text-[11px] text-faint">
              {Number(hh.desvio_pct) > 0 ? '+' : ''}{Number(hh.desvio_pct)}% vs plan
            </span>
          )}
          {/* EL DESVÍO SIN LAS DOS PUNTAS NO ES CERO: es desconocido, y se dice cuál falta. */}
          {hh?.hh_real != null && hh?.hh_plan == null && (
            <span className="ml-2 text-[11px] text-warn">HH plan sin cargar</span>
          )}
        </p>
      </Campo>
      <Campo label="Responsable" ancho="col-span-2"><SelectResponsable personas={personas} valor={a?.responsable_id ?? null} /></Campo>
      <Campo label="Cuadrilla" ancho="col-span-2"><input name="cuadrilla" defaultValue={fmt(a?.cuadrilla)} maxLength={120} className={CTRL} /></Campo>
      <Campo label="Notas" ancho="col-span-2"><input name="comentario" defaultValue={fmt(a?.comentario)} maxLength={400} className={CTRL} /></Campo>
      {!a && (
        <label className="col-span-2 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" name="es_hito" className="h-3.5 w-3.5" /> Es un hito (una fecha, sin duración)
        </label>
      )}
    </div>
  )
}

/**
 * El avance rápido: un toque para los valores de siempre, y un campo para el resto.
 *
 * El campo arranca en el avance que tiene la actividad, y el componente se REMONTA por `key` cuando
 * cambia la actividad o su avance —no se sincroniza con un efecto—. Sin eso, al pasar de una barra a
 * otra el campo se quedaba con el número de la anterior, y el botón de registrar habría escrito el
 * avance de una actividad sobre otra.
 */
function AvanceRapido({ a, avance }: { a: Actividad; avance: AccionesCronograma['avance'] }) {
  const [valor, setValor] = useState<string>(a.pct == null ? '' : String(a.pct))

  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2" data-testid="avance-rapido">
      <p className="text-[10px] uppercase tracking-wide text-faint">Avance</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[0, 25, 50, 75, 100].map((p) => (
          <BotonAccion key={p} accion={() => avance(a.id, p)} testid={`avance-${p}`}>{p}%</BotonAccion>
        ))}
        <input
          type="number" min={0} max={100} step={1} value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="avance-valor"
          className="w-16 rounded-control border border-line px-2 py-1 text-[12px] tabular-nums"
        />
        <BotonAccion accion={() => avance(a.id, Number(valor))} testid="avance-guardar" tono="fuerte">Registrar</BotonAccion>
      </div>
    </div>
  )
}

export function PanelActividad({
  actividad, personas, acciones, alCerrar, actividades = [], dependencias = [], impedimentos = [],
  hh, datos = DATOS_VACIOS, rubros = [], hoy = new Date(),
}: {
  actividad: Actividad
  personas: Persona[]
  acciones: AccionesCronograma
  alCerrar: () => void
  /** El resto del cronograma: es la lista de la que se elige una precedencia. */
  actividades?: Actividad[]
  dependencias?: Dependencia[]
  /** TODOS los de esta actividad, abiertos y liberados: el panel muestra los abiertos y cuenta los
   *  otros. Filtrarlos afuera dejaba al panel sin poder decir «ya se resolvieron tres». */
  impedimentos?: Restriccion[]
  /** HH plan contra real de ESTA actividad, tal como la publica `obra_actividad_hh`. */
  hh?: ActividadHH
  datos?: DatosDeActividad
  /** Los rubros de la obra, para poder mover la actividad de grupo. */
  rubros?: string[]
  hoy?: Date
}) {
  const a = actividad
  const hoyIso = hoy.toISOString().slice(0, 10)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')
  const liberados = impedimentos.filter((r) => r.estado === 'liberada')

  return (
    <>
      {/* El fondo sólo existe en el teléfono, donde la hoja tapa el cronograma: es la manera de
          salir sin buscar la cruz. En escritorio no hay nada que tapar. */}
      <button
        type="button"
        aria-label="Cerrar el panel"
        onClick={alCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid="panel-actividad"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface-quiet p-3 shadow-pop lg:static lg:z-auto lg:max-h-[72vh] lg:w-[33%] lg:min-w-[340px] lg:max-w-[460px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
      >
        {/* El tirador de la hoja. En escritorio no hay hoja que tirar. */}
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-tight text-ink">{a.nombre}</p>
            <p className="mt-0.5 truncate text-[11px] text-faint">
              {[a.rubro ?? a.seccion, a.codigo].filter(Boolean).join(' · ') || 'sin rubro'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EstadoChip estado={a.estado_operativo} />
            <button type="button" onClick={alCerrar} className="text-[12px] text-muted hover:text-ink">cerrar</button>
          </div>
        </div>

        {/* LA LÍNEA BASE SE DICE SIEMPRE: es contra qué se mide el desvío, y «sin sellar» no es lo
            mismo que «en fecha». */}
        <p className="mt-1.5 text-[11px] tabular-nums text-faint">
          Línea base: {a.inicio_base ? `${fecha(a.inicio_base)} → ${fecha(a.fin_base)}` : 'sin sellar'}
        </p>

        {acciones.moverDeRubro && rubros.length > 0 && (
          <div className="mt-2">
            <SelectorDeRubro a={a} rubros={rubros} mover={acciones.moverDeRubro} />
          </div>
        )}

        <div className="mt-3 space-y-2.5">
          <BloqueImpedimentosActividad
            a={a}
            abiertos={abiertos}
            liberados={liberados}
            crear={acciones.crearImpedimento}
            liberar={acciones.liberarImpedimento}
            hoyIso={hoyIso}
          />

          <BloqueMedicion
            a={a}
            definir={acciones.definirMedicion ? acciones.definirMedicion.bind(null, a.id) : undefined}
          />

          {/* EL AVANCE RÁPIDO SÓLO CUANDO EL AVANCE ES DECLARADO. En una actividad que se mide por
              producción, escribir el porcentaje a mano no lo cambiaría —la vista lo calcula— y el
              botón parecería roto. Ahí el avance se mueve cargando un parte en Ejecución. */}
          {a.metodo_avance === 'manual' && (
            <AvanceRapido key={`${a.id}:${a.pct}`} a={a} avance={acciones.avance} />
          )}

          <BloqueRecursos a={a} personas={personas} reales={datos.personasReales} equipos={datos.equipos} />

          <BloqueEjecucion a={a} partes={datos.partes} personasPorFecha={datos.hhPorFecha} />

          {/* Las tareas SÓLO en una actividad: una tarea no tiene tareas. */}
          {!a.actividad_padre_id && (
            <BloqueTareas
              tareas={datos.tareas}
              crear={acciones.crearTarea ? acciones.crearTarea.bind(null, a.id) : undefined}
              alternar={acciones.cambiarEstadoTarea}
            />
          )}

          <Dependencias
            a={a}
            actividades={actividades}
            dependencias={dependencias}
            agregar={acciones.agregarDependencia}
            quitar={acciones.quitarDependencia}
          />

          <BloqueDocumentos
            a={a}
            documentos={datos.documentos}
            vincular={acciones.vincularDocumento}
            soltar={acciones.soltarDocumento}
          />

          <BloqueNotas
            notas={datos.notas}
            agregar={acciones.agregarNota ? acciones.agregarNota.bind(null, a.id) : undefined}
            borrar={acciones.borrarNota}
          />

          <details className="rounded-md border border-line bg-surface px-2.5 py-1.5">
            <summary className="cursor-pointer text-[12px] font-medium text-ink">Editar la actividad</summary>
            <div className="mt-2 border-t border-line pt-2">
              <FormAccion
                accion={(form) => acciones.editar(a.id, form)}
                testid="form-editar-actividad"
                enviar="Guardar cambios"
                mensajeOk="Actividad guardada."
              >
                <CamposActividad a={a} personas={personas} hh={hh} rubros={rubros} />
              </FormAccion>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                {a.tipo !== 'resumen' && (
                  <BotonAccion accion={() => acciones.hito(a.id, a.tipo !== 'hito')} testid="marcar-hito">
                    {a.tipo === 'hito' ? 'Dejar de ser hito' : 'Marcar como hito'}
                  </BotonAccion>
                )}
                <BotonAccion accion={() => acciones.archivar(a.id, true)} testid="archivar-actividad" tono="peligro">
                  Archivar
                </BotonAccion>
                <span className="text-[11px] text-faint">Archivar la saca del cronograma y de los promedios; no la borra.</span>
              </div>
            </div>
          </details>
        </div>
      </aside>
    </>
  )
}

/** El alta. Vive en el mismo archivo que la edición porque comparten los campos. */
export function FormNuevaActividad({
  personas, crear, rubros = [],
}: {
  personas: Persona[]
  crear: AccionesCronograma['crear']
  rubros?: string[]
}) {
  return (
    <FormAccion accion={crear} testid="form-nueva-actividad" enviar="Crear actividad" limpiarAlOk mensajeOk="Actividad creada.">
      <CamposActividad personas={personas} rubros={rubros} />
    </FormAccion>
  )
}
