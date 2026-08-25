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
  Aviso, CAMPO, Campo, Nulo, Plegable, SubTabs, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import { TablaEsqueleto } from '@/shared/components/carga'
import { HoyEnObra } from './HoyEnObra'
import type { ActividadHH, RegistroHH } from '../services/personalService'
import type { Actividad, Asignacion, Persona } from '../types'
import type { PlanDePersonal } from '../services/obrasService'
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
  plan: PlanDePersonal | null; asignaciones: Asignacion[]; registros: RegistroHH[]
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
function Alta({ titulo, testid, children, primaria = false }: {
  titulo: string; testid: string; children: React.ReactNode
  /** La PRIMARIA de la pantalla (canónico 09): amarillo de marca, en la banda. Es la misma
   *  mecánica —`<details>`, sin estado de cliente—, no un componente aparte: dos formas de abrir el
   *  mismo panel se desincronizan en el primer cambio. */
  primaria?: boolean
}) {
  return (
    <details className={primaria ? 'relative min-w-0' : 'w-full min-w-0 sm:w-auto'} data-testid={testid}>
      <summary
        className={primaria
          ? 'flex cursor-pointer select-none items-center gap-1.5 rounded-[6px] bg-marca px-[11px] py-[6px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97] [&::-webkit-details-marker]:hidden'
          : 'cursor-pointer select-none text-[12.5px] text-muted hover:text-ink'}
      >
        {titulo}
      </summary>
      {/* ABIERTA DESDE LA BANDA, EL PANEL BAJA SOBRE EL CONTENIDO y no empuja la lista: la banda
          mide 34px de alto y un formulario de seis campos adentro la convertiría en un bloque.
          `right-0` lo ancla al botón, que está al final de la banda. */}
      <div className={primaria
        ? 'absolute right-0 z-30 mt-2 w-[560px] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-4 shadow-pop'
        : 'mt-3 border-t border-[#EFEEEA] pt-3.5'}
      >
        {children}
      </div>
    </details>
  )
}

/**
 * ASIGNAR UNA PERSONA A ESTA OBRA — el formulario, en un componente propio.
 *
 * Vivía escrito dentro del plegable. Se saca porque ahora lo usa la PRIMARIA de la banda, y dos
 * copias del mismo formulario se separan en el primer campo que se agregue: una obra donde el rol
 * se puede elegir desde un lado y no desde el otro.
 */
function FormAsignar({ personas, cuadrillas, actividades, asignar }: {
  personas: Persona[]
  cuadrillas: { id: string; nombre: string; integrantes: number }[]
  actividades: Actividad[]
  asignar: AccionFormulario
}) {
  if (personas.length === 0) {
    return <Aviso tono="warn">No hay ninguna persona activa en el legajo, así que no hay a quién asignar.</Aviso>
  }
  return (
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
  )
}

