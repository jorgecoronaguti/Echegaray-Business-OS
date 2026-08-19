import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque, Linea } from '@/shared/components/carga'

// EL WORKSPACE DE UNA OBRA: título, solapas del nivel 3, indicadores y el bloque de trabajo.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-64" />
      <div className="mb-5 flex gap-4 border-b border-line pb-2.5">
        {['w-16', 'w-20', 'w-14', 'w-24', 'w-20'].map((w) => (
          <Linea key={w} className={`h-2.5 ${w}`} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Bloque key={i} className="h-20 motion-safe:animate-pulse" />
        ))}
      </div>
      <Bloque className="mt-3 h-72 motion-safe:animate-pulse" />
    </PantallaEsqueleto>
  )
}
