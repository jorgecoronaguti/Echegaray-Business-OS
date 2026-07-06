import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getClientes,
  getCuentasFinancieras,
  getProveedores,
} from '@/features/fundacion/services/fundacionService'
import { ClienteForm } from '@/features/fundacion/components/ClienteForm'
import { CuentaFinancieraForm } from '@/features/fundacion/components/CuentaFinancieraForm'
import { ProveedorForm } from '@/features/fundacion/components/ProveedorForm'

type Loaded<T> = { data: T; error: null } | { data: null; error: string }

async function loadFundacionData() {
  try {
    const supabase = await createClient()
    const [clientes, cuentas, proveedores] = await Promise.all([
      getClientes(supabase),
      getCuentasFinancieras(supabase),
      getProveedores(supabase),
    ])
    return { clientes, cuentas, proveedores }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed: Loaded<never> = { data: null, error }
    return { clientes: failed, cuentas: failed, proveedores: failed }
  }
}

export default async function FundacionPage() {
  const { clientes, cuentas, proveedores } = await loadFundacionData()

  const configError = clientes.error ?? cuentas.error ?? proveedores.error
  const isAuthError = configError?.toLowerCase().includes('permission denied') ?? false

  return (
    <div className="min-h-screen space-y-10 p-8">
      <div>
        <h1 className="text-3xl font-bold">Fundación</h1>
        <p className="mt-2 text-gray-600">
          Datos de referencia: Cliente, Cuenta financiera y Proveedor (PRP-001, Fase 0). La Obra —
          unidad económica central — se gestiona en <Link href="/obras" className="underline">/obras</Link>.
        </p>
      </div>

      {configError && isAuthError && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="config-error">
          <p className="font-semibold">No hay sesión autenticada — RLS está bloqueando el acceso correctamente.</p>
          <p className="mt-1 text-sm">{configError}</p>
          <p className="mt-1 text-sm">
            Supabase está configurado y las tablas existen; esto es lo esperado hasta que exista un
            login real (feature separada, todavía no construida).
          </p>
        </div>
      )}

      {configError && !isAuthError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" data-testid="config-error">
          <p className="font-semibold">Supabase no está configurado o no responde.</p>
          <p className="mt-1 text-sm">{configError}</p>
          <p className="mt-1 text-sm">
            Completá <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
            en <code>.env.local</code> con un proyecto Supabase real y aplicá las migraciones de{' '}
            <code>supabase/migrations/</code>.
          </p>
        </div>
      )}

      <section data-testid="clientes-section">
        <h2 className="text-xl font-semibold">Clientes</h2>
        <ClienteForm />
        <ul className="mt-3 list-inside list-disc">
          {(clientes.data ?? []).map((c) => (
            <li key={c.id}>{c.nombre}</li>
          ))}
        </ul>
      </section>

      <section data-testid="cuentas-section">
        <h2 className="text-xl font-semibold">Cuentas financieras</h2>
        <CuentaFinancieraForm />
        <ul className="mt-3 list-inside list-disc">
          {(cuentas.data ?? []).map((c) => (
            <li key={c.id}>
              {c.nombre} ({c.tipo}) — saldo inicial ${c.saldo_inicial}
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="proveedores-section">
        <h2 className="text-xl font-semibold">Proveedores</h2>
        <ProveedorForm />
        <ul className="mt-3 list-inside list-disc">
          {(proveedores.data ?? []).map((p) => (
            <li key={p.id}>{p.nombre}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
