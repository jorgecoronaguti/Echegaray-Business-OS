// «USUARIO Y PERMISOS» — la cuenta con la que esta persona entra al sistema.
//
// ═══ UNA PERSONA NO ES UNA CUENTA, Y ESTA SOLAPA EXISTE PARA QUE ESO SE VEA ═══
//
// El plantel tiene gente que nunca va a tener acceso, y el sistema tiene casillas que no son de
// nadie. El vínculo entre las dos cosas es `perfiles.persona_id` —lo mismo que resuelve
// `mi_persona_id()` en la base y de lo que cuelga todo «Mi cuenta»—, y NO se crea desde acá: la
// regla de la casa es que el vínculo lo hace Administración desde Usuarios, donde se ve contra qué
// otras cuentas se está eligiendo. Un alta de usuario metida en la ficha de una persona no puede
// mostrar eso, y vincular a alguien mal es darle el legajo de otro.
//
// Sin cuenta, la solapa DICE que no hay y manda a donde se crea. No dibuja un formulario.
//
// ═══ LOS PERMISOS SON DE SÓLO LECTURA Y NO POR FALTA DE TIEMPO ═══
//
// No hay ningún permiso que guardar: son lo que contestan `ve_obra()`, `es_administracion()` y
// `ve_economia()` a partir del rol. Lo único editable es el ROL, y se edita en Usuarios —cambiarlo
// desde acá dejaría dos pantallas que hacen lo mismo sin la regla del último administrador a la
// vista—. El detalle está en `services/accesoPersona.ts`.

import Link from 'next/link'
import { BotonAccion } from '@/shared/components/ui'
import { Aviso, Estado, Eyebrow, Nulo } from '@/shared/components/ds'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { motivoParaNoRegenerarClave } from '@/features/usuarios/services/reglas'
import { permisosDelRol, rutasCerradasPara, REGLA_ECONOMICO } from '../services/accesoPersona'
import type { CuentaDePersona } from '../services/accesoService'
import { cambiarAccesoDePersona } from '../services/accesoActions'
import { Bloque, Dato } from './FichaPartes'
import { RestablecerClave } from './RestablecerClave'

