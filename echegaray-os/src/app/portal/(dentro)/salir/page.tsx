import { salir } from '../../login/acciones'

// SALIR NO ES UN LINK QUE BORRA: es una acción del servidor. Un GET que destruye la sesión lo puede
// disparar cualquier `<img>` de un mail y el cliente se encuentra afuera sin haber tocado nada.
export const dynamic = 'force-dynamic'

export default function Salir() {
  return (
    <form action={salir} className="py-10">
      <h1 className="text-xl font-semibold">¿Cerrar la sesión?</h1>
      <p className="mt-2 text-sm text-muted">Para volver a entrar le vamos a mandar un código nuevo.</p>
      <button
        type="submit"
        className="mt-6 flex min-h-[46px] items-center rounded-[6px] bg-marca px-5 text-sm font-semibold text-ink"
      >
        Salir
      </button>
    </form>
  )
}
