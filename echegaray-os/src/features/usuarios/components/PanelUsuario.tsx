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

import { useState, useTransition } from 'react'
import { BotonAccion, Campo, CTRL, FormAccion } from '@/shared/components/ui'
import { Estado, Eyebrow, Nulo, PanelDetalle } from '@/shared/components/ds'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { AREA_LABEL } from '@/features/auth/types/areas'
import { motivoParaNoRegenerarClave, ROLES_DE_AREA } from '../services/reglas'
import {
  asignarObra, cambiarAcceso, cambiarRol, editarUsuario, quitarObra, regenerarClave,
  type ResultadoClave,
} from '../services/usuariosActions'
import { permisosEfectivos, type ObraElegible, type UsuarioGestion } from '../types'
import { Credencial } from './Credencial'

/**
 * CONTRASEÑA — la única forma de destrabar a alguien que perdió la suya.
 *
 * Sin SMTP configurado, el «olvidé mi contraseña» de Supabase manda un mail que no llega nunca. Sin
 * este botón, el único camino era entrar a Supabase a mano.
 *
 * EL BOTÓN SE ESCONDE PARA QUIEN NO PUEDE, Y ESO NO ES LA CERRADURA: la acción del servidor vuelve
 * a preguntar quién llama contra la cookie. Acá se esconde para no ofrecer algo que va a fallar —un
 * botón que rebota es peor que uno que no está—, y se dice POR QUÉ en vez de dejar un hueco mudo.
 */
function Contrasena({ u, rolActor }: { u: UsuarioGestion; rolActor: Rol | null }) {
  const impedimento = motivoParaNoRegenerarClave(rolActor)
  const [resultado, setResultado] = useState<ResultadoClave | null>(null)
  const [enCurso, empezar] = useTransition()

  return (
    <section data-testid="panel-contrasena">
      <Eyebrow className="mb-2">Contraseña</Eyebrow>
      {impedimento ? (
        <p className="mt-1.5 text-[12px] text-muted" data-testid="clave-sin-permiso">{impedimento}</p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={enCurso}
              data-testid="regenerar-clave"
              onClick={() => empezar(async () => setResultado(await regenerarClave(u.id)))}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              {enCurso ? 'Generando…' : 'Regenerar contraseña'}
            </button>
            <span className="text-[11px] text-faint">La de ahora deja de servir.</span>
          </div>
          {resultado && !resultado.ok && (
            <p className="mt-1.5 text-[12px] text-neg" data-testid="error-clave">{resultado.error}</p>
          )}
          {resultado?.ok && (
            <div className="mt-2">
              <Credencial
                email={resultado.email}
                clave={resultado.clave}
                testid="credencial-regenerada"
                titulo="Contraseña nueva. Pasale estos datos:"
                aviso={resultado.sinAcceso
                  ? 'Ojo: esta cuenta no tiene acceso. La clave nueva no le va a servir hasta que se lo devuelvas acá abajo.'
                  : null}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

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
      <Eyebrow className="mb-2">Obras con acceso</Eyebrow>
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
  usuario, obras, esUnoMismo, rolActor, alCerrar,
}: {
  usuario: UsuarioGestion
  obras: ObraElegible[]
  /** La propia cuenta del que está mirando: no se puede cambiar el rol ni sacarse el acceso. */
  esUnoMismo: boolean
  /** El rol del que MIRA, no el de la fila. Sólo Dirección regenera contraseñas. */
  rolActor: Rol | null
  alCerrar: () => void
}) {
  const u = usuario
  const activo = u.estado === 'activo'

  return (
    // LA CUENTA ES EL CORREO, y por eso es el título del panel: es lo único único y es con lo que
    // esa persona entra. El nombre del perfil va debajo, y cuando falta se DICE — una cuenta que
    // puede entrar y de la que no se sabe de quién es, es lo que esta pantalla existe para evitar.
    <PanelDetalle
      titulo={u.email ?? 'sin correo'}
      subtitulo={
        <>
          {u.nombre ?? <Nulo>sin persona vinculada</Nulo>}
          <span className="text-faint"> · {u.rol ? ROL_LABEL[u.rol] : 'sin nivel'} · {AREA_LABEL[u.area]}</span>
        </>
      }
      estado={activo
        ? <Estado tono="pos" clave="activa">activa</Estado>
        : <Estado tono="warn" clave="sin_acceso">sin acceso</Estado>}
      onCerrar={alCerrar}
      ancho={340}
      testid="panel-usuario"
    >
      <div className="space-y-6">
        {/* LO QUE VE ESTA PERSONA, EN CASTELLANO. Es exactamente lo que contestan
            `es_administracion()` y `ve_obra()` en la base, dicho para alguien que no sabe qué es una
            policy: el nombre de la tabla no le sirve a nadie que use esta pantalla. */}
        <p className="text-[12.5px] leading-relaxed text-muted" data-testid="permisos-efectivos">
          {permisosEfectivos(u)}
        </p>

        <section>
          <Eyebrow className="mb-2">Datos de la cuenta</Eyebrow>
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
          <Eyebrow className="mb-2">Nivel</Eyebrow>
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

        <Contrasena u={u} rolActor={rolActor} />

        <section>
          <Eyebrow className="mb-2">Acceso</Eyebrow>
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
      </div>
    </PanelDetalle>
  )
}
