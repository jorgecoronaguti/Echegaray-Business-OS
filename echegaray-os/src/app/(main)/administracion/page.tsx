// ADMINISTRACIÓN — LA ENTRADA DEL ÁREA, Y NADA MÁS QUE SUS CINCO SECCIONES.
//
// ═══ QUÉ SE CORRIGIÓ ACÁ (19/08/2026) ═══
//
// El dueño: *"NIVEL 1: Administración | Obras. NIVEL 2 Administración: Clientes / Usuarios /
// Personas / Proveedores / Pendientes. **No mezclar niveles en la misma barra.**"*
//
// Esta pantalla mezclaba tres cosas:
//
//   1. Tenía **Obras** adentro. Obras es el OTRO módulo de nivel 1 — está en el encabezado, al lado
//      de Administración. Ofrecerlo también acá adentro dice que Obras es una sección de
//      Administración, que es justamente lo que no es.
//   2. Tenía **Usuarios dos veces**: una vez entre las entidades y otra en un bloque «Sistema».
//   3. Tenía Pedidos, Herramientas y Movimientos apuntando a `/integraciones/*`. Esos tres dominios
//      ahora viven dentro del workspace de cada obra, acotados por `obra_id`, que es donde
//      significan algo. Las rutas viejas siguen respondiendo —nadie pierde un enlace guardado—, sólo
//      dejan de ofrecerse como si fueran secciones de Administración.
//
// Quedan las CINCO que pidió el dueño, en su orden, y la barra de nivel 2 (`NavAdministracion`)
// dibuja exactamente las mismas: la pantalla y la barra no pueden discrepar porque salen de la
// misma lista de secciones.
//
// Los contadores son de NAVEGACIÓN, no de gestión: dicen cuánto hay del otro lado para que nadie
// entre a una lista vacía sin saberlo. Salen de las mismas fuentes que las pantallas destino, así
// que no pueden contradecirlas.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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

/** El conteo de una tabla, sin traer una sola fila. Si la lectura falla, no hay contador — nunca un
 *  cero, que se leería como «no hay ninguno». */
async function contar(supabase: Awaited<ReturnType<typeof createClient>>, tabla: string) {
  const { count, error } = await supabase.from(tabla).select('*', { count: 'exact', head: true })
  return error ? undefined : count ?? undefined
}

export default async function AdministracionPage() {
  const supabase = await createClient()
  const [clientes, personas, proveedores, pendientes] = await Promise.all([
    contar(supabase, 'clientes'),
    contar(supabase, 'personas'),
    contar(supabase, 'proveedores'),
    contar(supabase, 'proveedor_nombre_pendiente'),
  ])

  return (
    <PageShell
      title="Administración"
      subtitle="Lo que se administra desde acá, sin tocar la base de datos."
      maxWidth="max-w-3xl"
    >
      <nav className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="admin-entidades">
        <Entrada
          href="/clientes" testid="ir-clientes" titulo="Clientes"
          detalle="Ficha, contactos, actividad, documentos y sus obras"
          cuenta={clientes != null ? `${clientes}` : undefined}
        />
        <Entrada
          href="/administracion/usuarios" testid="ir-usuarios" titulo="Usuarios"
          detalle="Quién entra, con qué nivel, y a qué obras tiene acceso"
        />
        <Entrada
          href="/administracion/personas" testid="ir-personas" titulo="Personas"
          detalle="El plantel: función, categoría y en qué obra está cada uno"
          cuenta={personas != null ? `${personas}` : undefined}
        />
        <Entrada
          href="/administracion/proveedores" testid="ir-proveedores" titulo="Proveedores"
          detalle="Identidad única por CUIT, y los nombres de Compras sin resolver"
          cuenta={proveedores != null ? `${proveedores}` : undefined}
        />
        <Entrada
          href="/administracion/pendientes" testid="ir-pendientes" titulo="Pendientes de imputación"
          detalle="Lo que todavía no tiene obra, y los nombres de proveedor sin dueño"
          cuenta={pendientes ? `${pendientes} sin dueño` : undefined}
        />
      </nav>
    </PageShell>
  )
}
