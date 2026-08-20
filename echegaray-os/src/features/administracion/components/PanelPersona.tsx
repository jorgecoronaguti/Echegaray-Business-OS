// EL PANEL DE UNA PERSONA — donde se carga y se corrige el legajo.
//
// Es el mismo formulario para el alta y para la edición. Separarlos deja que con el tiempo acepten
// cosas distintas, y el desvío entre los dos recién se descubre cuando un dato cargado por una vía
// no aparece por la otra.
//
// ═══ LO QUE ESTE PANEL MUESTRA PERO NO DEJA EDITAR ═══
//
// Las asignaciones a obra se ven acá —"¿dónde está esta persona?" es una pregunta de
// Administración— pero se editan en la obra, que es el único lugar donde se ve contra qué actividad
// y con qué cuadrilla se está asignando. Dos altas para el mismo vínculo darían dos caminos y
// ninguna razón para preferir uno.

import Link from 'next/link'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  CATEGORIAS_UOCRA, CATEGORIA_LABEL, esCategoriaDeConvenio,
  type AsignacionDePersona, type Persona,
} from '../types'

/** El selector de categoría. Ofrece las cuatro del convenio y, si la persona tiene un valor que no
 *  es ninguna de ellas, lo agrega como opción marcada para que guardar no lo borre sin avisar. */
function SelectCategoria({ valor }: { valor: string | null }) {
  const fueraDeConvenio = valor && !esCategoriaDeConvenio(valor) ? valor : null
  return (
    <select name="categoria" defaultValue={valor ?? ''} className={CTRL} data-testid="persona-categoria">
      <option value="">sin categoría</option>
      {CATEGORIAS_UOCRA.map((c) => (
        <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
      ))}
      {fueraDeConvenio && (
        <option value={fueraDeConvenio}>{fueraDeConvenio} — fuera de convenio</option>
      )}
    </select>
  )
}

function CamposPersona({ persona }: { persona: Persona | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre y apellido" ancho="col-span-2">
        <input
          name="nombre_completo" required maxLength={200} className={CTRL}
          defaultValue={persona?.nombre_completo ?? ''} data-testid="persona-nombre"
        />
      </Campo>
      <Campo label="DNI">
        <input name="dni" inputMode="numeric" maxLength={12} className={CTRL} defaultValue={persona?.dni ?? ''} />
      </Campo>
      <Campo label="CUIL">
        <input name="cuil" inputMode="numeric" maxLength={15} className={CTRL} defaultValue={persona?.cuil ?? ''} />
      </Campo>
      <Campo label="Categoría">
        <SelectCategoria valor={persona?.categoria ?? null} />
      </Campo>
      <Campo label="Especialidad">
        <input name="especialidad" maxLength={120} className={CTRL} defaultValue={persona?.especialidad ?? ''} />
      </Campo>
      <Campo label="Ingreso" ancho="col-span-2">
        <input type="date" name="fecha_ingreso" className={CTRL} defaultValue={persona?.fecha_ingreso ?? ''} />
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <input name="notas" maxLength={300} className={CTRL} defaultValue={persona?.notas ?? ''} />
      </Campo>
    </div>
  )
}

/** Dónde está asignada. Sólo lectura, con el enlace a la obra donde sí se edita. */
function Asignaciones({ asignaciones }: { asignaciones: AsignacionDePersona[] }) {
  if (asignaciones.length === 0) {
    return <p className="text-[12px] text-muted">Sin asignaciones a obra.</p>
  }
  return (
    <ul data-testid="persona-asignaciones" className="space-y-1.5">
      {asignaciones.map((a) => (
        <li key={a.id} className="flex items-baseline justify-between gap-3 text-[12px]">
          <Link href={`/obras/${a.obra_id}`} className="min-w-0 truncate text-ink hover:underline">
            {a.obra_id}
          </Link>
          <span className="shrink-0 text-faint">
            {a.rol ?? 'integrante'}{a.cuadrilla ? ` · ${a.cuadrilla}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PanelPersona({
  persona,
  asignaciones,
  crear,
  editar,
  baja,
  alta,
  cerrarHref,
}: {
  /** `null` = alta. */
  persona: Persona | null
  asignaciones: AsignacionDePersona[]
  crear: AccionFormulario
  editar: AccionFormulario
  baja: (personaId: string) => Promise<ResultadoAccion>
  alta: (personaId: string) => Promise<ResultadoAccion>
  cerrarHref: string
}) {
  const esAlta = persona === null
  const egresada = persona !== null && !persona.en_la_empresa

  return (
    <aside
      data-testid="panel-persona"
      className="w-full shrink-0 border-t border-line bg-surface-quiet px-4 py-4 lg:w-[360px] lg:border-l lg:border-t-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            {esAlta ? 'Nueva persona' : egresada ? 'Ya no está en el plantel' : 'En el plantel'}
          </p>
          <p className="truncate text-[14px] font-semibold text-ink">
            {persona?.nombre_completo ?? 'Cargar una persona'}
          </p>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-panel" className="shrink-0 text-[12px] text-muted hover:text-ink">
          cerrar
        </Link>
      </div>

      <div className="mt-4">
        <FormAccion
          accion={esAlta ? crear : editar}
          testid={esAlta ? 'form-persona-alta' : 'form-persona-editar'}
          enviar={esAlta ? 'Crear' : 'Guardar'}
          limpiarAlOk={esAlta}
          mensajeOk={esAlta ? 'Persona creada.' : 'Guardado.'}
        >
          <CamposPersona persona={persona} />
        </FormAccion>
      </div>

      {!esAlta && persona && (
        <>
          <div className="mt-5 border-t border-line pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Dónde está asignada</p>
            <Asignaciones asignaciones={asignaciones} />
            <p className="mt-1.5 text-[11px] text-faint">Las asignaciones se cargan desde la obra.</p>
          </div>

          <div className="mt-5 border-t border-line pt-3">
            {egresada
              ? (
                  <>
                    <p className="mb-2 text-[12px] text-muted">
                      {persona.fecha_egreso
                        ? `Egresó el ${persona.fecha_egreso}.`
                        : 'Ya no está en la empresa; la fecha de baja no consta en ningún papel.'}
                      {' '}No se ofrece para asignar a una obra.
                    </p>
                    <BotonAccion accion={alta} args={[persona.id]} testid="reincorporar">
                      Reincorporar al plantel
                    </BotonAccion>
                  </>
                )
              : (
                  <>
                    <p className="mb-2 text-[12px] text-muted">
                      Dar de baja la saca del plantel. No pone la fecha de hoy —inventaría el dato—:
                      la fecha de egreso se carga en Laboral cuando conste en un papel. No borra
                      nada: sus obras y sus horas quedan como están.
                    </p>
                    <BotonAccion accion={baja} args={[persona.id]} testid="dar-de-baja" tono="peligro">
                      Dar de baja
                    </BotonAccion>
                  </>
                )}
          </div>
        </>
      )}
    </aside>
  )
}
