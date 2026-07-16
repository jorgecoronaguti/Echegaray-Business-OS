import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { listarOperarios } from '@/features/usuarios/services/operariosService'
import { OperariosManager } from '@/features/usuarios/components/OperariosManager'

export const dynamic = 'force-dynamic'

export default async function OperariosPage() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)

  if (perfil.data?.rol !== 'direccion') {
    return (
      <div className="min-h-screen p-8">
        <h1 className="text-2xl font-bold">Operarios</h1>
        <p className="mt-2 text-gray-600">Solo Dirección puede gestionar los operarios de campo.</p>
      </div>
    )
  }

  const { data: operarios, error } = await listarOperarios(createAdminClient())

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operarios de campo</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Creá las cuentas para que el campo cargue pedidos, herramientas y movimientos desde el celular. Cada operario
          solo ve lo operativo, nunca caja ni finanzas. Al crearlo se genera una clave temporal — pasásela y que la
          cambie.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">No se pudieron leer los operarios.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      <OperariosManager operarios={operarios ?? []} />
    </div>
  )
}
