import { salir } from '../../login/acciones'

// SALIR NO ES UN LINK QUE BORRA: es una acción del servidor. Un GET que destruye la sesión lo puede
// disparar cualquier `<img>` de un mail y el cliente se encuentra afuera sin haber tocado nada.
export const dynamic = 'force-dynamic'

export default function Salir() {
  return (
    <form action={salir} className="py-10">
      <h1 className="text-xl font-semibold">¿Cerrar la sesión?</h1>
      {/* NO SE PROMETE UN CÓDIGO: el paso del código de seis dígitos se retiró el 26/08/2026 y se
          entra con el mail que administración cargó en la ficha. Dejar la frase vieja haría que el
          cliente cerrara sesión esperando un mail que nunca llega. */}
      <p className="mt-2 text-sm text-muted">Para volver a entrar sólo hace falta su correo.</p>
      <button
        type="submit"
        className="mt-6 flex min-h-[46px] items-center rounded-[6px] bg-marca px-5 text-sm font-semibold text-ink"
      >
        Salir
      </button>
    </form>
  )
}
