import { ProveedorTiempoReal, RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// EFECTIVO A RENDIR EN EL TELÉFONO — en vivo.
//
// El marco del empleado no monta el proveedor de tiempo real (sus pantallas no lo necesitaban). Éstas
// sí: el ticket pasa de «leyendo» a «en Compras» cuando el worker de la VM termina, y la entrega
// aparece cuando Administración la carga desde la oficina. Sin esto, la persona tendría que recargar
// para ver lo que ya pasó.
export default function EfectivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorTiempoReal>
      {children}
      <RefrescarEnVivo tablas={TABLAS_DE.efectivoCampo} />
    </ProveedorTiempoReal>
  )
}
