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
            de bloques iguales, y el esqueleto tiene que parecerse a lo que viene.

            VAN ESCRITAS UNA POR UNA, no armadas con un map sobre pares [margen, ancho]. El map
            funcionaba —los pares eran literales del archivo, así que Tailwind los veía—, pero una
            clase interpolada no se puede verificar: se lee igual que `ml-${pct}%`, que sale sin
            CSS. Un esqueleto es un dibujo fijo y el bucle no le ahorraba nada. */}
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-0 w-1/3" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[12%] w-1/4" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[6%] w-1/2" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[30%] w-1/5" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[18%] w-2/5" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[45%] w-1/4" />
          </span>
        </div>
        <div className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Linea className="h-3 w-44 shrink-0" />
          <span className="flex-1">
            <Linea className="h-3.5 rounded-full ml-[8%] w-3/5" />
          </span>
        </div>
      </div>
    </PantallaEsqueleto>
  )
}
