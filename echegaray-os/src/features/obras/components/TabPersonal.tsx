// PERSONAL DE LA OBRA — quién está, con qué rol, y cuántas horas lleva.
//
// ═══ LA FORMA LA FIJA EL HANDOFF APROBADO (design/screens/obras.md §1e) ═══
//
//   Titular en UNA línea · asignaciones · plan contra real por actividad · horas imputadas.
//   Las altas van por ACCIÓN DISCRETA, no por formulario permanente en pantalla.
//
// Los tres formularios de carga estaban esparcidos entre las tablas, cada uno en su recuadro: la
// pantalla se leía como cuatro bloques de escritura con algunas tablas en el medio, cuando lo que
// se hace acá casi siempre es MIRAR. Ahora los tres viven en una fila de acciones debajo de la
// tabla de asignaciones, plegados, y se abren donde están.
//
// ═══ ES LA MISMA RELACIÓN QUE MUESTRA LA FICHA DE LA PERSONA ═══
//
// Esta solapa NO es un segundo maestro de personas: es la vista de recursos humanos DE ESTA OBRA.
// Lee `obra_asignacion` —la misma tabla que lee `/administracion/personas/<id>`— y `registros_hh`,
// que es la única fuente de las horas. Ninguna de las dos pantallas guarda un resumen propio, y por
// eso no pueden decir cosas distintas.
//
// ═══ LAS DOS PUNTAS DE LAS HH, Y EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS ═══
//
// HH plan es la suma de `obra_actividad.hh_plan`; HH real es la suma de `registros_hh`. Las dos las
// publica `obra_plan_vs_real`, que también anula el desvío cuando falta una. Acá no se vuelve a
// sumar: se muestra lo que la vista publicó y, debajo, las filas que lo respaldan.

import { Suspense } from 'react'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  Aviso, CAMPO, Campo, Eyebrow, Nulo, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import { TablaEsqueleto } from '@/shared/components/carga'
import { HoyEnObra } from './HoyEnObra'
import type { ActividadHH, RegistroHH } from '../services/personalService'
import type { Actividad, Asignacion, Persona, PlanVsReal } from '../types'
import { etiquetaCategoria } from '@/features/administracion/types'
import { FormIndividual, FormMasiva, TablaHoras, TablaProductividad } from './PersonalHH'
import { horasPorAsignado } from '../services/productividadHH'
import { desvio } from './formato'

/**
 * EL TITULAR, EN UNA LÍNEA.
 *
 * El dueño lo dibujó así: *"12 personas · HH plan 12.400 · HH real 8.540 (312 registros) · 148 HH
 * extras · +850 HH"*, y agregó *"sin KPIs decorativos"*. Eran cuatro recuadros con borde; ahora es
 * un renglón. Las mismas cifras ocupan un tercio del alto y se leen de un vistazo.
 *
 * NINGUNA SE INVENTA. Sin plan cargado no dice «0 HH»: dice «HH plan sin cargar», y el desvío
 * directamente no aparece. Un cero donde falta un dato convierte una obra sin planificar en una
 * obra perfectamente cumplida.
 */
function Titular({ plan, asignaciones, registros }: {
  plan: PlanVsReal | null; asignaciones: Asignacion[]; registros: RegistroHH[]
}) {
  const hhPlan = plan?.hh_plan ?? null
  const hhReal = plan?.hh_real ?? null
  const dif = hhPlan != null && hhReal != null ? hhReal - hhPlan : null
  const vigentes = asignaciones.filter((a) => !a.hasta)
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')
  // LAS EXTRAS SALEN DE LOS MISMOS REGISTROS, no de un contador aparte: son las horas de la obra,
  // desagregadas por clase. Se nombran sólo si las hubo — «0 extras» en toda obra sin extras es
  // ruido que tapa a la que sí las tuvo.
  const extras = registros
    .filter((r) => r.tipo_hora === 'extra_50' || r.tipo_hora === 'extra_100')
    .reduce((t, r) => t + r.horas, 0)

  const partes = [
    vigentes.length === 0 ? 'nadie asignado' : `${vigentes.length} ${vigentes.length === 1 ? 'persona' : 'personas'}`,
    hhPlan == null ? 'HH plan sin cargar' : `HH plan ${n(hhPlan)}`,
    hhReal == null
      ? 'HH real sin imputar'
      : `HH real ${n(hhReal)} (${registros.length} ${registros.length === 1 ? 'registro' : 'registros'})`,
    ...(extras > 0 ? [`${n(extras)} HH extras`] : []),
  ]

  return (
    <p className="text-[13px] text-muted" data-testid="titular-personal">
      {partes.join(' · ')}
      {dif != null && (
        <>
          {' · '}
          {/* ROJO SÓLO PARA UN PROBLEMA REAL: pasarse del plan de horas lo es. Estar por debajo no
              se pinta de verde —puede ser que falte imputar—, así que queda neutro. */}
          <span className={dif > 0 ? 'font-medium text-neg' : 'font-medium text-ink'}>
            {dif > 0 ? '+' : '−'}{n(Math.abs(dif))} HH
          </span>
          <span className="text-faint"> {desvio(plan?.desvio_hh_pct)} vs plan</span>
        </>
      )}
    </p>
  )
}

