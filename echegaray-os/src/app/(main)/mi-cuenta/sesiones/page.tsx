// SESIONES — desde dónde está abierta mi cuenta, y cerrar la que sobra.
//
// ═══ LA LISTA ES REAL (23/09/2026) ═══
//
// Hasta hoy se mostraba sólo la sesión actual: el listado vive en `auth.sessions` y la clave de
// servicio no entra en una pantalla personal. La puerta correcta son dos funciones de la base
// acotadas a `auth.uid()` (`mis_sesiones`, `cerrar_mi_sesion`, migración 20260923T2620): cada uno ve
// y cierra las suyas, y sólo las suyas. Lo que se muestra es lo que Supabase guarda por sesión
// —navegador, IP, última actividad, cuándo se abrió—; no se deduce ciudad ni nombre de aparato.
//
// «Cerrar todas» sigue siendo `signOut({ scope: 'global' })`: incluye ésta, y por eso confirma.

import { createClient } from '@/lib/supabase/server'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { CerrarSesiones } from '@/features/mi-cuenta/components/CerrarSesiones'
import { SesionesLista, type SesionVista } from '@/features/mi-cuenta/components/SesionesLista'
import { Aviso } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

/** El navegador y el sistema, sacados del `user-agent`. Lectura aproximada, rotulada como tal. */
function navegador(ua: string | null): string | null {
  if (!ua) return null
  const so = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iOS'
        : /Mac OS X/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : null
  const nav = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
      : /Chrome\//i.test(ua) ? 'Chrome'
        : /Firefox\//i.test(ua) ? 'Firefox'
          : /Safari\//i.test(ua) ? 'Safari' : null
  if (!nav && !so) return null
  return [nav, so].filter(Boolean).join(' · ')
}

function cuando(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

type Fila = { id: string; es_actual: boolean; creada_en: string; ultima_actividad: string; user_agent: string | null; ip: string | null; aal: string | null }

export default async function SesionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <MiCuentaShell titulo="Sesiones"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const { data, error } = await supabase.rpc('mis_sesiones')
  const sinMigracion = error?.code === '42883' || error?.code === 'PGRST202'
  const sesiones: SesionVista[] = ((data ?? []) as Fila[]).map((s) => ({
    id: s.id,
    esActual: Boolean(s.es_actual),
    equipo: navegador(s.user_agent),
    ip: s.ip,
    ultimaActividad: cuando(s.ultima_actividad),
    creada: cuando(s.creada_en),
    dosPasos: s.aal === 'aal2',
  }))

  return (
    <MiCuentaShell titulo="Sesiones" descripcion="Desde dónde está abierta tu cuenta.">
      {sinMigracion ? (
        <Aviso tono="warn" titulo="Todavía no se pueden listar las sesiones" testid="sesiones-sin-migracion">
          Falta aplicar la migración <code className="font-mono">20260923T2620_mis_sesiones_se_ven_y_se_cierran.sql</code>.
          Mientras tanto, «Cerrar todas» sigue funcionando.
        </Aviso>
      ) : error ? (
        <Aviso tono="neg" titulo="No pude leer tus sesiones">{error.message}</Aviso>
      ) : (
        <SesionesLista sesiones={sesiones} />
      )}

      <p className="mt-3 max-w-[820px] text-[11px] leading-relaxed text-faint">
        Una sesión cerrada no puede renovarse; si ese dispositivo estaba usando la app en ese momento,
        deja de poder a más tardar en una hora. Si sospechás de todas, cerrá todas.
      </p>

      <div className="mt-8 max-w-[460px] border-t border-line pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Cerrar todas las sesiones</div>
        <p className="mb-3 mt-1.5 text-[12px] leading-relaxed text-muted">
          Vas a tener que volver a entrar en cada dispositivo, incluido éste. Tus datos no se tocan.
        </p>
        <CerrarSesiones />
      </div>
    </MiCuentaShell>
  )
}
