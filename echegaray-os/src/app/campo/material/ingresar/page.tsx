import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { IngresarEnTelefono } from '@/features/materiales/components/IngresarEnTelefono'
import { puedeOperarMaterial } from '@/features/materiales/logica/stock'
import { MIGRACION_STOCK, leerStock } from '@/features/materiales/services/stockService'
import { MarcoCampo } from '../../marco'

// INGRESAR MATERIAL · TELÉFONO — la entrada sin pedido (stock inicial, compra directa), su propio segmento.
// Es del jefe de obra o de Administración (la base lo exige con `es_administracion()`); el lugar puede
// venir fijo en la query (`?lugar=`) cuando se entra desde el stock de una obra.

export const dynamic = 'force-dynamic'

export default async function IngresarCampoPage({ searchParams }: { searchParams: Promise<{ lugar?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const lugar = (await searchParams).lugar ?? ''
  const [stock, perfil] = await Promise.all([leerStock(supabase), getPerfilActual(supabase)])
  const puede = puedeOperarMaterial(perfil.data?.rol)
  const volver = (
    <Link href="/campo/material/stock" data-testid="volver" className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink">← Stock</Link>
  )
  return (
    <MarcoCampo titulo="Ingresar material" volver={volver}>
      {!puede && <Aviso tono="warn" titulo="Ingresar material es del jefe de obra o de Administración." testid="sin-permiso">Tu usuario sólo puede ver el stock.</Aviso>}
      {stock.estado === 'falta_migracion' && (
        <Aviso tono="warn" titulo="Todavía no hay stock por lugar." testid="falta-migracion-stock">Falta la migración {MIGRACION_STOCK}.</Aviso>
      )}
      {stock.estado === 'error' && <Aviso tono="neg" titulo="No se pudo leer el stock." testid="stock-error">{stock.mensaje}</Aviso>}
      {stock.estado === 'ok' && puede && <IngresarEnTelefono destinos={stock.destinos} lugarInicial={lugar} />}
    </MarcoCampo>
  )
}
