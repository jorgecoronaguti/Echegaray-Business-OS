import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque } from '@/shared/components/carga'

// LA FICHA DE UNA PERSONA — el renglón de solapas y los tres bloques del Resumen, que es la vista
// que se abre por defecto. Los huecos están donde va el dato: al llegar no hay salto.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-56" />
      <div className="max-w-5xl motion-safe:animate-pulse">
        <Bloque className="mb-5 h-9 w-80 max-w-full" />
        <div className="space-y-4">
          <Bloque className="h-40" />
          <Bloque className="h-40" />
          <Bloque className="h-24" />
        </div>
      </div>
    </PantallaEsqueleto>
  )
}
