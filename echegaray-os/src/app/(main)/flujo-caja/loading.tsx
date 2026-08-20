import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque, TablaEsqueleto } from '@/shared/components/carga'

// FLUJO DE CAJA — es la pantalla más pesada del OS: no sale de Postgres sino del Sheet real, leído
// con una service account desde el servidor. Es la que más necesita decir que está trabajando.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-52" />
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bloque key={i} className="h-20 motion-safe:animate-pulse" />
        ))}
      </div>
      <TablaEsqueleto cols={6} filas={10} />
    </PantallaEsqueleto>
  )
}
