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
import { destinoDeRespuesta, numeroDeRespuesta } from '@/features/presupuestos/services/arranque'

const EJEMPLOS_PRESUPUESTO = [
  'cotizame esta obra (adjuntá los planos acá)',
  'cotizá los planos de Quattropani',
  'mostrame el razonamiento del cotizador de La Estrella',
  '¿qué presupuestos tenemos en borrador?',
]

export function ArranqueXsas() {
  const router = useRouter()
  const [creado, setCreado] = useState<{ destino: string; numero: string | null } | null>(null)

  const alResponder = useCallback((r: RespuestaXsas) => {
    const destino = destinoDeRespuesta(r)
    if (!destino) return
    setCreado({ destino, numero: numeroDeRespuesta(r) })
    // Un respiro para leer el resumen de XSAS antes de aterrizar en el entorno del presupuesto.
    setTimeout(() => router.push(destino), 2500)
  }, [router])

  return (
    <div>
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