function TablaAsignaciones({ asignaciones, actividadDe, porAsignado, cerrar, quitar }: {
  asignaciones: Asignacion[]
  actividadDe: Map<string, string>
  porAsignado: Map<string, number>
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  return (
    <Tabla testid="tabla-personal" minWidth={720}>
      <THead>
        <Th>Persona</Th><Th>Rol / categoría</Th><Th>Cuadrilla</Th><Th>Actividad</Th>
        <Th num>HH</Th><Th num />
      </THead>
      <tbody>
        {asignaciones.map((a) => (
          <Tr key={a.id} {...{ 'data-testid': 'fila-asignacion' }}>
            <Td fuerte>
              {/* Sin persona en el legajo se MARCA en `warn` y no se rellena: la asignación existe,
                  el legajo la perdió, y eso es trabajo pendiente de alguien. */}
              {a.persona_nombre ?? <span className="text-warn">persona borrada del legajo</span>}
              {a.persona_especialidad && (
                <span className="block text-[11px] text-faint">{a.persona_especialidad}</span>
              )}
            </Td>
            {/* ROL Y CATEGORÍA JUNTOS: son la misma pregunta —«¿qué hace acá?»— y separarlos
                gastaba una columna en un dato de una palabra. */}
            <Td>
              {a.rol}
              {a.persona_categoria && (
                <span className="block text-[11px] text-faint">{etiquetaCategoria(a.persona_categoria)}</span>
              )}
            </Td>
            <Td>{a.cuadrilla ?? <Nulo>sin cuadrilla</Nulo>}</Td>
            <Td>
              {a.actividad_id
                ? (actividadDe.get(a.actividad_id) ?? <Nulo>actividad archivada</Nulo>)
                : 'toda la obra'}
              {/* La asignación cerrada no se esconde —es la historia de la obra— pero se dice con
                  una palabra en vez de gastar una columna de fechas en el listado operativo. */}
              {a.hasta && <span className="block text-[11px] text-faint">hasta {a.hasta}</span>}
            </Td>
            <Td num fuerte>
              {porAsignado.get(a.id)?.toLocaleString('es-AR', { maximumFractionDigits: 1 })
                ?? <Nulo>sin imputar</Nulo>}
            </Td>
            <Td num>
              {/* CERRAR conserva el período; QUITAR borra la fila y sólo sirve para el alta hecha
                  por error. Si las dos hicieran lo mismo, cada rotación borraría el pasado. */}
              {a.hasta
                ? <BotonAccion accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</BotonAccion>
                : <BotonAccion accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar</BotonAccion>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

/**
 * UN ALTA COMO ACCIÓN DISCRETA. Cerrada es un enlace más de la fila de acciones; abierta baja su
 * panel debajo. Sin estado de cliente: lo resuelve `<details>`, y por eso la pantalla entera sigue
 * siendo un componente de servidor.
 */
function Alta({ titulo, testid, children }: {
  titulo: string; testid: string; children: React.ReactNode
}) {
  return (
    <details className="w-full min-w-0 sm:w-auto" data-testid={testid}>
      <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
        {titulo}
      </summary>
      <div className="mt-3 border-t border-[#EFEEEA] pt-3.5">{children}</div>
    </details>
  )
}

export function TabPersonal({
  plan, asignaciones, personas, cuadrillas, actividades, actividadHH, registros,
  asignar, cerrar, quitar, imputar, imputarMasivo, borrarHoras, causas = [],
}: {
  plan: PlanVsReal | null
  asignaciones: Asignacion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string; integrantes: number }[]
  actividades: Actividad[]
  actividadHH: ActividadHH[]
  registros: RegistroHH[]
  asignar: AccionFormulario
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
  imputar: AccionFormulario
  causas?: { clave: string; nombre: string }[]
  imputarMasivo: AccionFormulario
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  const porAsignado = horasPorAsignado(asignaciones, registros)
  const actividadDe = new Map(actividades.map((a) => [a.id, a.nombre]))
  const sinPersona = registros.filter((r) => !r.persona_id).length
  // ═══ DE DÓNDE SALE LA OBRA (23/08) ═══
  //
  // La solapa no recibe el id de la obra: la ficha se lo pasa a cada una en los datos, no como
  // parámetro, y agregarlo a la firma obliga a tocar `page.tsx` de `[obra]` —que en esta tanda tiene
  // otro dueño—. Se toma del plan, que es la fila de `obra_plan_vs_real` de ESTA obra, con las
  // asignaciones y las actividades como respaldo. Si las tres faltan, la obra no tiene ni plan ni
  // gente ni trabajo cargado, y ahí la sección de presencia no tendría nada que mostrar igual.
  const obraId = plan?.obra_id ?? asignaciones[0]?.obra_id ?? actividades[0]?.obra_id ?? null

  return (
    <div className="flex flex-col gap-8">
      <Titular plan={plan} asignaciones={asignaciones} registros={registros} />

      {obraId && (
        <Suspense fallback={<TablaEsqueleto cols={5} filas={4} />}>
          <HoyEnObra obraId={obraId} asignaciones={asignaciones} />
        </Suspense>
      )}

      <section>
        <Eyebrow className="mb-2.5">Quién trabaja en esta obra</Eyebrow>
        {asignaciones.length === 0
          ? <Vacio>Nadie tiene una asignación en esta obra. Se asigna con «+ Asignar persona».</Vacio>
          : (
              <TablaAsignaciones
                asignaciones={asignaciones} actividadDe={actividadDe}
                porAsignado={porAsignado} cerrar={cerrar} quitar={quitar}
              />
            )}

        <div className="mt-3.5 flex flex-wrap items-start gap-x-6 gap-y-3">
          <Alta titulo="+ Asignar persona" testid="alta-asignacion">
            {personas.length === 0
              ? <Aviso tono="warn">No hay ninguna persona activa en el legajo, así que no hay a quién asignar.</Aviso>
              : (
                  <FormAccion accion={asignar} testid="form-asignar" enviar="Asignar" limpiarAlOk mensajeOk="Asignado.">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Campo rotulo="Persona" className="col-span-2">
                        <select name="persona_id" required className={CAMPO} defaultValue="">
                          <option value="" disabled>elegir del legajo</option>
                          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
                        </select>
                      </Campo>
                      <Campo rotulo="Rol">
                        <select name="rol" defaultValue="integrante" className={CAMPO}>
                          <option value="integrante">integrante</option>
                          <option value="responsable">responsable</option>
                        </select>
                      </Campo>
                      <Campo rotulo="Cuadrilla">
                        <select name="cuadrilla_id" defaultValue="" className={CAMPO}>
                          <option value="">sin cuadrilla</option>
                          {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </Campo>
                      <Campo rotulo="Desde"><input type="date" name="desde" className={CAMPO} /></Campo>
                      <Campo
                        rotulo="Actividad" className="col-span-2 sm:col-span-3"
                        ayuda="Opcional: en blanco queda asignado a la obra entera."
                      >
                        <select name="actividad_id" defaultValue="" className={CAMPO}>
                          <option value="">toda la obra</option>
                          {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                      </Campo>
                      <Campo rotulo="Notas" className="col-span-2 sm:col-span-4" ayuda="Por qué está en esta obra.">
                        <input name="notas" maxLength={300} className={CAMPO} />
                      </Campo>
                    </div>
                  </FormAccion>
                )}
          </Alta>

          <Alta titulo="+ Imputar horas" testid="alta-hh">
            <FormIndividual personas={personas} asignadas={asignaciones.map((a) => a.persona_id)}
              actividades={actividades} imputar={imputar} causas={causas} />
          </Alta>

          <Alta titulo="+ Imputar a la cuadrilla" testid="alta-hh-masiva">
            <FormMasiva asignaciones={asignaciones} actividades={actividades} imputarMasivo={imputarMasivo} />
          </Alta>
        </div>
      </section>

      {/* Las dos tablas de horas, enfrentadas: la de la izquierda dice si el plan alcanza, la de la
          derecha dice de dónde sale el número. Se leen juntas o no se leen. */}
      <div className="flex flex-col gap-8 xl:flex-row xl:gap-10">
        <section className="min-w-0 flex-1">
          <Eyebrow className="mb-2.5">Plan contra real por actividad</Eyebrow>
          <TablaProductividad actividades={actividadHH} />
        </section>

        <section className="min-w-0 xl:w-[520px] xl:shrink-0">
          <Eyebrow className="mb-2.5">Horas imputadas a esta obra</Eyebrow>
          <TablaHoras registros={registros} borrarHoras={borrarHoras} />
          {/* La advertencia se queda porque evita un error real —creer que a alguien le faltan
              horas— pero en una línea: el porqué largo vive en la ayuda, no en la pantalla. */}
          {sinPersona > 0 && (
            <p className="mt-2.5 text-[11px] text-faint">
              {sinPersona} {sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}: son horas
              reales sin dueño conocido.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
