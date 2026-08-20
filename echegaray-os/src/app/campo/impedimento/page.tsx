import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { Aviso, Volver } from '@/shared/components/ds'
import { getActividadesDeObras } from '@/features/integraciones/services/operacionGlobalService'
import { hoyISO, leerDatosCampo } from '../datos'
import { puedeCargarParte } from '../permisos'
import { ElegirObra, MarcoCampo } from '../marco'
import { FormImpedimento } from './FormImpedimento'

// ANOTAR UN IMPEDIMENTO — la quinta fila de `/campo`.
//
// Escribe en `obra_restriccion` a través de `crearImpedimento`, la misma acción de la obra: mismo
// esquema, mismos campos obligatorios, misma tabla. Lo que se ve acá es sólo el formulario mínimo
// que entra en un teléfono.

export const dynamic = 'force-dynamic'

export default async function ImpedimentoCampoPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)

  if (!puedeCargarParte(perfil.data?.rol)) {
    return (
      <MarcoCampo titulo="Anotar impedimento">
        <Aviso tono="warn" titulo="Tu usuario no puede anotar impedimentos.">
          Los anota el jefe de obra, administración o dirección. Contale lo que está frenando el trabajo a tu jefe de
          obra, o pedí el material desde{' '}
          <Link href="/integraciones/pedidos-materiales" className="underline">
            Pedidos
          </Link>
          .
        </Aviso>
      </MarcoCampo>
    )
  }

  const { obras, error } = await leerDatosCampo(supabase)
  const pedida = (await searchParams).obra
  const obra = obras.length === 1 ? obras[0] : obras.find((o) => o.id === pedida) ?? null

  if (error && obras.length === 0) {
    return (
      <MarcoCampo titulo="Anotar impedimento">
        <Aviso tono="neg" titulo="No se pudieron leer tus obras." testid="impedimento-error">
          {error}
        </Aviso>
      </MarcoCampo>
    )
  }

  if (!obra) {
    return (
      <MarcoCampo titulo="Anotar impedimento">
        <ElegirObra obras={obras} hrefBase="/campo/impedimento" />
      </MarcoCampo>
    )
  }

  // Que no se puedan leer las actividades no impide anotar: el impedimento es de la OBRA, y colgarlo
  // de una actividad es opcional.
  const act = await getActividadesDeObras(supabase, [obra.id])
  const actividades = (act.data?.[obra.id] ?? []).map((a) => ({ id: a.id, nombre: a.nombre, codigo: a.codigo }))

  return (
    <MarcoCampo titulo="Anotar impedimento" subtitulo={obra.nombre} volver={<Volver href="/campo">Campo</Volver>}>
      <FormImpedimento obraId={obra.id} obraNombre={obra.nombre} actividades={actividades} hoy={hoyISO()} />
    </MarcoCampo>
  )
}
