import { BotonEnlace } from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'

// NO EXISTE, y lo dice sin ambigüedad. El otro caso —«no lo pude leer»— NUNCA llega acá: la página
// lo atrapa antes y muestra `EstadoError`, porque un problema de permisos disfrazado de 404 manda a
// buscar el defecto al lugar equivocado.
export default function ProveedorNoEncontrado() {
  return (
    <PageShell title="Ese proveedor no existe" subtitle="La dirección apunta a una ficha que no está en el maestro.">
      <div data-testid="proveedor-no-encontrado">
        <BotonEnlace href="/administracion/proveedores" variante="primaria">Ver los proveedores</BotonEnlace>
      </div>
    </PageShell>
  )
}
