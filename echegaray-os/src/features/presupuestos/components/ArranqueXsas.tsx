'use client'

// EL ARRANQUE DE UN PRESUPUESTO NUEVO ES UNA CONVERSACIÓN — «Presupuestos v5 · entorno xsas».
//
// Esta pantalla NO dibuja el presupuesto: lo hace nacer. Se le tira el legajo (PDF de plantas,
// cortes, planillas) o se le describe la obra; cuando el OS crea el borrador —`plano.cotizar`
// devuelve `cotizacion_id`— se navega al entorno completo de `/presupuestos/[id]`, que ya tiene
// la conversación por cotización, la cola de atención, la tabla y la cascada. Una sola fuente
// del entorno: acá no se duplica nada de eso.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Conversacion, type RespuestaXsas } from '@/features/xsas/components/Conversacion'
import { destinoDeRespuesta, numeroDeRespuesta, pasosDeRespuesta } from '@/features/presupuestos/services/arranque'

const EJEMPLOS_PRESUPUESTO = [
  'cotizame esta obra (adjuntá los planos acá)',
  'cotizá los planos de Quattropani',
  'mostrame el razonamiento del cotizador de La Estrella',
  '¿qué presupuestos tenemos en borrador?',
]

export function ArranqueXsas() {
  const router = useRouter()
  const [creado, setCreado] = useState<{ destino: string; numero: string | null } | null>(null)
  const [pasos, setPasos] = useState<{ titulo: string; cuerpo: string }[]>([])

  const alResponder = useCallback((r: RespuestaXsas) => {
    // EL PASO A PASO ES LA GUÍA (dueño, 02/09): XSAS lee el plano, genera el razonamiento y
    // recién de ahí deriva la cotización. Los bloques se muestran tal como los produjo el motor
    // — los faltantes vienen nombrados adentro; acá no se inventa ningún estado.
    const p = pasosDeRespuesta(r)
    if (p.length) setPasos(p)
    const destino = destinoDeRespuesta(r)
    if (!destino) return
    setCreado({ destino, numero: numeroDeRespuesta(r) })
    // Más aire cuando hay paso a paso para leer antes de aterrizar en el entorno.
    setTimeout(() => router.push(destino), p.length ? 9000 : 2500)
  }, [router])

  return (
    <div>
      {pasos.length > 0 && (
        <div data-testid="paso-a-paso" className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
            El razonamiento que deriva en la cotización — lo que falta está nombrado, no inventado
          </p>
          <ol className="space-y-2">
            {pasos.map((p) => (
              <li key={p.titulo} className="text-sm">
                <span className="font-semibold text-slate-900">{p.titulo}</span>
                <span className="text-slate-600"> — {p.cuerpo}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {creado && (
        <div
          data-testid="presupuesto-creado"
          className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900"
        >
          Presupuesto {creado.numero ?? 'borrador'} creado — abriendo su entorno de trabajo…{' '}
          <button type="button" className="underline" onClick={() => router.push(creado.destino)}>
            ir ahora
          </button>
        </div>
      )}
      <Conversacion
        presentacion={
          'Tirale el legajo acá —plantas, cortes, planillas, el PDF que mandó el cliente— y decile «cotizá». '
          + 'O describí la obra con tus palabras. Cuando el borrador exista, esta pantalla te lleva sola al presupuesto.'
        }
        ejemplos={EJEMPLOS_PRESUPUESTO}
        onRespuesta={alResponder}
      />
    </div>
  )
}
