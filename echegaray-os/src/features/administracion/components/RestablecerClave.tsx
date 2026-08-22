'use client'

// EL BOTÓN QUE DEVUELVE UNA CLAVE — la única parte de la solapa que no puede ser de servidor.
//
// Todo lo demás de «Usuario y permisos» se dibuja en el servidor. Esto no: la acción devuelve una
// contraseña que hay que MOSTRAR una vez y que no se guarda en ningún lado, así que el resultado
// tiene que quedar en el estado del cliente. Es la misma isla que ya vive en `PanelUsuario`, y por
// eso reusa `Credencial` en vez de dibujar otra caja verde con otro texto que se va separando.
//
// EL BOTÓN SE ESCONDE PARA QUIEN NO PUEDE, Y ESO NO ES LA CERRADURA: `regenerarClave` vuelve a
// preguntar quién llama contra la cookie, y exige Dirección. Acá se esconde para no ofrecer algo que
// va a rebotar —un botón que rebota es peor que uno que no está— y se dice POR QUÉ.

import { useState, useTransition } from 'react'
import { Eyebrow } from '@/shared/components/ds'
import { Credencial } from '@/features/usuarios/components/Credencial'
import { restablecerClaveDePersona } from '../services/accesoActions'
import type { ResultadoClave } from '@/features/usuarios/services/usuariosActions'

export function RestablecerClave({ personaId, impedimento }: { personaId: string; impedimento: string | null }) {
  const [resultado, setResultado] = useState<ResultadoClave | null>(null)
  const [enCurso, empezar] = useTransition()

  return (
    <section data-testid="ficha-contrasena">
      <Eyebrow className="mb-2">Contraseña</Eyebrow>
      {impedimento ? (
        <p className="text-[12px] text-muted" data-testid="ficha-clave-sin-permiso">{impedimento}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={enCurso}
              data-testid="restablecer-clave"
              onClick={() => empezar(async () => setResultado(await restablecerClaveDePersona(personaId)))}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              {enCurso ? 'Generando…' : 'Restablecer contraseña'}
            </button>
            <span className="text-[11px] text-faint">La de ahora deja de servir.</span>
          </div>
          {resultado && !resultado.ok && (
            <p className="mt-1.5 text-[12px] text-neg" data-testid="ficha-error-clave">{resultado.error}</p>
          )}
          {resultado?.ok && (
            <div className="mt-2">
              <Credencial
                email={resultado.email}
                clave={resultado.clave}
                testid="ficha-credencial"
                titulo="Contraseña nueva. Pasale estos datos:"
                aviso={resultado.sinAcceso
                  ? 'Ojo: esta cuenta está bloqueada. La clave nueva no le va a servir hasta que le devuelvas el acceso.'
                  : null}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
