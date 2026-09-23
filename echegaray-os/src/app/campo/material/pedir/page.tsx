import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { FormPedirMaterial } from '@/features/materiales/components/FormPedirMaterial'
import { HREF_MATERIAL_TELEFONO, hrefPedirTelefono } from '@/features/materiales/logica/pedidos'
import { leerDatosCampo } from '../../datos'
import { ElegirObra, MarcoCampo } from '../../marco'

// PEDIR MATERIAL · TELÉFONO — un formulario por pantalla, la obra ya elegida, la primaria abajo.
//
// La obra viaja en la URL (`?obra=`) como en el parte: el enlace se comparte y volver atrás no pierde
// el paso. Con una sola obra no se pregunta. La escritura es `pedir_material` en la base, la misma
// que usa el panel de la computadora.

export const dynamic = 'force-dynamic'

export default async function PedirMaterialCampoPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const { obras, error } = await leerDatosCampo(supabase)
  const pedida = (await searchParams).obra
  const obra = obras.length === 1 ? obras[0] : obras.find((o) => o.id === pedida) ?? null
  const volver = (
    <Link href={HREF_MATERIAL_TELEFONO} data-testid="volver" className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink">
      ← Material
    </Link>
  )

  if (error && obras.length === 0) {
    return (
      <MarcoCampo titulo="Pedir material" volver={volver}>
        <Aviso tono="neg" titulo="No se pudieron leer tus obras." testid="pedir-error">
          {error}
        </Aviso>
      </MarcoCampo>
    )
  }

  if (!obra) {
    return (
      <MarcoCampo titulo="Pedir material" volver={volver}>
        <ElegirObra obras={obras} hrefBase={hrefPedirTelefono()} />
      </MarcoCampo>
    )
  }

  return (
    <MarcoCampo titulo="Pedir material" subtitulo={obra.nombre} volver={volver}>
      <FormPedirMaterial obras={obras} obraFija={obra} cara="telefono" />
      <p className="mt-2 text-center">
        <Link
          href={`${HREF_MATERIAL_TELEFONO}?obra=${encodeURIComponent(obra.id)}`}
          className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] text-muted underline"
          data-testid="ver-lo-pedido"
        >
          Ver lo pedido
        </Link>
      </p>
    </MarcoCampo>
  )
}
