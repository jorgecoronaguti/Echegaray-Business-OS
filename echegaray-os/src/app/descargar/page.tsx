// Página pública de descarga de la extensión del OS, servida desde Vercel (dominio estable,
// no depende del túnel). El .zip vive en public/echegaray-os-extension.zip. Actualizar el
// número de versión y el .zip juntos en cada release.

export const metadata = { title: 'Echegaray OS — Extensión' }

const VERSION = '0.8.2'
const CAMBIOS = [
  'Login por usuario: botón "Conectar con Google" + llave por persona (rol atado a la llave).',
  'Control total de Drive actuando como vos: crear/escribir Google Docs, editar Sheets, copiar, mover, imágenes.',
  'Memoria del chat más fuerte y más historial de conversación.',
]

export default function Descargar() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', background: '#0e1118', color: '#e6eaf2', minHeight: '100vh', margin: 0 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px', lineHeight: 1.6 }}>
        <h1 style={{ letterSpacing: '-0.02em', marginBottom: 4 }}>Echegaray OS — Extensión de Chrome</h1>
        <p style={{ color: '#aab3c5', marginTop: 0 }}>
          Versión <b style={{ color: '#e6eaf2' }}>v{VERSION}</b> · el panel para operar el OS sobre tu Drive, Docs, Sheets y Calendar.
        </p>

        <a
          href="/echegaray-os-extension.zip"
          style={{ display: 'inline-block', background: '#6f9dea', color: '#0b1220', fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none', margin: '12px 0 8px' }}
        >
          ⬇ Descargar v{VERSION}
        </a>

        <h3 style={{ marginTop: 28 }}>Cómo instalarla</h3>
        <ol style={{ paddingLeft: 20 }}>
          <li>Descargá el .zip y <b>descomprimilo</b> en una carpeta.</li>
          <li>Abrí Chrome en <code style={codeStyle}>chrome://extensions</code>.</li>
          <li>Activá <b>“Modo de desarrollador”</b> (arriba a la derecha).</li>
          <li>Clic en <b>“Cargar descomprimida”</b> y elegí la carpeta.</li>
          <li>Abrí el panel (ícono de la extensión) → ⚙ → pegá <b>tu llave de acceso</b> → Guardar.</li>
          <li>Para conectar tu Google: ⚙ → <b>“Conectar con Google”</b> → autorizá con tu cuenta.</li>
        </ol>

        <h3 style={{ marginTop: 28 }}>Novedades de esta versión</h3>
        <ul style={{ paddingLeft: 20, color: '#c7cfdd' }}>
          {CAMBIOS.map((c, i) => (
            <li key={i} style={{ margin: '6px 0' }}>{c}</li>
          ))}
        </ul>

        <p style={{ color: '#7f8aa0', fontSize: 13, marginTop: 32 }}>
          Cada persona usa su propia llave (define su rol). El OS actúa como el usuario que se conectó con Google.
        </p>
      </div>
    </main>
  )
}

const codeStyle = { background: '#161b25', padding: '2px 6px', borderRadius: 5, border: '1px solid #2a323f' }
