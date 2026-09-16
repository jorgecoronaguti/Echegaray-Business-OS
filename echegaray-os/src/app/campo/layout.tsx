import { ProveedorTiempoReal, RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL EN EL TELÉFONO (dueño, 16/09/2026): «no se están actualizando lo que marco en el celular con
// lo que veo en la computadora… tiene que ser de ida y vuelta, en tiempo real y multiusuario».
// `/campo` vive fuera de `(main)` y `(jefe)`, así que no tenía proveedor: lo que otro cargaba desde la
// oficina no llegaba al teléfono. Un usuario `campo` sin permiso sobre el tópico recibe un rechazo y la
// pantalla sigue como antes (`conexion.ts`).
export default function CampoEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorTiempoReal>
      {children}
      <RefrescarEnVivo tablas={TABLAS_DE.campo} />
    </ProveedorTiempoReal>
  )
}
