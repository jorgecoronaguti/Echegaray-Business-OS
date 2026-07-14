// Página de descarga de la extensión de Chrome, servida desde la web del OS.
// La extensión le habla al cerebro que corre en la VM. El .zip vive en /public.

export const metadata = { title: 'Extensión de Chrome — Echegaray OS' }

const PASOS: { n: number; texto: React.ReactNode }[] = [
  { n: 1, texto: <>Descargá el archivo y <b>descomprimilo</b> en una carpeta.</> },
  { n: 2, texto: <>Abrí Chrome en <code className="rounded bg-black/20 px-1.5 py-0.5">chrome://extensions</code>.</> },
  { n: 3, texto: <>Activá <b>“Modo de desarrollador”</b> (arriba a la derecha).</> },
  { n: 4, texto: <>Clic en <b>“Cargar descomprimida”</b> y elegí la carpeta.</> },
  { n: 5, texto: <>Clic en el ícono de la extensión → se abre el panel. En <b>⚙</b> pegá tu <b>llave de acceso</b>.</> },
]

export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Extensión de Chrome</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Un panel para darle directivas al OS sobre tus archivos de Drive, desde el navegador.
        Abrís un Sheet, escribís qué querés (“¿cuánto tengo en caja hoy?”, “revisá esta planilla”)
        y te contesta leyendo el archivo real, en segundos.
      </p>

      <a
        href="/echegaray-os-extension.zip"
        download
        className="mt-6 inline-block rounded-lg bg-blue-500 px-5 py-3 font-bold text-blue-950 hover:bg-blue-400"
      >
        ⬇ Descargar la extensión
      </a>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">Cómo instalarla</h2>
      <ol className="mt-3 space-y-2">
        {PASOS.map((p) => (
          <li key={p.n} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-bold">
              {p.n}
            </span>
            <span className="pt-0.5 text-neutral-300">{p.texto}</span>
          </li>
        ))}
      </ol>

      <p className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-neutral-400">
        El cerebro corre en tu servidor (la VM); la extensión sólo le manda tus directivas y te trae
        la respuesta. Lo que toca plata o contratos no se ejecuta solo: queda para tu aprobación.
        Si no tenés tu llave de acceso, pedila y te la pasamos.
      </p>
    </div>
  )
}
