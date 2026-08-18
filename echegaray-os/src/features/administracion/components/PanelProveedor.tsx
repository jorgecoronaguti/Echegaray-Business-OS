// EL PANEL DE UN PROVEEDOR — el alta y la corrección del maestro.
//
// ═══ EL CUIT ES LA IDENTIDAD, Y POR ESO ES EL PRIMER CAMPO ═══
//
// El dueño pidió *"proveedor como entidad canónica administrable"* y *"evitar duplicados por texto
// libre"*. La identidad no puede ser el nombre: "Corralón Progreso", "CORRALON PROGRESO" y
// "Corralon Progreso SRL" son tres textos y un proveedor. El CUIT es la única clave que ARCA, el
// banco y el Sheet comparten, y por eso manda. Se guarda con 11 dígitos y sin guiones —lo
// normaliza `normalizarCuit`— porque escrito de dos formas deja de cruzar contra ARCA, que es para
// lo único que sirve la columna.
//
// El CUIT es OPCIONAL a propósito: 14 de los 36 proveedores cargados no lo tienen, y exigirlo
// dejaría a Administración sin poder registrar un proveedor real hasta conseguir un papel.

import Link from 'next/link'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Proveedor } from '../types'

export function CamposProveedor({ proveedor }: { proveedor: Proveedor | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre" ancho="col-span-2" ayuda="Como se lo nombra en obra y en el Sheet.">
        <input
          name="nombre" required maxLength={200} className={CTRL}
          defaultValue={proveedor?.nombre ?? ''} data-testid="proveedor-nombre"
        />
      </Campo>
      <Campo label="CUIT" ancho="col-span-2" ayuda="11 dígitos. Se guarda sin guiones.">
        <input
          name="cuit" inputMode="numeric" maxLength={15} className={CTRL}
          defaultValue={proveedor?.cuit ?? ''} data-testid="proveedor-cuit"
        />
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

export function PanelProveedor({
  proveedor,
  crear,
  editar,
  archivar,
  cerrarHref,
}: {
  /** `null` = alta. */
  proveedor: Proveedor | null
  crear: AccionFormulario
  editar: AccionFormulario
  archivar: (proveedorId: string, activo: boolean) => Promise<ResultadoAccion>
  cerrarHref: string
}) {
  const esAlta = proveedor === null

  return (
    <aside
      data-testid="panel-proveedor"
      className="w-full shrink-0 border-t border-line bg-surface-quiet px-4 py-4 lg:w-[360px] lg:border-l lg:border-t-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            {esAlta ? 'Nuevo proveedor' : proveedor.activo ? 'Proveedor activo' : 'Archivado'}
          </p>
          <p className="truncate text-[14px] font-semibold text-ink">
            {proveedor?.nombre ?? 'Cargar un proveedor'}
          </p>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-panel" className="shrink-0 text-[12px] text-muted hover:text-ink">
          cerrar
        </Link>
      </div>

      <div className="mt-4">
        <FormAccion
          accion={esAlta ? crear : editar}
          testid={esAlta ? 'form-proveedor-alta' : 'form-proveedor-editar'}
          enviar={esAlta ? 'Crear' : 'Guardar'}
          limpiarAlOk={esAlta}
          mensajeOk={esAlta ? 'Proveedor creado.' : 'Guardado.'}
        >
          <CamposProveedor proveedor={proveedor} />
        </FormAccion>
      </div>

      {!esAlta && (
        <div className="mt-5 border-t border-line pt-3">
          <p className="mb-2 text-[12px] text-muted">
            {proveedor.activo
              ? 'Archivar lo saca de la lista operativa. Las compras que ya tiene imputadas no se tocan.'
              : 'Está archivado: no aparece en la lista ni se ofrece para vincular nombres.'}
          </p>
          <BotonAccion
            accion={archivar}
            args={[proveedor.id, !proveedor.activo]}
            testid={proveedor.activo ? 'archivar-proveedor' : 'activar-proveedor'}
            tono={proveedor.activo ? 'peligro' : 'neutral'}
          >
            {proveedor.activo ? 'Archivar' : 'Volver a activar'}
          </BotonAccion>
        </div>
      )}
    </aside>
  )
}
