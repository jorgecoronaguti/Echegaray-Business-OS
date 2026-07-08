import type { Accion, BucketDireccion } from '../types'
import { clasificarParaDireccion, calcularDiasAtraso } from '../types'

const BUCKET_LABEL: Record<BucketDireccion, string> = {
  decidir_hoy: 'Decidir hoy',
  riesgo_abierto: 'Riesgo abierto',
  accion_vencida: 'Acciones vencidas',
  seguimiento: 'Seguimiento',
  aprendizaje_pendiente: 'Aprendizaje pendiente',
}

const BUCKET_ORDEN: BucketDireccion[] = ['accion_vencida', 'decidir_hoy', 'riesgo_abierto', 'seguimiento', 'aprendizaje_pendiente']

const BUCKET_COLOR: Record<BucketDireccion, string> = {
  decidir_hoy: 'border-red-400 bg-red-50',
  riesgo_abierto: 'border-amber-400 bg-amber-50',
  accion_vencida: 'border-red-600 bg-red-100',
  seguimiento: 'border-blue-300 bg-blue-50',
  aprendizaje_pendiente: 'border-purple-300 bg-purple-50',
}

// Vista de Dirección (Centro de Acción 2.0) -- no es un sistema nuevo, es una
// segunda forma de mirar las mismas Acciones ya existentes, agrupadas por lo que
// Dirección necesita decidir hoy en vez de por área/estado técnico.
export function VistaDireccion({ acciones }: { acciones: Accion[] }) {
  const hoy = new Date()
  const buckets = new Map<BucketDireccion, Accion[]>()
  for (const a of acciones) {
    const bucket = clasificarParaDireccion(a, hoy)
    const lista = buckets.get(bucket) ?? []
    lista.push(a)
    buckets.set(bucket, lista)
  }

  return (
    <section data-testid="vista-direccion" className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      {BUCKET_ORDEN.map((bucket) => {
        const lista = buckets.get(bucket) ?? []
        return (
          <div key={bucket} className={`rounded border p-3 ${BUCKET_COLOR[bucket]}`} data-testid={`bucket-${bucket}`}>
            <p className="text-xs font-semibold uppercase text-gray-600">{BUCKET_LABEL[bucket]}</p>
            <p className="text-2xl font-bold">{lista.length}</p>
            <ul className="mt-1 space-y-1 text-xs">
              {lista.slice(0, 3).map((a) => {
                const dias = calcularDiasAtraso(a, hoy)
                return (
                  <li key={a.id}>
                    {a.titulo}
                    {dias != null && <span className="ml-1 font-semibold text-red-700">({dias}d)</span>}
                  </li>
                )
              })}
              {lista.length > 3 && <li className="text-gray-500">+{lista.length - 3} más</li>}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
