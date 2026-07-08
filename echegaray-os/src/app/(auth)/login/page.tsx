import { LoginForm } from '@/features/auth/components/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>
}) {
  const { registrado } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <h1 className="text-3xl font-bold">Ingresar</h1>
        {registrado && (
          <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Cuenta creada. Ya podés ingresar (el rol se asigna por separado).
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
