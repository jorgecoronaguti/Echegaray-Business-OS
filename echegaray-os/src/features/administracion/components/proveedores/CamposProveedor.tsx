// LOS CUATRO CAMPOS QUE `public.proveedores` PUEDE GUARDAR, en un solo lugar.
//
// Vive aparte de `PanelProveedor` porque lo usan las dos puertas de alta —la del maestro y la de la
// cola de nombres, que es un componente de cliente— y si colgara del panel, importarlo desde la cola
// arrastraría el panel entero al bundle del navegador.
//
// ═══ QUÉ NO ESTÁ, Y POR QUÉ ═══
//
// El handoff dibuja además condición de IVA, contacto y condición de pago. `public.proveedores` no
// tiene esas columnas —tiene nombre, razón social, CUIT, notas y activo—. Dibujarlas en «sin cargar»
// prometería un campo que el sistema no puede guardar: quien lo intentara no encontraría dónde.

import { Campo, CTRL } from '@/shared/components/ui'
import type { Proveedor } from '../../types'

export function CamposProveedor({ proveedor }: { proveedor: Proveedor | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre" ancho="col-span-2" ayuda="Como se lo nombra en obra y en el Sheet.">
        <input name="nombre" required maxLength={200} className={CTRL} defaultValue={proveedor?.nombre ?? ''} data-testid="proveedor-nombre" />
      </Campo>
      <Campo label="CUIT" ancho="col-span-2" ayuda="11 dígitos. Se guarda sin guiones.">
        <input name="cuit" inputMode="numeric" maxLength={15} className={CTRL} defaultValue={proveedor?.cuit ?? ''} data-testid="proveedor-cuit" />
      </Campo>
      <Campo label="Razón social" ancho="col-span-2" ayuda="Sólo si difiere del nombre de arriba.">
        <input name="razon_social" maxLength={200} className={CTRL} defaultValue={proveedor?.razon_social ?? ''} />
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <input name="notas" maxLength={300} className={CTRL} defaultValue={proveedor?.notas ?? ''} />
      </Campo>
    </div>
  )
}
