import { logoutAction } from '../services/actions'

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="rounded px-3 py-1 text-sm hover:bg-gray-100" data-testid="logout-button">
        Cerrar sesión
      </button>
    </form>
  )
}
