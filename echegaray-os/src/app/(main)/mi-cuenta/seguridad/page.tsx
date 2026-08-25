// SEGURIDAD — la contraseña, los dos pasos, y qué sabe el sistema de mi acceso.
//
// ═══ LO QUE NO SE SABE, NO SE INVENTA ═══
//
// El handoff pide «Contraseña · última vez cambiada el 04/02/2026». Ese dato NO EXISTE: Supabase
// Auth no guarda cuándo se cambió la contraseña. Lo más parecido es `updated_at`, que se mueve con
// cualquier modificación del usuario —un cambio de email, un dato de metadata— y presentarlo como
// «última vez que cambiaste la contraseña» sería una inferencia disfrazada de hecho. Se escribe lo
// que sí es cierto: la última vez que entró, que es un dato real y sirve para lo mismo (¿alguien
// entró a mi cuenta cuando yo no estaba?).
//
// «Email de recuperación» tampoco existe como concepto separado en este sistema: la recuperación va
// al email de acceso. Se dice, en vez de dibujar un campo que no guarda nada.
//
// ═══ LOS DOS PASOS SE LEEN DE VERDAD ═══
//
// `user.factors` viene en el objeto de sesión: si hay un factor verificado, está activo. No se
// asume ni se pregunta aparte.
//
// ═══ ÉSTA ES LA ÚNICA PANTALLA QUE LE PREGUNTA AL SERVIDOR DE AUTH (25/08/2026) ═══
//
// El resto del OS resuelve «quién sos» verificando la firma del JWT en el proceso
// (`getUsuarioActual`), sin viaje de red. Acá no alcanza: `factors`, `last_sign_in_at` y
// `email_confirmed_at` NO viajan en el token — son estado del servidor de Auth, no de la sesión.
// Y es justo donde el viaje se justifica: una pantalla que afirma «tu cuenta tiene dos pasos» no
// puede contestar con lo que el navegador trajo.

import { createClient } from '@/lib/supabase/server'
import { MiCuentaShell, Dato } from '@/features/mi-cuenta/components/MiCuentaShell'
import { CambiarContrasena } from '@/features/mi-cuenta/components/CambiarContrasena'
import { Aviso, Estado, Nulo, Num } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

/** `2026-08-20T14:32:00Z` → `20/08/26 14:32`, en hora de Argentina. */
function cuando(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export default async function SeguridadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <MiCuentaShell titulo="Seguridad"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const factores = user.factors ?? []
  const dosPasos = factores.some((f) => f.status === 'verified')
  const ultimoIngreso = cuando(user.last_sign_in_at)
  const emailConfirmado = Boolean(user.email_confirmed_at)

  return (
    <MiCuentaShell titulo="Seguridad" descripcion="Con qué entrás y qué protege tu cuenta.">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Acceso</h2>
          <div className="border-t border-line">
            <Dato rotulo="Email de acceso">
              <span className="break-all font-mono text-[12.5px]">{user.email ?? 'sin email'}</span>
              {!emailConfirmado && (
                <span className="ml-2 text-[11.5px] text-warn">sin confirmar</span>
              )}
            </Dato>
            <Dato rotulo="Última vez que entraste">
              {ultimoIngreso ? <Num>{ultimoIngreso}</Num> : <Nulo>sin registro</Nulo>}
            </Dato>
            <Dato rotulo="Contraseña">
              {/* Se dice lo que NO se sabe. Un «cambiada hace 3 meses» inventado le daría a alguien
                  la falsa tranquilidad de que la rotó cuando quizás nunca la tocó. */}
              <Nulo>el sistema no registra cuándo se cambió</Nulo>
            </Dato>
            <Dato rotulo="Verificación en dos pasos">
              {dosPasos
                ? <Estado tono="pos">Activa</Estado>
                : <span className="text-[12.5px] text-warn">sin activar</span>}
            </Dato>
            <Dato rotulo="Recuperar la contraseña">
              <span className="text-[12.5px] text-muted">
                Va al email de acceso. No hay un email de recuperación aparte.
              </span>
            </Dato>
          </div>

          <div className="mt-7">
            <CambiarContrasena />
          </div>
        </section>

        <section className="min-w-0 space-y-5">
          {!dosPasos && (
            <Aviso tono="warn" titulo="Tu cuenta entra sólo con contraseña" testid="sin-dos-pasos">
              La verificación en dos pasos todavía no está habilitada en el OS. Cuando lo esté, se
              activa desde acá. Mientras tanto, lo que protege la cuenta es que la contraseña no se
              comparta y no se repita en otro lado.
            </Aviso>
          )}
          <div>
            <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Acceso desde el teléfono</h2>
            <p className="max-w-[460px] text-[12.5px] leading-relaxed text-muted">
              Es la misma cuenta: se entra con el mismo email y la misma contraseña desde el navegador
              del teléfono. No hay una credencial de campo aparte que se pueda revocar por separado —
              cerrar todas las sesiones cierra también la del teléfono.
            </p>
          </div>
        </section>
      </div>
    </MiCuentaShell>
  )
}
