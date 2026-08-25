import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { hoyISO, leerDatosCampo } from '../datos'
import { puedeCargarParte } from '../permisos'
import { FormParte, type ActividadDelParte } from './FormParte'
import { ElegirObra, MarcoCampo } from '../marco'

// CARGAR EL PARTE DE HOY — el destino de la primaria de `/campo`.
//
// La pantalla se arma en el SERVIDOR hasta donde puede: quién sos, qué obras ves y qué actividades
// tiene la obra elegida. El cliente sólo decide qué campo mostrar según cómo se mide la actividad.
//
// La obra viaja en la URL (`?obra=`): así el enlace es compartible y volver atrás no pierde el paso.

export const dynamic = 'force-dynamic'

async function actividadesDe(obraId: string): Promise<{ actividades: ActividadDelParte[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('obra_actividad_control')
    .select('actividad_id, nombre, codigo, unidad, metodo_avance, tipo, archivada, orden')
    .eq('obra_id', obraId)
    .eq('archivada', false)
    .neq('tipo', 'resumen')
    .order('orden', { ascending: true })
  if (error) return { actividades: [], error: error.message }
  return {
    actividades: (data ?? []).map((a) => ({
      id: a.actividad_id as string,
      nombre: (a.nombre as string) ?? '',
      codigo: (a.codigo as string | null) ?? null,
      unidad: (a.unidad as string | null) ?? null,
      metodo: (a.metodo_avance as string) ?? 'manual',
    })),
    error: null,
  }
}

export default async function ParteCampoPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)

  if (!puedeCargarParte(perfil.data?.rol)) {
    return (
      <MarcoCampo titulo="Parte del día">
        <Aviso tono="warn" titulo="Tu usuario no puede cargar el parte.">
          Lo carga el jefe de obra. Material y herramientas sí:{' '}
          <Link href="/campo" className="underline">volver a Campo</Link>.
        </Aviso>
      </MarcoCampo>
    )
  }

  const { obras, error } = await leerDatosCampo(supabase)
  const pedida = (await searchParams).obra
  const obra = obras.length === 1 ? obras[0] : obras.find((o) => o.id === pedida) ?? null

  if (error && obras.length === 0) {
    return (
      <MarcoCampo titulo="Parte del día">
        <Aviso tono="neg" titulo="No se pudieron leer tus obras." testid="parte-error">
          {error}
        </Aviso>
      </MarcoCampo>
    )
  }

  if (!obra) {
    return (
      <MarcoCampo titulo="Parte del día">
        <ElegirObra obras={obras} hrefBase="/campo/parte" />
      </MarcoCampo>
    )
  }

  const { actividades, error: errorAct } = await actividadesDe(obra.id)

  // El `volver` de 44px lo pone `MarcoCampo` por defecto y va al mismo lugar: pasarle el `Volver`
  // del escritorio dejaba un objetivo de 16px de alto en la pantalla del andamio.
  return (
    <MarcoCampo titulo="Parte del día" subtitulo={obra.nombre}>
      {errorAct ? (
        <Aviso tono="neg" titulo="No se pudieron leer las actividades de la obra." testid="parte-error">
          {errorAct}
        </Aviso>
      ) : (
        <FormParte obraId={obra.id} obraNombre={obra.nombre} actividades={actividades} hoy={hoyISO()} />
      )}
    </MarcoCampo>
  )
}
