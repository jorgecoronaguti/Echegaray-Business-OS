'use client'

// EL PANEL DE LA ACTIVIDAD — se toca una barra y aparece acá todo lo que se puede saber y hacer con
// ella, sin salir del Gantt. Regla 9 de `UX_PRINCIPLES.md`.
//
// ═══ QUÉ CONTESTA, EN ESTE ORDEN ═══
//
//   1. ¿Qué es y de quién es?          nombre · estado · rubro · responsable
//   2. ¿Cómo viene contra lo previsto?  Plan | Real ENFRENTADOS, y el desvío debajo
//   3. …y lo demás, plegado con su contador: personal, equipos, ejecución, impedimentos, tareas,
//      precedencias, notas y papeles.
//
// ═══ ENFRENTADOS, NO APILADOS ═══
//
// Plan y Real van en dos columnas ALINEADAS separadas por un hairline (`PlanVsReal` del DS): la
// comparación se hace con la vista, sin restar de cabeza. Dos listas una debajo de la otra obligan a
// recordar el número de arriba mientras se lee el de abajo, y ahí es donde se lee mal una obra.
//
// ═══ PLEGADO NO ES ESCONDIDO ═══
//
// Cada sección dice su contador cerrada, y los impedimentos dicen su VENCIMIENTO cerrados cuando
// aprieta: una sección «Impedimentos 2» que no cuenta que uno vence mañana es peor que no tenerla.
// La única abierta por defecto es Ejecución — «¿qué pasó estos días?» es la pregunta con la que se
// abre una actividad.

import { useState } from 'react'
import {
  BarraAvance, Boton, BotonEnlace, Nulo, PanelDetalle, PlanVsReal, Plegable,
} from '@/shared/components/ds'
import { BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type {
  Actividad, Dependencia, DocumentoObra, ParteEjecucion, Persona, Restriccion,
} from '../types'
import type { ActividadHH } from '../services/personalService'
import type { EquipoEnActividad, NotaActividad, PersonaEnActividad } from '../services/recursosService'
import { EstadoChip } from './EstadoChip'
import {
  BloqueEjecucion, BloqueMedicion, ListaEquipos, ListaPersonal, NotasDeMedicion,
} from './PanelBloques'
import {
  BloqueDocumentos, BloqueImpedimentosActividad, BloqueNotas, BloqueTareas, Dependencias,
  SelectorDeRubro,
} from './PanelGestion'
import { AvanceRapido, CamposActividad } from './FormActividad'
import { n2 } from './PanelPrimitivas'
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
  crearTarea?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  cambiarEstadoTarea?: (tareaId: string, estado: string) => Promise<ResultadoAccion>
  agregarNota?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  borrarNota?: (notaId: string) => Promise<ResultadoAccion>
  /** Impedimentos: la MISMA acción que usa Operación, con `actividad_id` en el formulario. */
  crearImpedimento?: AccionFormulario
  liberarImpedimento?: (restriccionId: string) => Promise<ResultadoAccion>
  editarImpedimento?: (restriccionId: string, form: FormData) => Promise<ResultadoAccion>
  vincularDocumento?: AccionFormulario
  soltarDocumento?: (driveFileId: string) => Promise<ResultadoAccion>
  moverDeRubro?: (actividadId: string, rubro: string) => Promise<ResultadoAccion>
  /** Crear un rubro desde el cronograma. La usa la barra de vista, no el panel. */
  crearRubro?: AccionFormulario
}

/** Todo lo que el panel muestra de UNA actividad, ya indexado por el servidor. */
export interface DatosDeActividad {
  partes: ParteEjecucion[]
  tareas: Actividad[]
  notas: NotaActividad[]
  documentos: DocumentoObra[]
  personasReales: PersonaEnActividad[]
  equipos: EquipoEnActividad[]
  /** HH y personas imputadas por día a ESTA actividad. */
  hhPorFecha: Map<string, { horas: number; personas: number }>
}

export const DATOS_VACIOS: DatosDeActividad = {
  partes: [], tareas: [], notas: [], documentos: [], personasReales: [], equipos: [],
  hhPorFecha: new Map(),
}

