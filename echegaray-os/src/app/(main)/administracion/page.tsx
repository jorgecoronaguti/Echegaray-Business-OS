// ADMINISTRACIÓN — LA ENTRADA DEL ÁREA.
//
// El dueño, textual (18/08): *"No quiero un dashboard administrativo lleno de KPIs. Priorizar
// navegación hacia objetos reales"*, y la forma que pidió:
//
//     Administración
//     Clientes
//     Obras
//     ────────────────────
//     Pedidos de materiales
//     Herramientas
//     Movimientos
//
// ═══ POR QUÉ ESTA PANTALLA NO TIENE UN SOLO NÚMERO GRANDE ═══
//
// Un dashboard de entrada obliga a leer antes de poder ir a ningún lado, y lo que muestra es siempre
// el promedio de todo — que no es la pregunta de nadie. Las dos primeras líneas son las ENTIDADES del
// negocio (un cliente, una obra) y las tres de abajo son los procesos operativos que ya existen y que
// hasta hoy vivían arriba de todas las pantallas, en la navegación global.
//
// Los contadores que sí aparecen son de NAVEGACIÓN, no de gestión: dicen cuánto hay del otro lado
// para que nadie entre a una lista vacía sin saberlo. Salen de las mismas vistas que las pantallas
// destino, así que no pueden discrepar con ellas.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/clientes/services/clientesService'
import { getPortafolio } from '@/features/obras/services/obrasService'
import { PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

/** Una línea de la lista. El contador va a la derecha, tenue: es contexto, no el título. */
function Entrada({ href, titulo, detalle, cuenta, testid }: {
  href: string; titulo: string; detalle: string; cuenta?: string; testid: string
}) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className="group flex items-baseline gap-3 border-b border-line/70 px-4 py-3.5 last:border-0 hover:bg-surface-quiet"
    >
      <span className="text-[15px] font-medium text-ink group-hover:underline">{titulo}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-faint">{detalle}</span>
      {cuenta && <span className="shrink-0 text-[12px] tabular-nums text-muted">{cuenta}</span>}
    </Link>
  )
}

export default async function AdministracionPage() {
  const supabase = await createClient()
  // Las dos lecturas van en paralelo: son independientes y encadenarlas sólo suma latencia.
  const [clientes, obras] = await Promise.all([getClientes(supabase), getPortafolio(supabase)])
  const cs = clientes.data ?? []
  const os = obras.data ?? []
  const obrasActivas = os.filter((o) => o.etapa !== 'cierre' && o.estado !== 'archivada')

  return (
    <PageShell
      title="Administración"
      subtitle="Lo que se administra desde acá, sin tocar la base de datos."
      maxWidth="max-w-3xl"
    >
      <nav className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="admin-entidades">
        <Entrada
          href="/clientes" testid="ir-clientes" titulo="Clientes"
          detalle="Información, contactos, documentos de Drive y sus obras"
          cuenta={cs.length ? `${cs.length}` : undefined}
        />
        <Entrada
          href="/obras" testid="ir-obras" titulo="Obras"
          detalle="Todas las obras: cronograma, personal, economía y contrato"
          cuenta={obrasActivas.length ? `${obrasActivas.length} en curso` : undefined}
        />
        {/* LAS TRES QUE FALTABAN (19/08/2026). El dueño: *"/administracion deja de ser sólo un menú.
            Debe permitir administrar: Clientes | Obras | Usuarios | Personas | Proveedores"*. Las
            dos primeras ya existían; estas tres son las que obligaban a entrar a Supabase para
            hacer un cambio normal — dar de alta a alguien, darle acceso a una obra, unificar un
            proveedor que en Compras está escrito de tres formas distintas. */}
        <Entrada
          href="/administracion/usuarios" testid="ir-usuarios" titulo="Usuarios"
          detalle="Quién entra, con qué nivel, y a qué obras tiene acceso"
        />
        <Entrada
          href="/administracion/personas" testid="ir-personas" titulo="Personas"
          detalle="El plantel: función, categoría y en qué obra está cada uno"
        />
        <Entrada
          href="/administracion/proveedores" testid="ir-proveedores" titulo="Proveedores"
          detalle="Identidad única por CUIT, y los nombres de Compras sin resolver"
        />
      </nav>

      {/* La separación es la que pidió el dueño: arriba las entidades, abajo los procesos. */}
      <p className="mt-7 mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-faint">
        Operación
      </p>
      <nav className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="admin-operacion">
        <Entrada
          href="/integraciones/pedidos-materiales" testid="ir-pedidos" titulo="Pedidos de materiales"
          detalle="Lo que pide la obra, desde AppSheet y desde el OS"
        />
        <Entrada
          href="/integraciones/herramientas" testid="ir-herramientas" titulo="Herramientas"
          detalle="Inventario y a quién está prestada cada una"
        />
        <Entrada
          href="/integraciones/movimientos" testid="ir-movimientos" titulo="Movimientos"
          detalle="Entradas y salidas de pañol"
        />
        <Entrada
          href="/administracion/pendientes" testid="ir-pendientes" titulo="Pendientes de imputación"
          detalle="Textos de obra que nadie clasificó todavía, y que hay que resolver a mano"
        />
      </nav>
    </PageShell>
  )
}
