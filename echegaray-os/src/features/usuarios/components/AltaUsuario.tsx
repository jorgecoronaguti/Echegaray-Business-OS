'use client'

// EL ALTA DE UNA CUENTA — el mismo panel lateral, con el formulario en blanco.
//
// ═══ POR QUÉ NO USA `FormAccion` COMO EL RESTO ═══
//
// `FormAccion` sabe decir «guardado» y sabe mostrar el error. Acá el resultado del alta ES un dato
// —la clave temporal— que se muestra UNA vez y no se puede recuperar: si se pierde, hay que
// resetearla. Un formulario que contesta «guardado» y se olvida de la clave deja una cuenta creada a
// la que no puede entrar nadie.
//
// No se manda mail: `inviteUserByEmail` necesita SMTP configurado y hoy no lo está. Una invitación
// que no llega es peor que ninguna, porque nadie se entera de que no llegó.
//
// El bloque que muestra la credencial vive en `Credencial.tsx`: lo comparte con la regeneración de
// contraseña del panel, que es el mismo hecho —una clave recién generada que hay que pasarle a una
// persona— y no puede decir dos cosas distintas según por dónde se haya llegado.

import { useActionState } from 'react'
import { Campo, CTRL } from '@/shared/components/ui'
import { Boton } from '@/shared/components/ds'
import { ROL_LABEL } from '@/features/auth/types'
import { AREA_LABEL } from '@/features/auth/types/areas'
import { ROLES_DE_AREA } from '../services/reglas'
import { crearUsuario, type ResultadoAlta } from '../services/usuariosActions'
import { Credencial } from './Credencial'

const INICIAL: ResultadoAlta = { ok: false }

export function AltaUsuario({ alCerrar }: { alCerrar: () => void }) {
  const [estado, crear, creando] = useActionState(crearUsuario, INICIAL)

  // NO USA `PanelDetalle` DEL DESIGN SYSTEM, y no es por gusto: su botón de cierre lleva el
  // identificador de prueba `panel-cerrar`, fijo, y el recorrido `tests/usuarios-gestion.spec.ts`
  // cierra este panel por `cerrar-alta`. Adoptar el componente renombraría el control desde adentro
  // y rompería un recorrido que hoy está verde, sin que este bloque pueda tocar ese archivo. Se
  // repite la ANATOMÍA del panel del DS —cabecera 16/600 + ✕, hoja en el teléfono, columna en
  // escritorio— y se deja anotado el cambio pendiente.
  return (
    <>
      <button
        type="button" aria-label="Cerrar el panel" onClick={alCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid="panel-alta"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4 lg:static lg:z-auto lg:max-h-none lg:w-[340px] lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:p-0 lg:pl-6"
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <div className="flex items-baseline gap-2.5">
          <h2 className="min-w-0 flex-1 text-[16px] font-semibold text-ink">Invitar usuario</h2>
          <button
            type="button" onClick={alCerrar} data-testid="cerrar-alta" aria-label="Cerrar el panel"
            className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
          >✕</button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Se crea con una clave temporal que hay que pasarle a la persona.
        </p>
        <div className="mt-4">
      <form action={crear} data-testid="form-alta">
        <div className="grid grid-cols-2 gap-2.5">
          <Campo label="Nombre" ancho="col-span-2">
            <input name="nombre" required minLength={2} maxLength={80} className={CTRL} placeholder="Nombre y apellido" />
          </Campo>
          <Campo label="Correo" ancho="col-span-2" ayuda="Es con lo que entra al sistema.">
            <input name="email" type="email" required className={CTRL} placeholder="persona@ecsas.com.ar" />
          </Campo>
          <Campo label="Nivel" ancho="col-span-2" ayuda="Administración ve todo; Obras, sólo lo que se le asigne.">
            <select name="rol" defaultValue="jefe_obra" className={CTRL}>
              {(['administracion', 'obras'] as const).map((area) => (
                <optgroup key={area} label={AREA_LABEL[area]}>
                  {ROLES_DE_AREA[area].map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                </optgroup>
              ))}
            </select>
          </Campo>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Boton type="submit" variante="primaria" disabled={creando} data-testid="crear-usuario">
            {creando ? 'Creando…' : 'Crear cuenta'}
          </Boton>
          {/* EL ERROR DEL SERVIDOR SE MUESTRA SIEMPRE, tal como llegó. Un formulario que se limpia y
              no dice nada hace creer que se creó una cuenta que no existe. */}
          {estado.error && <span data-testid="error-alta" className="text-[12px] text-neg">{estado.error}</span>}
        </div>
      </form>

      {estado.ok && estado.email && estado.clave && (
        <div className="mt-4">
          <Credencial email={estado.email} clave={estado.clave} titulo="Cuenta creada. Pasale estos datos:" />
        </div>
      )}
        </div>
      </aside>
    </>
  )
}
