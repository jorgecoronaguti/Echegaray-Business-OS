// LA FICHA DE UN PROVEEDOR — quién es, qué se le compró, y con qué nombres llega de Compras.
//
// ═══ EL CUIT ES LA IDENTIDAD, Y POR ESO ES EL PRIMER CAMPO ═══
//
// El dueño pidió *"proveedor como entidad canónica administrable"* y *"evitar duplicados por texto
// libre"*. La identidad no puede ser el nombre: «Corralón Progreso», «CORRALON PROGRESO» y «Corralon
// Progreso SRL» son tres textos y un proveedor. El CUIT es la única clave que ARCA, el banco y el
// Sheet comparten, y por eso manda. Se guarda con 11 dígitos y sin guiones —lo normaliza
// `normalizarCuit`— porque escrito de dos formas deja de cruzar contra ARCA.
//
// El CUIT es OPCIONAL a propósito: 14 de los 36 proveedores cargados no lo tienen, y exigirlo
// dejaría a Administración sin poder registrar un proveedor real hasta conseguir un papel. Lo que
// sí se hace es DECIR qué se pierde sin él, ahí donde falta.
//
// ═══ QUÉ NO ESTÁ EN LA FICHA, Y POR QUÉ ═══
//
// El handoff dibuja también condición de IVA, contacto y condición de pago. `public.proveedores` no
// tiene esas columnas —tiene nombre, razón social, CUIT, notas y activo—. Dibujarlas en «sin cargar»
// prometería un campo que el sistema no puede guardar: quien lo intentara no encontraría dónde. Se
// declara en el informe del bloque, con la migración que haría falta.

import Link from 'next/link'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Eyebrow, Nulo, Num } from '@/shared/components/ds'
import { plata } from '@/features/obras/components/formato'
import { PRIMARIA_FORM } from './Controles'
import { formatearCuit } from './TablaProveedores'
import type { ComprasDelProveedor } from '../services/proveedoresService'
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

function Propiedad({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[12px] text-muted">{k}</span>
      <span className="min-w-0 truncate text-right text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

export function PanelProveedor({
  proveedor, compras, crear, editar, archivar, cerrarHref,
}: {
  /** `null` = alta. */
  proveedor: Proveedor | null
  /** Lo que llega de Compras. `null` en el alta: todavía no hay a qué mirarle las compras. */
  compras: ComprasDelProveedor | null
  crear: AccionFormulario
  editar: AccionFormulario
  archivar: (proveedorId: string, activo: boolean) => Promise<ResultadoAccion>
  cerrarHref: string
}) {
  const esAlta = proveedor === null

  return (
    <aside
      data-testid="panel-proveedor"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[392px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {proveedor?.nombre ?? 'Nuevo proveedor'}
        </h2>
        <Link
          href={cerrarHref} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>

      {!esAlta && (
        <>
          <div className="mt-1">
            {proveedor.cuit
              ? <Num className="text-muted">{formatearCuit(proveedor.cuit)}</Num>
              : (
                  <p className="text-[12px] text-warn" data-testid="proveedor-sin-cuit">
                    Sin CUIT: no cruza con ARCA ni con el banco.
                  </p>
                )}
          </div>

          <div className="mt-4 space-y-2.5">
            <Propiedad k="Razón social">{proveedor.razon_social ?? <Nulo>sin cargar</Nulo>}</Propiedad>
            <Propiedad k="Estado">{proveedor.activo ? 'activo' : <Nulo>archivado</Nulo>}</Propiedad>
            <Propiedad k="Comprado (histórico)">
              {compras?.comprado == null
                ? <Nulo>sin compras vinculadas</Nulo>
                : <span data-testid="proveedor-comprado"><Num>{plata(compras.comprado)}</Num></span>}
            </Propiedad>
            <Propiedad k="Comprobantes">
              {compras && compras.comprobantes > 0 ? <Num>{compras.comprobantes}</Num> : <Nulo>ninguno</Nulo>}
            </Propiedad>
            <Propiedad k="Última compra">
              {/* La vista que publica lo comprado no publica la fecha máxima. Decirlo es más honesto
                  que poner la fecha de otra cosa. */}
              <Nulo>no la publica la vista</Nulo>
            </Propiedad>
            <Propiedad k="Notas">{proveedor.notas ?? <Nulo>sin cargar</Nulo>}</Propiedad>
          </div>

          <section className="mt-6">
            <Eyebrow className="mb-2.5">Nombres de Compras vinculados</Eyebrow>
            {!compras || compras.nombres.length === 0
              ? <Nulo>ningún nombre del Sheet apunta todavía a este proveedor</Nulo>
              : (
                  <ul className="space-y-1.5" data-testid="nombres-vinculados">
                    {compras.nombres.map((n) => (
                      <li key={n.nombre_norm} className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate border-b border-[#EFEEEA] pb-[2px] text-[11.5px] text-ink-soft">
                          {n.nombre_norm}
                        </span>
                        {/* De dónde salió el vínculo: el nombre escrito IGUAL que el maestro, o una
                            resolución que alguien decidió. No es lo mismo para auditarlo. */}
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-faint">
                          {n.manual ? 'resuelto' : 'exacto'}
                        </span>
                        <Num className="shrink-0 text-[11px] text-faint">{n.comprobantes}</Num>
                      </li>
                    ))}
                  </ul>
                )}
          </section>
        </>
      )}

      <section className={esAlta ? 'mt-4' : 'mt-6 border-t border-line pt-4'}>
        {!esAlta && <Eyebrow className="mb-2.5">Datos del proveedor</Eyebrow>}
        <FormAccion
          accion={esAlta ? crear : editar}
          testid={esAlta ? 'form-proveedor-alta' : 'form-proveedor-editar'}
          enviar={esAlta ? 'Crear' : 'Guardar'}
          limpiarAlOk={esAlta}
          mensajeOk={esAlta ? 'Proveedor creado.' : 'Guardado.'}
          className={PRIMARIA_FORM}
        >
          <CamposProveedor proveedor={proveedor} />
        </FormAccion>
      </section>

      {!esAlta && (
        <section className="mt-6 border-t border-line pt-4">
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
        </section>
      )}
    </aside>
  )
}
