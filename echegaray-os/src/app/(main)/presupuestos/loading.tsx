import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto } from '@/shared/components/carga'

// PRESUPUESTOS — nivel 1, así que NO lleva la banda de áreas de Administración (ver
// `presupuestos/layout.tsx`): título y cartera, nada más.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-40" />
      <TablaEsqueleto cols={5} filas={7} />
    </PantallaEsqueleto>
  )
}
