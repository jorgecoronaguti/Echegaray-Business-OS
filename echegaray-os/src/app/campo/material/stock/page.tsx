import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { StockPorLugar } from '@/features/materiales/components/StockPorLugar'
import { HREF_MATERIAL_TELEFONO } from '@/features/materiales/logica/pedidos'
import { puedeOperarMaterial } from '@/features/materiales/logica/stock'
import { MIGRACION_STOCK, leerStock } from '@/features/materiales/services/stockService'
import { MarcoCampo } from '../../marco'

// STOCK POR LUGAR · TELÉFONO — qué hay en mis obras (y en el Taller si me toca verlo). Detalle de una
// sección = pantalla propia. Qué filas vuelven lo deciden las policies: el operario ve el saldo de su obra
// y ningún botón; el jefe y Administración pueden marcar «Usé», contar y mandar sobrante.

export const dynamic = 'force-dynamic'

export default async function StockCampoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const [stock, perfil] = await Promise.all([leerStock(supabase), getPerfilActual(supabase)])
  const volver = (
    <Link href={HREF_MATERIAL_TELEFONO} data-testid="volver" className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink">← Material</Link>
  )
  return (
    <MarcoCampo titulo="Stock" volver={volver}>
      {stock.estado === 'falta_migracion' && (
        <Aviso tono="warn" titulo="Todavía no hay stock por lugar." testid="falta-migracion-stock">Falta la migración {MIGRACION_STOCK}.</Aviso>
      )}
      {stock.estado === 'error' && <Aviso tono="neg" titulo="No se pudo leer el stock." testid="stock-error">{stock.mensaje}</Aviso>}
      {stock.estado === 'ok' && puedeOperarMaterial(perfil.data?.rol) && (
        <Link href="/campo/material/ingresar" data-testid="ingresar-material"
          className="flex min-h-[48px] w-full items-center justify-center rounded-control border border-line-strong text-[14px] font-semibold text-ink">
          + Ingresar material sin pedido
        </Link>
      )}
      {stock.estado === 'ok' && (
        <StockPorLugar lugares={stock.lugares} existencias={stock.existencias} puedeOperar={puedeOperarMaterial(perfil.data?.rol)} cara="telefono" destinos={stock.destinos} />
      )}
    </MarcoCampo>
  )
}
