import { Conversacion } from '@/features/xsas/components/Conversacion'

// XSAS — la interfaz de trabajo con la inteligencia del OS.
//
// La sesión y el rol los resuelve el middleware y `/api/xsas` los vuelve a comprobar contra
// Supabase: esta página no decide permisos. Lo que el usuario puede pedir sale del registro real de
// capacidades filtrado por su rol, del lado del OS.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'XSAS' }

export default function XsasPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-900">XSAS</h1>
      <p className="mb-4 text-sm text-slate-500">
        La inteligencia del OS. Preguntá o pedile trabajo; abajo de cada respuesta dice con qué lo resolvió.
      </p>
      <Conversacion />
    </div>
  )
}
