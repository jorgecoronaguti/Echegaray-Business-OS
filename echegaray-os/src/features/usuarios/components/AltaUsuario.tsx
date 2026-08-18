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
import { ROL_LABEL } from '@/features/auth/types'
import { AREA_LABEL } from '@/features/auth/types/areas'
import { ROLES_DE_AREA } from '../services/reglas'
import { crearUsuario, type ResultadoAlta } from '../services/usuariosActions'
import { Credencial } from './Credencial'

const INICIAL: ResultadoAlta = { ok: false }

export function AltaUsuario({ alCerrar }: { alCerrar: () => void }) {
  const [estado, crear, creando] = useActionState(crearUsuario, INICIAL)

  return (
    <>
      <button
        type="button" aria-label="Cerrar el panel" onClick={alCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid="panel-alta"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface-quiet p-3.5 shadow-pop lg:sticky lg:top-16 lg:z-auto lg:max-h-none lg:w-[340px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Nueva cuenta</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Se crea con una clave temporal que hay que pasarle a la persona.
            </p>
          </div>
          <button
            type="button" onClick={alCerrar} data-testid="cerrar-alta"
            className="shrink-0 rounded-control border border-line px-2 py-1 text-[12px] text-muted hover:bg-surface-sunken"
          >
            Cerrar
          </button>
        </header>

        <form action={crear} data-testid="form-alta">
          <div className="grid grid-cols-2 gap-2.5">
            <Campo label="Nombre" ancho="col-span-2">
              <input name="nombre" required minLength={2} maxLength={80} className={CTRL} placeholder="Nombre y apellido" />
            </Campo>
            <Campo label="Correo" ancho="col-span-2">
              <input name="email" type="email" required className={CTRL} placeholder="persona@ecsas.com.ar" />
            </Campo>
            <Campo label="Rol" ancho="col-span-2" ayuda="Administración ve todo; Obras, sólo lo que se le asigne.">
              <select name="rol" defaultValue="jefe_obra" className={CTRL}>
                {(['administracion', 'obras'] as const).map((area) => (
                  <optgroup key={area} label={AREA_LABEL[area]}>
                    {ROLES_DE_AREA[area].map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                  </optgroup>
                ))}
              </select>
            </Campo>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit" disabled={creando} data-testid="crear-usuario"
              className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {creando ? 'Creando…' : 'Crear cuenta'}
            </button>
            {estado.error && <span data-testid="error-alta" className="text-[12px] text-neg">{estado.error}</span>}
          </div>
        </form>

        {estado.ok && estado.email && estado.clave && (
          <div className="mt-3">
            <Credencial email={estado.email} clave={estado.clave} titulo="Cuenta creada. Pasale estos datos:" />
          </div>
        )}
      </aside>
    </>
  )
}
