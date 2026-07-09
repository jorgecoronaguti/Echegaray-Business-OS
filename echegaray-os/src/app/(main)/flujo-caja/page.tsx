import { leerResumenFlujoCaja } from '@/features/flujo-caja/services/sheetsReader'

// Espejo web del RESUMEN del Sheet real "Flujo de Caja - Cash Flow" (decisión
// 2026-07-09: el OS se enfoca en Flujo de Caja; el Sheet sigue siendo la fuente
// de verdad y se opera ahí -- esta página es lectura para decidir, no captura).
// Se refresca como máximo cada 5 minutos (revalidate del fetch en sheetsReader).

export const dynamic = 'force-dynamic'

function esNegativo(valor: string): boolean {
  return valor.trimStart().startsWith('-') || valor.includes('-$')
}

export default async function FlujoCajaPage() {
  const resumen = await leerResumenFlujoCaja()

  if ('error' in resumen) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">💰 Flujo de Caja</h1>
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">La conexión con el Sheet no está configurada en este entorno.</p>
          <p className="mt-2">{resumen.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">💰 Flujo de Caja</h1>
        <div className="text-xs text-gray-500">
          Fuente:{' '}
          <a href={resumen.sheetUrl} target="_blank" rel="noreferrer" className="underline hover:text-gray-700">
            Sheet «Flujo de Caja - Cash Flow»
          </a>{' '}
          · leído {resumen.actualizadoEn}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {resumen.bloques.map((bloque) => (
          <section key={bloque.titulo} className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{bloque.titulo}</h2>
            <dl className="mt-3 space-y-2">
              {bloque.filas.map(({ label, valor }) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-gray-700">{label}</dt>
                  <dd
                    className={`text-sm font-semibold whitespace-nowrap tabular-nums ${
                      esNegativo(valor) ? 'text-red-700' : 'text-gray-900'
                    }`}
                  >
                    {valor}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Esta página es un espejo de lectura del RESUMEN del Sheet — la operación (cargar cobros, pagos, saldos) sigue
        viviendo en el Sheet. Si un número no cierra, la fuente de verdad es el archivo.
      </p>
    </div>
  )
}
