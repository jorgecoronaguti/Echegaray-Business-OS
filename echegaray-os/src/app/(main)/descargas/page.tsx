export const dynamic = 'force-dynamic'

// Página de DESCARGAS: la extensión de Chrome del OS, servida desde la web (Vercel), no
// desde un link crudo de la VM. El .zip lo entrega la propia VM a través del proxy
// (/api/os/extension.zip, mismo dominio), así el dueño siempre lo baja desde acá.
const ZIP_URL = '/api/os/extension.zip'
const VERSION_URL = 'https://echegaray-business-os.vercel.app/api/os/version'

async function versionActual(): Promise<string | null> {
  try {
    const r = await fetch(VERSION_URL, { cache: 'no-store' })
    if (!r.ok) return null
    const j = (await r.json()) as { version?: string | null }
    return j.version ?? null
  } catch {
    return null
  }
}

const PASOS = [
  'Descargá el .zip con el botón de arriba y descomprimilo en una carpeta.',
  'Abrí Chrome en chrome://extensions.',
  'Activá “Modo de desarrollador” (arriba a la derecha).',
  'Clic en “Cargar descomprimida” y elegí la carpeta descomprimida. Si ya la tenías cargada, reemplazá el contenido de esa carpeta y tocá recargar (↻).',
  'Clic en el ícono de la extensión → se abre el panel. En ⚙ pegá tu llave de acceso y tu mail.',
]

const CAPACIDADES = [
  'Editar tus Sheets de verdad: formato, moneda, tablas con estilo, tablas dinámicas, gráficos, imágenes, crear/borrar/renombrar pestañas.',
  'Editar Docs: títulos, formato, tablas, imágenes, completar plantillas.',
  'Detener una tarea en curso (el botón Enviar pasa a Detener) y agrandar la caja de texto.',
  'Buscar mejores prácticas, aprenderlas y guardarlas para responder después sin gastar.',
]

export default async function DescargasPage() {
  const version = await versionActual()

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Descargar la extensión</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          El panel de Echegaray OS para el navegador: le das directivas al OS sobre tus archivos de Drive, desde
          Chrome. Todo corre en tu propia infraestructura.
        </p>
      </div>

      <div className="flex flex-col items-start gap-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <a
            href={ZIP_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-700"
          >
            ⬇ Descargar extensión (.zip)
          </a>
          {version && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              versión {version}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          El archivo lo entrega tu servidor del OS. Si el botón no descarga, probá de nuevo en unos segundos.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cómo instalarla</h2>
        <ol className="max-w-2xl list-decimal space-y-2 rounded-xl border border-gray-200 bg-white p-6 pl-10 text-sm text-gray-700 shadow-sm">
          {PASOS.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Qué podés hacer con esta versión</h2>
        <ul className="max-w-2xl space-y-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
          {CAPACIDADES.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-600">✓</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
