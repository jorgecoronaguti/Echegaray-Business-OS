import Link from 'next/link'

export const dynamic = 'force-dynamic'

// URL de Mattermost (chat corporativo autohospedado). Dominio ya decidido:
// chat.ecsas.com.ar. Configurable por env para poder apuntar a otro host sin
// tocar código. Mismo patrón que /integraciones/pedidos-materiales (AppSheet).
const MATTERMOST_URL = process.env.NEXT_PUBLIC_MATTERMOST_URL || 'https://chat.ecsas.com.ar'

// Mattermost por defecto envía X-Frame-Options / frame-ancestors y NO se deja
// embeber en iframe. Por eso el flujo estable es la tarjeta de lanzamiento (abre
// en pestaña nueva). El iframe queda detrás de una env opt-in (default off), igual
// que NEXT_PUBLIC_APPSHEET_PEDIDOS_EMBED, para el día que el servidor lo permita.
const MATTERMOST_EMBED = process.env.NEXT_PUBLIC_MATTERMOST_EMBED === 'true'

export default function ComunicacionPage() {
  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comunicación</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Chat corporativo de Echegaray, autohospedado en Mattermost. Un solo lugar para la
          conversación operativa del equipo: dirección, obras, administración y campo.
        </p>
      </div>

      <section className="max-w-2xl rounded-lg border bg-white p-6 shadow-sm" data-testid="mattermost-launch">
        <h2 className="text-lg font-semibold">Abrir el chat</h2>
        <p className="mt-1 text-sm text-gray-600">
          El chat vive en{' '}
          <span className="font-medium text-gray-800">{hostDe(MATTERMOST_URL)}</span>. Abrilo en una
          pestaña nueva; iniciás sesión con tu cuenta del equipo.
        </p>
        <a
          href={MATTERMOST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Abrir Mattermost ↗
        </a>
        <p className="mt-4 text-xs text-gray-400">
          Mattermost bloquea el embebido en iframe por defecto; por eso el chat se abre en su propia
          pestaña. Es la forma más estable de acceder.
        </p>
      </section>

      {MATTERMOST_EMBED && (
        <section data-testid="mattermost-embed">
          <h2 className="mb-2 text-lg font-semibold">Chat en vivo (embebido)</h2>
          <iframe
            src={MATTERMOST_URL}
            className="h-[720px] w-full rounded-lg border"
            title="Chat corporativo (Mattermost)"
          />
          <p className="mt-2 text-xs text-gray-400">
            Si esta zona queda en blanco, el servidor de Mattermost no permite el embebido: usá el
            botón &ldquo;Abrir Mattermost&rdquo;.
          </p>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Configuración:{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">NEXT_PUBLIC_MATTERMOST_URL</code> (host del
        chat, default <code className="rounded bg-gray-100 px-1 py-0.5">https://chat.ecsas.com.ar</code>) y{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">NEXT_PUBLIC_MATTERMOST_EMBED</code> (
        <code className="rounded bg-gray-100 px-1 py-0.5">true</code> para intentar el iframe; default
        off). Ver también{' '}
        <Link href="/integraciones" className="underline">
          Integraciones
        </Link>
        .
      </p>
    </div>
  )
}

// Muestra sólo el host (ej. chat.ecsas.com.ar) sin romper si la env trae algo raro.
function hostDe(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
