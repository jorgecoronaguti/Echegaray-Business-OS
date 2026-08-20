import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Fila } from '@/features/empleado/components/Filas'
import { getMiAsistencia, getMiLegajo, getMisDocumentos, getMisRecibos } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { avisoDeDocumentos } from '@/features/empleado/services/documentos'
import { mesDe, mesLargo } from '@/features/empleado/services/fecha'
import { duracion, totalDelPeriodo } from '@/features/empleado/services/asistencia'

// «MI INFORMACIÓN» — una lista con su señal en cada renglón, no seis tarjetas gigantes.
//
// El handoff: «Lista plegable: Mi perfil · Mi legajo · Mis horas · Asistencia · Mis documentos ·
// Recibos, cada uno con su señal (2 documentos, 1 día sin salida). Sin cards gigantes».
//
// LA SEÑAL ES LO QUE HACE QUE ALGUIEN ENTRE. Un renglón sin señal es un renglón que se saltea; y una
// señal que siempre dice algo («al día», «todo en orden») deja de decir. Por eso cada una es `null`
// cuando no hay nada, y el renglón muestra en `faint` lo que hay adentro.

export const dynamic = 'force-dynamic'

export default async function MiInformacionPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mi información">
        <SinVinculo que="tu legajo, tus horas ni tus documentos" disponible={perfil.data?.vinculoDisponible !== false} />
        <div className="mt-6 border-t border-[#EFEEEA]">
          <Fila href="/mi-cuenta" testid="ir-perfil" titulo="Mi perfil" detalle="Foto, contacto y contraseña" />
        </div>
      </PantallaEmpleado>
    )
  }

  const hoy = await hoyISO()
  const mes = mesDe(hoy)
  const [legajo, docs, horas, asistencia, recibos] = await Promise.all([
    getMiLegajo(supabase),
    getMisDocumentos(supabase),
    getHorasPropias(supabase, mes.desde, mes.hasta),
    getMiAsistencia(supabase, mes.desde, mes.hasta),
    getMisRecibos(supabase),
  ])

  const hh = (horas.data ?? []).reduce((s, h) => s + h.horas, 0)
  const presencia = totalDelPeriodo(asistencia.data ?? [])
  const avisoDocs = avisoDeDocumentos(docs.data ?? [], hoy)
  const l = legajo.data

  return (
    <PantallaEmpleado
      titulo="Mi información"
      sub={
        l ? (
          <>
            <span className="block text-[15px] text-ink">{l.nombre_completo}</span>
            <span className="block text-faint">
              {l.categoria ?? l.puesto ?? 'sin categoría'}
              {l.fecha_ingreso ? ` · desde ${l.fecha_ingreso.slice(8, 10)}/${l.fecha_ingreso.slice(5, 7)}/${l.fecha_ingreso.slice(2, 4)}` : ''}
            </span>
          </>
        ) : undefined
      }
    >
      {legajo.error && <Aviso tono="neg" titulo="No se pudo leer tu legajo." testid="info-error">{legajo.error}</Aviso>}

      <div className="border-t border-[#EFEEEA]" data-testid="lista-mi-informacion">
        <Fila href="/mi-cuenta" testid="ir-perfil" titulo="Mi perfil" detalle="Foto, contacto y contraseña" />
        <Fila
          href="/mi-informacion/legajo"
          testid="ir-legajo"
          titulo="Mi legajo"
          detalle="Identidad, situación laboral y asignaciones"
        />
        <Fila
          href="/mi-informacion/horas"
          testid="ir-horas"
          titulo="Mis horas"
          detalle={mesLargo(hoy)}
          senal={horas.data ? `${hh.toFixed(2).replace('.', ',')} HH` : 'no se pudo leer'}
        />
        <Fila
          href="/mi-informacion/asistencia"
          testid="ir-asistencia"
          titulo="Asistencia"
          detalle={mesLargo(hoy)}
          senal={
            presencia.sinCerrar > 0
              ? `${presencia.sinCerrar} día${presencia.sinCerrar === 1 ? '' : 's'} sin salida`
              : duracion(presencia.minutos) ?? 'sin registrar'
          }
          senalTono={presencia.sinCerrar > 0 ? 'warn' : 'faint'}
        />
        <Fila
          href="/mi-informacion/documentos"
          testid="ir-documentos"
          titulo="Mis documentos"
          detalle={`${docs.data?.length ?? 0} en tu legajo`}
          senal={avisoDocs ?? undefined}
          senalTono="warn"
        />
        <Fila
          href="/mi-informacion/recibos"
          testid="ir-recibos"
          titulo="Recibos"
          detalle={
            recibos.data && recibos.data.length > 0
              ? `${recibos.data.length} recibo${recibos.data.length === 1 ? '' : 's'} en tu legajo`
              : 'todavía no hay recibos cargados'
          }
        />
      </div>
    </PantallaEmpleado>
  )
}
