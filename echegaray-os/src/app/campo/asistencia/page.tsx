import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { getJornadaDelDia } from '@/features/administracion/services/jornadaPorObraService'
import { hoyISO, leerDatosCampo } from '../datos'
import { puedeCargarParte } from '../permisos'
import { ElegirObra, MarcoCampo } from '../marco'
import { FormAsistencia } from './FormAsistencia'

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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `lunes 7 de septiembre`. Sin el día de la semana, «7 de septiembre» no ubica a nadie en la obra. */
function rotuloDelDia(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

const esFecha = (v: string | undefined): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')

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
  const fecha = esFecha(sp.dia) ? sp.dia : hoyISO()
  const { obras, error } = await leerDatosCampo(supabase)
  const obraId = sp.obra && obras.some((o) => o.id === sp.obra)
    ? sp.obra
    : obras.length === 1 ? obras[0].id : null

  if (!obraId) {
    return (
      <MarcoCampo titulo="Cargar asistencia" subtitulo={rotuloDelDia(fecha)}>
        {error && <Aviso tono="neg" titulo="No pude leer tus obras">{error}</Aviso>}
        <ElegirObra obras={obras} hrefBase={`/campo/asistencia?dia=${fecha}`} />
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
  return (
    <MarcoCampo
      titulo={obra.nombre}
      subtitulo={obra.jornada > 0
        ? `${rotuloDelDia(fecha)} · ${obra.jornada} hs de jornada`
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
      <FormAsistencia
        obraId={obra.id}
        obraNombre={obra.nombre}
        fecha={fecha}
        jornada={obra.jornada}
        filas={filas}
      />

      {obras.length > 1 && (
        <p className="mt-5 text-[12px] text-faint">
          Se carga por obra: quien cambió de obra se carga en la obra donde trabajó.{' '}
          <Link href={`/campo/asistencia?dia=${fecha}`} className="underline" data-testid="cambiar-obra">
            Cambiar de obra
          </Link>
        </p>
      )}
    </MarcoCampo>
  )
}
