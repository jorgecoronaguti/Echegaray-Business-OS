'use client'

// EL PANEL LATERAL DE UNA CUENTA — se elige una fila de la lista y acá se hace todo lo que se le
// puede hacer. No es una pantalla aparte a propósito: lo que se decide al cambiar un rol o sacar una
// obra es SIEMPRE contra el resto de la gente, y la lista tiene que seguir a la vista.
//
// En el teléfono es una hoja que sube; en escritorio, una columna de 340px. Mismo marcado, mismo
// componente: cambia dónde se apoya. Es el patrón de `PanelActividad` del cronograma.
//
// ═══ LO QUE ESTA PANTALLA NO DICE ═══
//
// Ni «RLS», ni «usuario_obra», ni «perfiles», ni «policy». Lo que la persona necesita entender es
// qué va a poder ver el otro, y eso se dice en castellano arriba de todo (`permisosEfectivos`). El
// nombre de la tabla no le sirve a nadie que use esta pantalla, y al que sí le sirve lo tiene en el
// código.

import { BotonAccion, Campo, CTRL, FormAccion } from '@/shared/components/ui'
import { ROL_LABEL } from '@/features/auth/types'
import { AREA_LABEL } from '@/features/auth/types/areas'
import { ROLES_DE_AREA } from '../services/reglas'
import { asignarObra, cambiarAcceso, cambiarRol, editarUsuario, quitarObra } from '../services/usuariosActions'
import { permisosEfectivos, type ObraElegible, type UsuarioGestion } from '../types'

function SelectorDeRol({ valor }: { valor: string }) {
  return (
    <select name="rol" defaultValue={valor} className={CTRL} data-testid="selector-rol">
      {(['administracion', 'obras'] as const).map((area) => (
        <optgroup key={area} label={AREA_LABEL[area]}>
          {ROLES_DE_AREA[area].map((r) => (
            <option key={r} value={r}>{ROL_LABEL[r]}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Las obras de esta persona: las que tiene y el alta de una más. */
function ObrasDeLaCuenta({ u, obras }: { u: UsuarioGestion; obras: ObraElegible[] }) {
  const yaTiene = new Set(u.obras.map((o) => o.obraId))
  const libres = obras.filter((o) => !yaTiene.has(o.id))

  return (
    <section data-testid="panel-obras">
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Obras asignadas</p>
      {u.area === 'administracion' ? (
        <p className="mt-1.5 text-[12px] text-muted">
          Administración entra a todas las obras. No hace falta asignarle ninguna.
        </p>
      ) : (
        <>
          {u.obras.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-muted">Todavía no tiene ninguna. Asignale una abajo.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-line/70 rounded-control border border-line bg-surface">
              {u.obras.map((o) => (
                <li key={o.asignacionId} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[13px] text-ink">
                    {o.obraNombre}
                    <span className="text-faint"> · {o.papel}</span>
                  </span>
                  <BotonAccion
                    accion={quitarObra} args={[u.id, o.asignacionId]}
                    testid={`quitar-obra-${o.obraId}`} tono="peligro"
                  >
                    Quitar
                  </BotonAccion>
                </li>
              ))}
            </ul>
          )}

          {libres.length > 0 && (
            <div className="mt-2.5">
              <FormAccion
                accion={(form) => asignarObra(u.id, form)}
                testid="form-asignar-obra" enviar="Asignar" limpiarAlOk mensajeOk="Ya tiene acceso a esa obra."
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <Campo label="Obra" ancho="col-span-2">
                    <select name="obra_canonica_id" required defaultValue="" className={CTRL}>
                      <option value="" disabled>elegir una obra</option>
                      {libres.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Papel en la obra" ancho="col-span-2">
                    <select name="papel" defaultValue="jefe" className={CTRL}>
                      <option value="jefe">jefe</option>
                      <option value="colaborador">colaborador</option>
                      <option value="lectura">sólo lectura</option>
                    </select>
                  </Campo>
                </div>
              </FormAccion>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function PanelUsuario({
  usuario, obras, esUnoMismo, alCerrar,
}: {
  usuario: UsuarioGestion
  obras: ObraElegible[]
  /** La propia cuenta del que está mirando: no se puede cambiar el rol ni sacarse el acceso. */
  esUnoMismo: boolean
  alCerrar: () => void
}) {
  const u = usuario
  const activo = u.estado === 'activo'

  return (
    <>
      <button
        type="button" aria-label="Cerrar el panel" onClick={alCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid="panel-usuario"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] space-y-5 overflow-y-auto rounded-t-card border-t border-line bg-surface-quiet p-3.5 shadow-pop lg:sticky lg:top-16 lg:z-auto lg:max-h-none lg:w-[340px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-faint">
              {u.rol ? ROL_LABEL[u.rol] : 'Sin rol asignado'} · {AREA_LABEL[u.area]}
            </p>
            <h2 className="truncate text-[15px] font-semibold text-ink">{u.nombre ?? u.email ?? 'Sin nombre'}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted" data-testid="permisos-efectivos">
              {permisosEfectivos(u)}
            </p>
          </div>
          <button
            type="button" onClick={alCerrar} data-testid="cerrar-panel"
            className="shrink-0 rounded-control border border-line px-2 py-1 text-[12px] text-muted hover:bg-surface-sunken"
          >
            Cerrar
          </button>
        </header>

        <section>
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Datos</p>
          <div className="mt-1.5">
            <FormAccion accion={(form) => editarUsuario(u.id, form)} testid="form-datos" mensajeOk="Guardado.">
              <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Nombre" ancho="col-span-2">
                  <input name="nombre" defaultValue={u.nombre ?? ''} required minLength={2} maxLength={80} className={CTRL} />
                </Campo>
                <Campo label="Correo" ancho="col-span-2" ayuda="Es con lo que entra al sistema.">
                  <input name="email" type="email" defaultValue={u.email ?? ''} required className={CTRL} />
                </Campo>
              </div>
            </FormAccion>
          </div>
        </section>

        <section>
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Rol</p>
          {esUnoMismo ? (
            <p className="mt-1.5 text-[12px] text-muted" data-testid="rol-propio">
              Es tu propia cuenta: el rol te lo tiene que cambiar otra persona de Administración.
            </p>
          ) : (
            <div className="mt-1.5">
              <FormAccion accion={(form) => cambiarRol(u.id, form)} testid="form-rol" enviar="Cambiar rol" mensajeOk="Rol cambiado.">
                <SelectorDeRol valor={u.rol ?? 'jefe_obra'} />
              </FormAccion>
            </div>
          )}
        </section>

        <ObrasDeLaCuenta u={u} obras={obras} />

        <section>
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Acceso</p>
          {esUnoMismo ? (
            <p className="mt-1.5 text-[12px] text-muted" data-testid="acceso-propio">
              No podés sacarte el acceso a vos mismo.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <BotonAccion
                accion={cambiarAcceso} args={[u.id, !activo]}
                testid={activo ? 'quitar-acceso' : 'dar-acceso'} tono={activo ? 'peligro' : 'fuerte'}
              >
                {activo ? 'Quitar el acceso' : 'Devolver el acceso'}
              </BotonAccion>
              <span className="text-[11px] text-faint">
                {activo ? 'No va a poder volver a entrar.' : 'Va a poder entrar con su clave de siempre.'}
              </span>
            </div>
          )}
        </section>
      </aside>
    </>
  )
}