/** Un valor del cuadro Plan|Real: el número en mono, o su ausencia dicha por su nombre. */
const V = ({ v, falta = 'sin cargar' }: { v: string | null; falta?: string }) =>
  v === null ? <Nulo>{falta}</Nulo> : <span className="font-mono text-[12.5px] tabular-nums text-ink">{v}</span>

/**
 * EL DESVÍO DE HH A LA FECHA. Las HH consumidas contra las que correspondían al avance logrado.
 * Existe SÓLO con las tres puntas: sin plan, sin imputaciones o sin avance no es cero, es
 * desconocido — y se dice cuál falta en vez de publicar un número inventado.
 */
function desvioHH(a: Actividad, hh?: ActividadHH): { texto: string; problema: boolean } {
  const real = hh?.hh_real ?? a.hh_real
  const plan = hh?.hh_plan ?? a.hh_plan
  if (real == null || plan == null || a.avance_pct == null) {
    const falta = real == null ? 'sin horas imputadas' : plan == null ? 'sin HH plan' : 'sin avance medido'
    return { texto: `Desvío de HH sin calcular: ${falta}.`, problema: false }
  }
  const esperado = Number(plan) * (Number(a.avance_pct) / 100)
  const d = Math.round(Number(real) - esperado)
  if (d === 0) return { texto: 'Las HH consumidas van en línea con lo previsto a la fecha.', problema: false }
  return {
    texto: `${d > 0 ? '+' : ''}${d.toLocaleString('es-AR')} HH ${d > 0 ? 'sobre' : 'debajo de'} lo previsto a la fecha`,
    // Sólo es problema gastar de MÁS. Ir por debajo puede ser productividad y no se pinta de rojo.
    problema: d > 0,
  }
}

/** Lo que aprieta de los impedimentos, dicho con la sección CERRADA. */
function alertaImpedimentos(abiertos: Restriccion[], hoyIso: string): string | null {
  const conFecha = abiertos.filter((r) => r.fecha_compromiso).sort((x, y) => (x.fecha_compromiso! < y.fecha_compromiso! ? -1 : 1))
  const proximo = conFecha[0]
  if (!proximo?.fecha_compromiso) return null
  if (proximo.fecha_compromiso < hoyIso) return `vencido ${fecha(proximo.fecha_compromiso)}`
  return `vence ${fecha(proximo.fecha_compromiso)}`
}

