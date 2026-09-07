// LOS CINCO CAMPOS QUE `public.proveedores` PUEDE GUARDAR, en un solo lugar.
//
// Vive aparte de `PanelProveedor` porque lo usan las dos puertas de alta —la del maestro y la de la
// cola de nombres, que es un componente de cliente— y si colgara del panel, importarlo desde la cola
// arrastraría el panel entero al bundle del navegador.
//
// ═══ QUÉ NO ESTÁ, Y POR QUÉ ═══
//
// El handoff dibuja además condición de IVA, contacto y condición de pago. `public.proveedores` no
// tiene esas columnas. Dibujarlas en «sin cargar» prometería un campo que el sistema no puede
// guardar: quien lo intentara no encontraría dónde.
//
// ═══ EL RUBRO ES EL QUINTO DESDE EL 06/09/2026, Y ES LA PUERTA DE LA CORRECCIÓN ═══
//
// El OS deduce el rubro de lo que cada proveedor vendió, y se equivoca: la deducción sale de la
// familia de material de sus compras, que a veces está mal cargada o no está. Ésta es la única
// puerta para arreglarlo, y lo que se escribe acá LE GANA A LA DEDUCCIÓN PARA SIEMPRE — no por una
// regla que la pantalla recuerde, sino porque va a otra columna que el deductor no toca.
//
// La opción vacía NO es «ninguno»: es «no lo declaro», y devuelve el mando a la deducción. Sin ella
// una corrección sería irreversible, y la primera equivocación quedaría clavada para siempre.

import { Campo, CTRL } from '@/shared/components/ui'
import { RUBROS } from '../../../../../orquestador/lib/rubro-proveedor.mjs'
import { rubroDe, type Proveedor } from '../../types'

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
      <Campo
        label="Rubro"
        ancho="col-span-2"
        ayuda={ayudaDelRubro(proveedor)}
      >
        <select name="rubro" className={CTRL} defaultValue={proveedor?.rubro ?? ''} data-testid="proveedor-rubro">
          {/* «Dejar que lo deduzca el OS» y no «—»: el vacío tiene un significado y hay que decirlo,
              o se lee como «este proveedor no tiene rubro». */}
          <option value="">Dejar que lo deduzca el OS</option>
          {(RUBROS as string[]).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <input name="notas" maxLength={300} className={CTRL} defaultValue={proveedor?.notas ?? ''} />
      </Campo>
    </div>
  )
}

/**
 * LA AYUDA DEL CAMPO DICE DE DÓNDE SALE LO QUE HOY MUESTRA, con su cuenta.
 *
 * Sin esto, el que va a corregir un rubro no sabe contra qué está discutiendo: ve «Materiales» y no
 * puede juzgar si el OS lo dedujo de 189 compras o de 3. La evidencia es lo que hace que la
 * corrección sea una decisión y no una preferencia.
 */
function ayudaDelRubro(proveedor: Proveedor | null): string {
  if (!proveedor) return 'Se puede dejar vacío: el OS lo deduce de lo que compre.'
  const r = rubroDe(proveedor)
  if (r.declarado) return 'Declarado a mano. Vaciarlo devuelve el mando a lo que el OS deduzca.'
  if (r.evidencia) return `Hoy el OS deduce «${r.texto}»: ${r.evidencia}.`
  return 'El OS todavía no puede deducirlo de sus compras.'
}