export function TabPersonal({
  obraId, plan, asignaciones, personas, cuadrillas, actividades, actividadHH, registros,
  asignar, cerrar, quitar, imputar, imputarMasivo, borrarHoras, causas = [],
}: {
  /** LA OBRA, RECIBIDA Y NO DEDUCIDA. Hasta el 25/08 salía de `plan?.obra_id ?? asignaciones[0]
   *  ?.obra_id ?? actividades[0]?.obra_id`, porque la solapa no estaba montada y agregarle un
   *  parámetro obligaba a tocar un `page.tsx` que en esa tanda tenía otro dueño. La deducción falla
   *  justo donde más duele: una obra recién abierta —sin línea base, sin nadie asignado y sin
   *  actividades— daba `null`, y con `null` no se dibujaba la banda, así que no había buscador, no
   *  había filtros y, sobre todo, no había «+ Asignar persona». La pantalla desde la que se asigna
   *  a la primera persona era la única que no dejaba asignar a nadie. */
  obraId: string
  /** LAS CUATRO COLUMNAS QUE ESTA SOLAPA DIBUJA (`obra_id`, `hh_plan`, `hh_real`, `desvio_hh_pct`),
   *  no la vista entera: pedir `obra_plan_vs_real` completa cuesta el doble de trabajo en la base y
   *  era parte de por qué esta pantalla se caía por `statement timeout`. El tipo es un `Pick<>` a
   *  propósito — leer acá una columna que no esté en `COLUMNAS_PLAN.personal` no compila. */
  plan: PlanDePersonal | null
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

  return (
    <div className="flex flex-col gap-6">
      <Titular plan={plan} asignaciones={asignaciones} registros={registros} />

      {/* ═══ LA BANDA DEL CANÓNICO 09: NAVEGACIÓN, BUSCADOR, PASTILLAS Y LA PRIMARIA ═══
          Las tres maneras de mirar a la gente de la obra van DENTRO de la banda, con el buscador y
          los filtros: el canónico dibuja UNA sola. Sólo se dibujan las que TIENEN A DÓNDE IR —un
          sub-tab que no navega es un botón muerto—. «Asistencia» sale de la obra: esa pantalla es
          de Administración y todavía no acepta un filtro por obra; el día que lo acepte, este href
          es lo único que cambia. */}
      <Suspense fallback={<TablaEsqueleto cols={5} filas={4} />}>
        {/* LOS REGISTROS VIAJAN, NO SE VUELVEN A LEER. La columna de horas del canónico y el KPI
            de HH imputadas salen de los MISMOS registros que dibujan la tabla de abajo: una
            segunda lectura podría llegar un segundo después y publicar dos totales distintos de
            la misma jornada en la misma pantalla. */}
        <HoyEnObra
          obraId={obraId}
          asignaciones={asignaciones}
          registros={registros}
          navegacion={
            <SubTabs
              testid="subtabs-personal"
              items={[
                { label: 'Hoy en obra', activo: true, testid: 'sub-hoy-en-obra' },
                { href: `/obras/${obraId}/dotacion`, label: 'Dotación', testid: 'sub-dotacion' },
                { href: '/administracion/asistencia', label: 'Asistencia', testid: 'sub-asistencia' },
              ]}
            />
          }
          /* LA PRIMARIA DE LA PANTALLA, EN LA BANDA Y ABIERTA ACÁ MISMO (canónico 09). Estaba dos
             niveles adentro —dentro del plegable «Quién trabaja en esta obra», dentro de un
             `<details>`—: asignar a alguien a la obra es LO que se hace en esta solapa y había
             que descubrirlo. No navega a ninguna parte: baja su panel debajo de la banda. */
          accion={
            <Alta titulo="+ Asignar persona" testid="alta-asignacion" primaria>
              <FormAsignar
                personas={personas} cuadrillas={cuadrillas} actividades={actividades} asignar={asignar}
              />
            </Alta>
          }
        />
      </Suspense>

      {/* ═══ EL CUERPO DE LA PANTALLA ES «HOY EN OBRA»; LO DEMÁS SE ABRE (24/08 · canónico 09) ═══
          Las tres tablas de abajo medían cuatro pantallas de alto debajo de lo único que se mira
          todos los días —quién está hoy y cuántas horas lleva—. No se pierde nada: la asignación,
          el plan contra real y el detalle de las horas siguen acá, a un clic, con su contador en la
          fila cerrada para que se vea cuánto hay adentro sin abrir. */}
      <Plegable titulo="Quién trabaja en esta obra" cuenta={asignaciones.length}
        testid="plegable-asignaciones">
        {asignaciones.length === 0
          ? <Vacio>Nadie tiene una asignación en esta obra. Se asigna con «+ Asignar persona».</Vacio>
          : (
              <TablaAsignaciones
                asignaciones={asignaciones} actividadDe={actividadDe}
                porAsignado={porAsignado} cerrar={cerrar} quitar={quitar}
              />
            )}

        <div className="mt-3.5 flex flex-wrap items-start gap-x-6 gap-y-3">
          <Alta titulo="+ Imputar horas" testid="alta-hh">
            <FormIndividual personas={personas} asignadas={asignaciones.map((a) => a.persona_id)}
              actividades={actividades} imputar={imputar} causas={causas} />
          </Alta>

          <Alta titulo="+ Imputar a la cuadrilla" testid="alta-hh-masiva">
            <FormMasiva asignaciones={asignaciones} actividades={actividades} imputarMasivo={imputarMasivo} />
          </Alta>
        </div>
      </Plegable>

      <Plegable titulo="Plan contra real por actividad" cuenta={actividadHH.length}
        testid="plegable-plan-vs-real">
        <TablaProductividad actividades={actividadHH} />
      </Plegable>

      <Plegable
        titulo="Horas imputadas a esta obra" cuenta={registros.length}
        testid="plegable-horas"
        {...(sinPersona > 0
          ? { alerta: `${sinPersona} ${sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}` }
          : {})}
      >
        <TablaHoras registros={registros} borrarHoras={borrarHoras} />
        {/* La advertencia se queda porque evita un error real —creer que a alguien le faltan
            horas— pero en una línea: el porqué largo vive en la ayuda, no en la pantalla. */}
        {sinPersona > 0 && (
          <p className="mt-2.5 text-[11px] text-faint">
            {sinPersona} {sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}: son horas
            reales sin dueño conocido.
          </p>
        )}
      </Plegable>
    </div>
  )
}