export function BloqueUsuario({
  personaId, lectura, rolActor, esUnoMismo,
}: {
  personaId: string
  lectura: CuentaDePersona
  /** El rol del que MIRA, no el de la cuenta. Sólo Dirección restablece contraseñas. */
  rolActor: Rol | null
  /** La cuenta de esta persona es la del que mira: nadie se saca el acceso a sí mismo. */
  esUnoMismo: boolean
}) {
  if (!lectura.hay) {
    return (
      <Bloque titulo="Acceso al sistema" testid="bloque-usuario">
        {/* NO PUDE LEER y NO HAY son dos cosas distintas: decir «sin cuenta» ante un error de
            permisos manda a crear una que ya existe, y el alta rebota con «ya existe ese correo». */}
        {lectura.error ? (
          <Aviso tono="neg" titulo="No pude leer la cuenta">{lectura.error}</Aviso>
        ) : (
          <div data-testid="persona-sin-cuenta">
            <p className="text-[13px] text-muted">
              Esta persona <strong className="text-ink">no tiene cuenta</strong>: no entra al sistema,
              no ve sus horas ni sus recibos desde el teléfono.
            </p>
            <p className="mt-2 text-[12px] text-faint">
              El vínculo entre una cuenta y una persona lo hace Administración, donde se ve contra qué
              otras cuentas se está eligiendo.{' '}
              <Link href="/administracion/usuarios" className="text-ink hover:underline" data-testid="ir-a-usuarios">
                Ir a Usuarios →
              </Link>
            </p>
          </div>
        )}
      </Bloque>
    )
  }

  const c = lectura.cuenta
  const activa = c.estado === 'activo'

  return (
    <div className="space-y-8" data-testid="bloque-usuario">
      <Bloque titulo="Acceso al sistema" testid="bloque-acceso">
        <Dato k="Usuario" v={c.email} />
        <Dato k="Nombre de la cuenta" v={c.nombre} />
        <Dato k="Rol" v={c.rol ? ROL_LABEL[c.rol] : null} />
        {/* NUNCA ENTRÓ NO ES UN HUECO. Una cuenta creada y jamás usada y una que entra todos los
            días son dos situaciones opuestas, y un «sin cargar» las iguala. */}
        <Dato k="Último acceso" v={c.ultimoIngreso ?? 'nunca ingresó'} />
        <div className="flex min-w-0 items-baseline justify-between gap-4 py-[9px]">
          <span className="shrink-0 text-[12px] text-muted">Estado</span>
          {activa
            ? <Estado tono="pos" clave="activa" testid="estado-cuenta">puede entrar</Estado>
            : <Estado tono="warn" clave="sin_acceso" testid="estado-cuenta">bloqueada</Estado>}
        </div>

        <div className="mt-6 space-y-6">
          <RestablecerClave personaId={personaId} impedimento={motivoParaNoRegenerarClave(rolActor)} />

          <section data-testid="ficha-acceso">
            <Eyebrow className="mb-2">Acceso</Eyebrow>
            {esUnoMismo ? (
              <p className="text-[12px] text-muted" data-testid="acceso-propio">
                Es tu propia cuenta: no podés sacarte el acceso a vos mismo.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <BotonAccion
                  accion={cambiarAccesoDePersona} args={[personaId, !activa]}
                  testid={activa ? 'bloquear-acceso' : 'desbloquear-acceso'}
                  tono={activa ? 'peligro' : 'fuerte'}
                >
                  {activa ? 'Bloquear acceso' : 'Devolver el acceso'}
                </BotonAccion>
                <span className="text-[11px] text-faint">
                  {activa
                    // EL LÍMITE MEDIDO, DICHO DONDE SE APRIETA EL BOTÓN: bloquear corta el login y la
                    // renovación de sesión, pero un token ya emitido sigue leyendo hasta que vence.
                    ? 'No va a poder volver a entrar. Si tiene la sesión abierta, le dura hasta una hora más.'
                    : 'Va a poder entrar con su clave de siempre.'}
                </span>
              </div>
            )}
          </section>
        </div>
      </Bloque>

      <Bloque titulo="Permisos" testid="bloque-permisos" ayuda="Se siguen del rol. Se cambian en Usuarios.">
        {/* LA REGLA DEL DESIGN, TEXTUAL. Es lo que explica por qué la lista no es una escalera:
            el jefe de obra administra los maestros y NO ve el precio de venta. */}
        <p className="mb-3 text-[12px] text-muted" data-testid="regla-economico">{REGLA_ECONOMICO}</p>
        <ul>
          {permisosDelRol(c.rol).map((p) => (
            <li
              key={p.clave}
              data-testid={`permiso-${p.tiene ? 'si' : 'no'}`}
              className="flex min-w-0 items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-[9px] last:border-0"
            >
              <span className="min-w-0">
                <span className="text-[12.5px] text-ink">{p.clave}</span>
                <span className="block text-[11.5px] text-faint">{p.detalle}</span>
              </span>
              {p.tiene
                ? <Estado tono="pos" clave="si">sí</Estado>
                : <Estado tono="nulo" clave="no"><Nulo>no</Nulo></Estado>}
            </li>
          ))}
        </ul>

        <ObrasYRutas rol={c.rol} obras={c.obras} />
      </Bloque>
    </div>
  )
}

/**
 * LO CONCRETO DEBAJO DE LO ABSTRACTO. «Permiso económico: no» no se entiende hasta que dice qué
 * pantallas no abre; «entra a todas las obras: no» no dice a cuáles sí.
 */
function ObrasYRutas({ rol, obras }: { rol: Rol | null; obras: string[] }) {
  const cerradas = rutasCerradasPara(rol)
  const todasLasObras = permisosDelRol(rol)[0].tiene

  return (
    <div className="mt-5 space-y-3 text-[12px] leading-relaxed text-muted">
      {!todasLasObras && (
        <p data-testid="obras-de-la-cuenta">
          <span className="text-faint">Obras a las que entra: </span>
          {obras.length === 0
            // ENTRA AL SISTEMA Y NO VE NINGUNA OBRA es un estado real y frecuente —una cuenta recién
            // creada—, y no es lo mismo que «no tiene acceso». Se dice.
            ? <span className="text-warn">ninguna todavía. Entra al sistema y no ve ninguna obra.</span>
            : obras.join(' · ')}
        </p>
      )}
      {cerradas.length > 0 && (
        <p data-testid="rutas-cerradas">
          <span className="text-faint">No abre: </span>
          <span className="font-mono text-[11.5px]">{cerradas.join(' · ')}</span>
        </p>
      )}
    </div>
  )
}
