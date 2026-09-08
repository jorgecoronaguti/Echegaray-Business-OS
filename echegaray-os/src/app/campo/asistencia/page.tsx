import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { getJornadaDelDia } from '@/features/administracion/services/jornadaPorObraService'
import { hoyISO, leerDatosCampo } from '../datos'
// EL RÓTULO Y EL DÍA VIVEN UNA SOLA VEZ. Estaban acá como funciones privadas; cuando la misma
// carga apareció en Administración, copiarlas habría dejado dos definiciones de «qué día es hoy».
import { diaDeCarga, rotuloDelDia } from '@/features/administracion/services/diaDeJornada'
import { puedeCargarParte } from '../permisos'
import { ElegirObra, MarcoCampo } from '../marco'
import { CargaDelDia } from '@/features/administracion/components/asistencia/CargaDelDia'
import { getPresenciaDelDia } from '@/features/administracion/services/presenciaDelDiaService'
import { TraerALaObra } from '@/features/administracion/components/asistencia/TraerALaObra'
import { getCandidatosParaTraer } from '@/features/administracion/services/jornadaPorObraService'
import { puedeCambiarObraActual } from '@/features/administracion/services/planDeObraActual'

// 01 · EL JEFE, EN LA OBRA. Una obra, un día, las horas de cada uno.
//
// Mismo marco, mismos permisos y misma forma que `/campo/parte`: la obra viaja en la URL para que el
// enlace sea compartible y volver atrás no pierda el paso, y el día también — así se puede cargar el
// viernes lo del jueves sin pelearse con un calendario.
//
// ═══ EL PERMISO NO SE DECIDE ACÁ ═══
//
// `puedeCargarParte` evita ofrecerle a un operario un botón que va a rebotar. Quien decide de verdad
// es la RLS de `registros_hh` y la de `obra_canonica`: aunque alguien llame la acción directamente,
// la base rechaza lo que no le corresponde.

export const dynamic = 'force-dynamic'

export default async function AsistenciaCampoPage({ searchParams }: {
  searchParams: Promise<{ obra?: string; dia?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)

  if (!puedeCargarParte(perfil.data?.rol)) {
    return (
      <MarcoCampo titulo="Cargar asistencia">
        <Aviso tono="warn" titulo="Tu usuario no puede cargar la asistencia.">
          La carga el jefe de obra. Lo tuyo está en{' '}
          <Link href="/campo" className="underline">Campo</Link>.
        </Aviso>
      </MarcoCampo>
    )
  }

  const sp = await searchParams
  const fecha = diaDeCarga(sp.dia, hoyISO())
  const { obras, error } = await leerDatosCampo(supabase)
  const obraId = sp.obra && obras.some((o) => o.id === sp.obra)
    ? sp.obra
    : obras.length === 1 ? obras[0].id : null

  if (!obraId) {
    return (
      <MarcoCampo titulo="Cargar asistencia" subtitulo={rotuloDelDia(fecha)}>
        {error && <Aviso tono="neg" titulo="No pude leer tus obras">{error}</Aviso>}
        {/* SIN `?dia=` EN LA BASE. `ElegirObra` arma `${hrefBase}?obra=…`, así que pasarle una URL
            que YA tiene `?` producía `/campo/asistencia?dia=2026-09-07?obra=quattropani`: el segundo
            `?` es un carácter más del valor de `dia`, `obra` nunca llega, y tocar una obra de la
            lista devolvía la misma lista. Medido en el error-context de Playwright del 07/09.
            El día se conserva sólo cuando NO es hoy — que es cuando alguien lo eligió a propósito. */}
        <ElegirObra obras={obras} hrefBase="/campo/asistencia" />
      </MarcoCampo>
    )
  }

  const jornada = await getJornadaDelDia(supabase, obraId, fecha)
  if (jornada.error || !jornada.data) {
    return (
      <MarcoCampo titulo="Cargar asistencia" subtitulo={rotuloDelDia(fecha)}>
        {/* UNA LISTA VACÍA PORQUE LA RLS RECHAZÓ LA CONSULTA es indistinguible de una obra sin
            gente, y la diferencia entre las dos es todo. El error se muestra con su texto. */}
        <Aviso tono="neg" titulo="No pude leer la jornada">
          {jornada.error ?? 'Esa obra no existe o no la ves.'}
        </Aviso>
      </MarcoCampo>
    )
  }

  const { obra, filas } = jornada.data
  // MISMO GESTO QUE EN EL TELÉFONO DE ADMINISTRACIÓN, MISMO COMPONENTE. Acá es donde el jefe de obra
  // está de verdad a las 7 de la mañana: si «traer a alguien» viviera sólo en la otra ruta, la
  // decisión del dueño quedaría a medias. El rol lo decide `puedeCambiarObraActual` — el jefe sí,
  // `campo` no, y quien no puede no ve el botón.
  const puedeTraer = puedeCambiarObraActual(perfil.data?.rol)
  const candidatos = puedeTraer
    ? await getCandidatosParaTraer(supabase, obra.id, fecha)
    : { data: [], error: null }
  // Sin filtro de obra: el único de `asistencia_dia` es (persona, fecha) — ver `BloqueAsistenciaDia`.
  const presencia = await getPresenciaDelDia(supabase, fecha, null)
  return (
    <MarcoCampo
      titulo={obra.nombre}
      subtitulo={obra.jornada > 0
        ? `${rotuloDelDia(fecha)} · ${hs(obra.jornada)} hs de jornada`
        // NO SE INVENTA UNA JORNADA. Sin `jornada_horas` la casilla nace vacía y se tipea: un 8
        // escrito acá sería una afirmación sobre el contrato de esa obra que nadie hizo.
        : `${rotuloDelDia(fecha)} · esta obra no tiene jornada pactada cargada`}
      volver={
        <Link
          href="/campo"
          data-testid="volver"
          className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink"
        >
          ← Campo
        </Link>
      }
    >
      {/* PRESENCIA PRIMERO: es lo que el jefe sabe a las 7:30 y lo que el dueño pidió que no
          costara resolver una cuenta. Las horas siguen enteras, un toque más allá. */}
      <CargaDelDia
        obraId={obra.id}
        obraNombre={obra.nombre}
        fecha={fecha}
        jornada={obra.jornada}
        filas={filas}
        presencia={presencia.data ?? []}
      />

      {puedeTraer && (
        <TraerALaObra
          obraId={obra.id}
          obraNombre={obra.nombre}
          candidatos={candidatos.data}
          error={candidatos.error}
        />
      )}

      {obras.length > 1 && (
        <p className="mt-5 text-[12px] text-faint">
          Se carga por obra: quien cambió de obra se carga en la obra donde trabajó.{' '}
          <Link href={`/campo/asistencia?dia=${fecha}`} className="inline-flex min-h-[44px] items-center underline" data-testid="cambiar-obra">
            Cambiar de obra
          </Link>
        </p>
      )}
    </MarcoCampo>
  )
}
