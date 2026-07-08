import { SignupForm } from '@/features/auth/components/SignupForm'

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <h1 className="text-3xl font-bold">Crear cuenta</h1>
        <SignupForm />
      </div>
    </div>
  )
}
