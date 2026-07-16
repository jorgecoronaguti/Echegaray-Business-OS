import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { LogoutButton } from '@/features/auth/components/LogoutButton'

export const dynamic = 'force-dynamic'

const MODULOS = [
  {
    href: '/integraciones/pedidos-materiales',
    titulo: 'Pedidos de materiales',
    desc: 'Pedir material y ver su estado',
    emoji: '📦',
    tono: 'from-sky-500 to-sky-600',
  },
  {
    href: '/integraciones/herramientas',
    titulo: 'Herramientas',
    desc: 'Inventario, fotos y ubicación',
    emoji: '🛠️',
    tono: 'from-violet-500 to-violet-600',
  },
  {
    href: '/integraciones/movimientos',
    titulo: 'Movimientos',
    desc: 'Registrar y ver traslados',
    emoji: '🔄',
    tono: 'from-emerald-500 to-emerald-600',
  },
]

export default async function CampoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase)
  const nombre = perfil.data?.nombre || user.email || 'Operario'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div>
          <p className="text-xs text-gray-400">Echegaray OS — Campo</p>
          <p className="font-semibold text-gray-900">Hola, {nombre.split(' ')[0]}</p>
        </div>
        <LogoutButton />
      </header>

      <main className="mx-auto max-w-md space-y-3 p-4">
        <p className="px-1 text-sm text-gray-500">¿Qué necesitás hacer?</p>
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`flex items-center gap-4 rounded-2xl bg-gradient-to-br ${m.tono} p-5 text-white shadow-sm active:scale-[0.98]`}
          >
            <span className="text-3xl">{m.emoji}</span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold">{m.titulo}</span>
              <span className="block text-sm text-white/80">{m.desc}</span>
            </span>
            <span className="ml-auto text-2xl text-white/70">→</span>
          </Link>
        ))}
        <p className="pt-4 text-center text-xs text-gray-400">
          Cargá acá lo que antes ibas a la app de materiales. Se guarda al instante.
        </p>
      </main>
    </div>
  )
}
