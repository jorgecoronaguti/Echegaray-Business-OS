// NOTIFICACIONES — qué avisa el OS, por dónde, y qué quiero recibir.
//
// ═══ LOS INTERRUPTORES EXISTEN PORQUE EXISTE DÓNDE GUARDARLOS (23/09/2026) ═══
//
// Hasta hoy esta pantalla decía «elegirlo todavía no se puede»: no había tabla. Ahora la hay
// (`usuario_preferencia_notificacion`, migración 20260923T2610) y los emisores la consultan antes de
// mandar (`debeAvisar` en `orquestador/lib/notificaciones.mjs`). Apagar acá apaga de verdad; sin fila
// se avisa, así que un aviso nuevo llega hasta que alguien lo apague.
//
// El único canal con interruptor es el mensaje directo del bot: es el único por el que el OS le
// habla a una persona. El correo se dice como lo que es —sólo lo de la cuenta— y no tiene
// interruptor, porque no hay aviso que apagar por ahí.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { MiCuentaShell, Dato } from '@/features/mi-cuenta/components/MiCuentaShell'
import { PreferenciasAviso } from '@/features/mi-cuenta/components/PreferenciasAviso'
import { esCanal, esTipo, tiposPara, type Preferencia } from '@/features/mi-cuenta/services/notificaciones'
import { Aviso } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

export default async function NotificacionesPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Notificaciones"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>
  const { data: perfil } = await getPerfilActual(supabase, user.id)

  // Las propias, por RLS. Sin migración (42P01) la pantalla lo dice en vez de dibujar interruptores.
  const { data: filas, error } = await supabase
    .from('usuario_preferencia_notificacion').select('tipo, canal, activo')
  const prefs: Preferencia[] = (filas ?? [])
    .filter((f) => esTipo(f.tipo) && esCanal(f.canal))
    .map((f) => ({ tipo: f.tipo, canal: f.canal, activo: Boolean(f.activo) }))
  const sinTabla = error?.code === '42P01'

  return (
    <MiCuentaShell titulo="Notificaciones" descripcion="Qué te avisa el OS, por dónde, y cuáles querés recibir.">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Mensajes directos del bot</h2>
          {sinTabla ? (
            <Aviso tono="warn" titulo="Todavía no se puede elegir" testid="sin-preferencias">
              Falta aplicar la migración <code className="font-mono">20260923T2610_preferencias_de_aviso_por_usuario.sql</code>.
              Hasta entonces el OS avisa todo a todos.
            </Aviso>
          ) : error ? (
            <Aviso tono="neg">{error.message}</Aviso>
          ) : (
            <PreferenciasAviso tipos={tiposPara(perfil?.rol)} iniciales={prefs} />
          )}
          <p className="mt-3 max-w-[460px] text-[11.5px] leading-relaxed text-faint">
            Le llegan a tu usuario de Mattermost. Si no tenés uno atado a tu correo, el aviso de firma
            sale por el canal de Efectivo con tu mención.
          </p>
        </section>

        <section className="min-w-0">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Lo que no se elige</h2>
          <div className="border-t border-line">
            <Dato rotulo="Chat interno" ancho="w-[150px]">
              Los mensajes del canal de tu obra y lo que se ancle a una actividad o a un impedimento.
            </Dato>
            <Dato rotulo="Dentro del OS" ancho="w-[150px]">
              Los pendientes de la campanita y los reportes automáticos se publican adentro de la app.
            </Dato>
            <Dato rotulo="Tu correo" ancho="w-[150px]">
              Sólo lo de la cuenta: verificar un cambio de email y recuperar la contraseña. El OS no
              manda avisos por correo.
            </Dato>
          </div>
        </section>
      </div>
    </MiCuentaShell>
  )
}