export function PanelActividad({
  actividad, personas, acciones, alCerrar, actividades = [], dependencias = [], impedimentos = [],
  hh, datos = DATOS_VACIOS, rubros = [], hoy = new Date(), obraId, ancho,
}: {
  obraId?: string
  actividad: Actividad
  personas: Persona[]
  /** Sin acciones el panel muestra lo que hay y NADA que parezca editable. */
  acciones?: AccionesCronograma
  alCerrar: () => void
  actividades?: Actividad[]
  dependencias?: Dependencia[]
  /** TODOS los de esta actividad, abiertos y liberados. */
  impedimentos?: Restriccion[]
  hh?: ActividadHH
  datos?: DatosDeActividad
  rubros?: string[]
  hoy?: Date
  /** El ancho del split. En tablet y teléfono lo manda la pantalla. */
  ancho?: number
}) {
  const a = actividad
  const hoyIso = hoy.toISOString().slice(0, 10)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')
  const liberados = impedimentos.filter((r) => r.estado === 'liberada')
  const [editando, setEditando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const responsable = a.responsable_id
    ? (personas.find((p) => p.id === a.responsable_id)?.nombre_completo ?? null)
    : null
  const desvio = desvioHH(a, hh)
  const hhReal = hh?.hh_real ?? a.hh_real
  const dependeDe = dependencias.filter((d) => d.destino_id === a.id).length
  const avance = a.avance_pct == null ? null : Number(a.avance_pct)

  return (
    <PanelDetalle
      testid="panel-actividad"
      titulo={a.nombre}
      estado={<EstadoChip estado={a.estado_operativo} />}
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-2">
          <span>{a.rubro ?? a.seccion ?? 'sin rubro'}</span>
          <span className="text-line-strong">·</span>
          <span data-testid="panel-responsable">{responsable ?? <Nulo>sin asignar</Nulo>}</span>
        </span>
      }
      onCerrar={alCerrar}
      {...(ancho ? { ancho } : {})}
      pie={
        <>
          {/* NO DICE «Actualizado hoy 08:40»: la actividad no guarda una marca de tiempo, y una
              hora inventada sería un dato falso con cara de dato. Se dice lo que sí se sabe. */}
          <span className="flex-1 text-[11px] text-faint">
            {a.ultimo_parte ? `Último parte: ${fecha(a.ultimo_parte)}` : 'Sin partes registrados'}
          </span>
          {acciones && (a.metodo_avance === 'manual'
            ? <Boton type="button" variante="secundaria" onClick={() => setRegistrando((v) => !v)} data-testid="pie-registrar-avance">
                {registrando ? 'Cerrar avance' : 'Registrar avance'}
              </Boton>
            : obraId && (
                <BotonEnlace href={`/obras/${obraId}?vista=ejecucion`} variante="secundaria" data-testid="pie-registrar-avance">
                  Registrar avance
                </BotonEnlace>
              ))}
          {acciones && (
            <Boton type="button" variante="primaria" onClick={() => setEditando((v) => !v)} data-testid="pie-editar-actividad">
              {editando ? 'Dejar de editar' : 'Editar actividad'}
            </Boton>
          )}
        </>
      }
    >
      <PlanVsReal
        plan={[
          { rotulo: 'Unidad', valor: <V v={a.unidad} falta="sin definir" /> },
          { rotulo: 'Cantidad', valor: <V v={n2(a.cantidad_objetivo)} falta="sin plan" /> },
          { rotulo: 'Inicio', valor: <V v={a.inicio_plan ? fecha(a.inicio_plan) : null} falta="sin fecha" /> },
          { rotulo: 'Fin', valor: <V v={a.fin_plan ? fecha(a.fin_plan) : null} falta="sin fecha" /> },
          { rotulo: 'HH', valor: <V v={n2(a.hh_plan)} falta="sin plan" /> },
        ]}
        real={[
          {
            rotulo: 'Ejecutado',
            valor: <V
              v={a.metodo_avance === 'cantidad' ? n2(a.cantidad_ejecutada) : a.n_partes ? `${a.n_partes} parte(s)` : null}
              falta="sin registrar"
            />,
          },
          { rotulo: 'Avance', valor: <V v={avance == null ? null : `${n2(avance)}%`} falta="sin medir" /> },
          { rotulo: 'HH reales', valor: <V v={n2(hhReal)} falta="sin imputar" /> },
          {
            rotulo: 'Productividad',
            valor: <V v={a.productividad == null ? null : `${n2(a.productividad)} ${a.unidad ?? ''}/HH`} falta="sin registrar" />,
          },
        ]}
      />
      {/* LA BARRA VA EN LA COLUMNA REAL, alineada con sus valores: es la lectura visual del avance,
          y del lado de lo que pasó —no de lo que se prometió—. Sin avance medido no se dibuja: una
          barra vacía diría 0%, que es una afirmación que nadie hizo. */}
      <div className="mt-1.5 grid grid-cols-2">
        <div />
        <div className="border-l border-line pl-4 pr-4"><BarraAvance pct={avance} /></div>
      </div>
      {/* EL DESVÍO, DEBAJO Y EN UNA LÍNEA. En `neg` SÓLO si es un problema: gastar horas de más. */}
      <p className={`mt-3 text-[12.5px] ${desvio.problema ? 'text-neg' : 'text-muted'}`} data-testid="desvio">
        {desvio.texto}
      </p>

      <div className="mt-4 space-y-3">
        <NotasDeMedicion a={a} />
        {acciones?.moverDeRubro && rubros.length > 0 && (
          <SelectorDeRubro a={a} rubros={rubros} mover={acciones.moverDeRubro} />
        )}
        <BloqueMedicion
          a={a}
          {...(acciones?.definirMedicion ? { definir: acciones.definirMedicion.bind(null, a.id) } : {})}
        />
        {registrando && acciones && (
          <AvanceRapido key={`${a.id}:${a.pct}`} a={a} avance={acciones.avance} />
        )}
      </div>

      {editando && acciones && (
        <div className="mt-3 rounded-control border border-line p-3" data-testid="editar-la-actividad">
          <FormAccion
            accion={(form) => acciones.editar(a.id, form)}
            testid="form-editar-actividad"
            enviar="Guardar cambios"
            mensajeOk="Actividad guardada."
          >
            <CamposActividad a={a} personas={personas} {...(hh ? { hh } : {})} rubros={rubros} />
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
      )}

      <div className="mt-4 border-t border-line">
        <Plegable titulo="Personal" cuenta={datos.personasReales.length} testid="seccion-personal">
          <ListaPersonal a={a} personas={personas} reales={datos.personasReales} {...(obraId ? { obraId } : {})} />
        </Plegable>
        <Plegable titulo="Equipos" cuenta={datos.equipos.length} testid="seccion-equipos">
          <ListaEquipos equipos={datos.equipos} {...(obraId ? { obraId } : {})} />
        </Plegable>
        <Plegable titulo="Ejecución" cuenta={datos.partes.length} abiertoPorDefecto testid="seccion-ejecucion">
          <BloqueEjecucion
            a={a}
            partes={datos.partes}
            personasPorFecha={datos.hhPorFecha}
            {...(obraId ? { verTodo: `/obras/${obraId}?vista=ejecucion` } : {})}
          />
        </Plegable>
        <Plegable
          titulo="Impedimentos"
          cuenta={abiertos.length}
          testid="seccion-impedimentos"
          {...(alertaImpedimentos(abiertos, hoyIso) ? { alerta: alertaImpedimentos(abiertos, hoyIso) } : {})}
        >
          <BloqueImpedimentosActividad
            a={a}
            abiertos={abiertos}
            liberados={liberados}
            {...(acciones?.crearImpedimento ? { crear: acciones.crearImpedimento } : {})}
            {...(acciones?.liberarImpedimento ? { liberar: acciones.liberarImpedimento } : {})}
            {...(acciones?.editarImpedimento ? { editar: acciones.editarImpedimento } : {})}
            hoyIso={hoyIso}
          />
        </Plegable>
        {/* Las tareas SÓLO en una actividad: una tarea no tiene tareas. */}
        {!a.actividad_padre_id && (
          <Plegable titulo="Tareas" cuenta={datos.tareas.length} testid="seccion-tareas">
            <BloqueTareas
              tareas={datos.tareas}
              {...(acciones?.crearTarea ? { crear: acciones.crearTarea.bind(null, a.id) } : {})}
              {...(acciones?.cambiarEstadoTarea ? { alternar: acciones.cambiarEstadoTarea } : {})}
            />
          </Plegable>
        )}
        <Plegable titulo="Dependencias" cuenta={dependeDe} testid="seccion-dependencias">
          <Dependencias
            a={a}
            actividades={actividades}
            dependencias={dependencias}
            {...(acciones?.agregarDependencia ? { agregar: acciones.agregarDependencia } : {})}
            {...(acciones?.quitarDependencia ? { quitar: acciones.quitarDependencia } : {})}
          />
        </Plegable>
        <Plegable titulo="Notas" cuenta={datos.notas.length} testid="seccion-notas">
          <BloqueNotas
            notas={datos.notas}
            {...(acciones?.agregarNota ? { agregar: acciones.agregarNota.bind(null, a.id) } : {})}
            {...(acciones?.borrarNota ? { borrar: acciones.borrarNota } : {})}
          />
        </Plegable>
        <Plegable titulo="Documentos" cuenta={datos.documentos.length} testid="seccion-documentos">
          <BloqueDocumentos
            a={a}
            documentos={datos.documentos}
            {...(acciones?.vincularDocumento ? { vincular: acciones.vincularDocumento } : {})}
            {...(acciones?.soltarDocumento ? { soltar: acciones.soltarDocumento } : {})}
          />
        </Plegable>
      </div>
    </PanelDetalle>
  )
}
