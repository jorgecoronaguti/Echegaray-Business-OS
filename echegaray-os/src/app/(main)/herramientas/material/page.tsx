import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { Filtros } from '@/shared/components/ds'
import { Aviso } from '@/shared/components/ds'
import { NavHerramientas } from '@/features/herramientas/components/NavHerramientas'
import { bajadaPagina, pagina, tituloPagina } from '@/features/herramientas/components/estilo'
import { MaterialEscritorio } from '@/features/materiales/components/MaterialEscritorio'
import { FiltroObra } from '@/features/materiales/components/FiltroObra'
import { StockEscritorio } from '@/features/materiales/components/StockEscritorio'
import { ListaRemitos } from '@/features/materiales/components/ListaRemitos'
import { SOLAPAS_MATERIAL, puedeOperarMaterial, solapaDeUrl } from '@/features/materiales/logica/stock'
import { MIGRACION_STOCK, leerStock } from '@/features/materiales/services/stockService'
import { filtrarPedidos, filtroEstadoDeUrl, type Filtro } from '@/features/materiales/logica/pedidos'
import { MIGRACION, leerMaterial } from '@/features/materiales/services/pedidosService'

// MATERIAL · COMPUTADORA — solapa de Herramientas (dueño, 23/09/2026): «tenés que crear toda una
// sección de Material unida a la experiencia mobile, en computadora, en módulo Herramientas».
//
// Es la MISMA lista que el teléfono (`/campo/material`) sin acotar por obra, para administrar: filtrar
// por obra y estado, mover el estado, y pedir desde el panel lateral. Un solo módulo, un solo
// nombre, en las dos caras. `/integraciones/pedidos-materiales` redirige acá.
//
// No monta `Marco` de Herramientas a propósito: ese marco lee el parque entero (activos, ubicaciones,
// movimientos…) para dibujar sus paneles, y esta pantalla no lo necesita. El nivel 2 es el mismo
// `NavHerramientas`; el contador de Mantenimiento no se dibuja porque no se leyó (sin lectura no hay
// contador).

export const dynamic = 'force-dynamic'

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

export default async function MaterialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const filtro: Filtro = { obra: uno(sp.obra), estado: filtroEstadoDeUrl(uno(sp.estado)) }
  const supabase = await createClient()
  const solapa = solapaDeUrl(uno(sp.ver))
  const [lectura, stock, perfil] = await Promise.all([leerMaterial(supabase), leerStock(supabase), getPerfilActual(supabase)])
  const puedeOperar = puedeOperarMaterial(perfil.data?.rol)

  const obras = lectura.estado === 'ok' ? lectura.obras : []
  const pedidos = lectura.estado === 'ok' ? filtrarPedidos(lectura.pedidos, filtro) : []
  const total = lectura.estado === 'ok' ? lectura.pedidos.length : 0

  return (
    <div className="min-h-[calc(100vh-48px)] bg-surface text-ink">
      <NavHerramientas
        cuentas={{ mantenimiento: null }}
        derecha={lectura.estado === 'ok' && solapa === 'pedidos' ? <FiltroObra obras={obras} filtro={filtro} /> : undefined}
      />
      <div style={pagina}>
        <div className="flex flex-col gap-1.5">
          <div style={tituloPagina} data-testid="titulo-material">Material</div>
          <div style={bajadaPagina}>Lo que pidió cada obra, cuánto llegó y qué hay en cada lugar.</div>
        </div>
        <Filtros
          testid="solapas-material"
          opciones={SOLAPAS_MATERIAL.map((s) => ({
            label: s.label, href: s.id === 'pedidos' ? '/herramientas/material' : `/herramientas/material?ver=${s.id}`,
            activo: s.id === solapa, testid: `solapa-${s.id}`,
          }))}
        />

        {lectura.estado === 'falta_migracion' && (
          <Aviso tono="warn" titulo={`El módulo espera la migración ${MIGRACION}`} testid="falta-migracion">
            Las columnas del pedido desde la app todavía no existen en la base. Hasta que se aplique, los pedidos
            se siguen leyendo en la ficha de cada obra (Operación › Pedidos).
          </Aviso>
        )}
        {lectura.estado === 'error' && (
          <Aviso tono="neg" titulo="No se pudieron leer los pedidos." testid="page-error">
            {lectura.mensaje}
          </Aviso>
        )}
        {solapa !== 'pedidos' && stock.estado === 'falta_migracion' && (
          <Aviso tono="warn" titulo={`El stock espera la migración ${MIGRACION_STOCK}`} testid="falta-migracion-stock">
            Hasta que se aplique no hay saldo por lugar ni remitos.
          </Aviso>
        )}
        {solapa !== 'pedidos' && stock.estado === 'error' && (
          <Aviso tono="neg" titulo="No se pudo leer el stock." testid="stock-error">{stock.mensaje}</Aviso>
        )}
        {solapa === 'stock' && stock.estado === 'ok' && (
          <StockEscritorio lugares={stock.lugares} existencias={stock.existencias} destinos={stock.destinos} remitos={stock.remitos} puedeOperar={puedeOperar} />
        )}
        {solapa === 'remitos' && stock.estado === 'ok' && <ListaRemitos remitos={stock.remitos} cara="escritorio" />}
        {solapa === 'pedidos' && lectura.estado === 'ok' && <MaterialEscritorio pedidos={pedidos} total={total} filtro={filtro} obras={obras} abrirAlEntrar={uno(sp.pedir) === '1'}
          puedeOperar={puedeOperar && lectura.conStock} destinos={stock.estado === 'ok' ? stock.destinos : []} />}
      </div>
    </div>
  )
}
