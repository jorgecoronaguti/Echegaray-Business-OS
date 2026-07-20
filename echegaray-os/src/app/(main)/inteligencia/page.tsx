import { createClient } from '@/lib/supabase/server'
import { getBiblioteca } from '@/features/inteligencia/services/bibliotecaService'

export const dynamic = 'force-dynamic'

// INTELIGENCIA ORGANIZACIONAL — qué sabe el OS de cada una de las 8 áreas.
//
// Lee la misma vista que el chat (`public.biblioteca_completa`). La pantalla no calcula nada: si
// mostrara un número distinto al del chat sería un bug de fuente única, no un criterio distinto.

const ETIQUETA_TIPO: Record<string, string> = {
  afirmacion: 'Sabe',
  fuente: 'Fuentes',
  framework: 'Criterio',
  kpi: 'KPIs',
  playbook: 'Playbooks',
  checklist: 'Checklists',
  regla: 'Reglas',
  reunion: 'Reuniones',
  objetivo: 'Objetivos',
  aprendizaje: 'Aprendizajes',
  pregunta: 'Preguntas',
  pendiente: 'Pendientes',
  accion: 'Acciones',
  reporte: 'Reportes',
  decision: 'Decisiones',
  capacidad: 'Madurez',
}

const ORDEN_TIPO = [
  'afirmacion', 'fuente', 'framework', 'kpi', 'playbook', 'checklist',
  'regla', 'reunion', 'objetivo', 'aprendizaje', 'pregunta', 'accion', 'pendiente',
]

export default async function InteligenciaPage() {
  const supabase = await createClient()
  const { areas, sinClasificar, error } = await getBiblioteca(supabase)

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">Inteligencia Organizacional</h1>
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-4 text-red-800">
          No pude leer la biblioteca: {error}
        </p>
      </main>
    )
  }

  const totalPiezas = areas.reduce((a, x) => a + x.total, 0)

  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Inteligencia Organizacional</h1>
        <p className="mt-1 text-sm text-gray-600">
          Qué sabe, con qué criterio trabaja y qué le falta al OS en cada una de las 8 áreas.
          {' '}Misma fuente que el chat: {totalPiezas} piezas clasificadas.
          {sinClasificar > 0 && (
            <> <strong className="text-amber-700">{sinClasificar} sin clasificar</strong> — no se pueden rutear a ningún área.</>
          )}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {areas.map((a) => (
          <section
            key={a.clave}
            className={`rounded-lg border p-4 ${a.total === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{a.nombre}</h2>
              <span className="text-sm tabular-nums text-gray-500">{a.total}</span>
            </div>

            {a.total === 0 ? (
              <p className="mt-2 text-sm text-amber-800">
                El OS no sabe nada de esta área todavía.
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {ORDEN_TIPO.filter((t) => a.porTipo[t]).map((t) => (
                  <li key={t} className="text-gray-700">
                    <span className="tabular-nums font-medium">{a.porTipo[t]}</span>{' '}
                    <span className="text-gray-500">{ETIQUETA_TIPO[t] ?? t}</span>
                  </li>
                ))}
              </ul>
            )}

            {a.huecos.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-xs text-amber-800">
                {a.huecos.map((h) => (
                  <li key={h}>⚠ {h}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  )
}
