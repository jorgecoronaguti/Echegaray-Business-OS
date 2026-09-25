import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto, Linea } from '@/shared/components/carga'

// HOY DEL JEFE MIENTRAS CARGA — la tabla de sus obras (siete columnas, las de `page.tsx`) y la franja
// del día debajo, en su lugar: nada salta cuando llega el dato.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-20" />
      <TablaEsqueleto cols={7} filas={6} />
      <div className="mt-8 flex gap-4">
        <Linea className="h-10 flex-1" />
        <Linea className="h-10 flex-1" />
        <Linea className="h-10 flex-1" />
        <Linea className="h-10 flex-1" />
      </div>
    </PantallaEsqueleto>
  )
}
