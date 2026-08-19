import { PantallaEsqueleto, EncabezadoEsqueleto, Linea } from '@/shared/components/carga'

// EL GANTT GLOBAL: un renglón por obra, con su barra. La grilla de fechas se insinúa arriba.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-28" />
      <div className="mb-5 flex gap-4 border-b border-line pb-2.5">
        <Linea className="h-2.5 w-16" />
        <Linea className="h-2.5 w-12" />
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface motion-safe:animate-pulse">
        <div className="flex gap-4 border-b border-line px-4 py-3">
          {Array.from({ length: 8 }, (_, i) => <Linea key={i} className="h-2.5 flex-1" />)}
        </div>
        {/* La barra arranca corrida y con largo distinto en cada renglón: un Gantt no es una tabla
            de bloques iguales, y el esqueleto tiene que parecerse a lo que viene. */}
        {[['ml-0', 'w-1/3'], ['ml-[12%]', 'w-1/4'], ['ml-[6%]', 'w-1/2'], ['ml-[30%]', 'w-1/5'],
          ['ml-[18%]', 'w-2/5'], ['ml-[45%]', 'w-1/4'], ['ml-[8%]', 'w-3/5']].map(([ml, w]) => (
          <div key={ml + w} className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
            <Linea className="h-3 w-44 shrink-0" />
            <span className="flex-1">
              <Linea className={`h-3.5 rounded-full ${ml} ${w}`} />
            </span>
          </div>
        ))}
      </div>
    </PantallaEsqueleto>
  )
}
