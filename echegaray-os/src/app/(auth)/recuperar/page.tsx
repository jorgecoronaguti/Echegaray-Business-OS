import { MarcoAuth } from '@/features/auth/components/MarcoAuth'
import { RecuperarForm } from '@/features/auth/components/RecuperarForm'

// M01 · «OLVIDÉ MI CONTRASEÑA» — la salida de quien no puede entrar.
//
// Hasta el 21/08/2026 esta pantalla no existía y el login no tenía siquiera el enlace: alguien que
// olvidaba la contraseña dependía de que Administración se la reseteara a mano desde `/administracion
// /usuarios`. Para el operario que abre el OS desde el teléfono en una obra, eso significa esperar a
// que alguien de oficina atienda — y mientras tanto no puede fichar.
//
// `?vencido=1` lo pone el callback cuando el enlace del correo ya no sirve. Se dice ACÁ y no en una
// pantalla de error propia porque la única acción posible es la que ofrece este formulario.

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ vencido?: string }>
}) {
  const { vencido } = await searchParams
  return (
    <MarcoAuth
      titulo="Recuperar la contraseña"
      bajada="Te mandamos un enlace al correo de tu cuenta."
    >
      {vencido && (
        <p
          data-testid="enlace-vencido"
          className="mb-4 rounded-card border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn"
        >
          Ese enlace ya venció o se usó. Pedí uno nuevo: los de recuperación duran poco a propósito.
        </p>
      )}

      <RecuperarForm />
    </MarcoAuth>
  )
}
