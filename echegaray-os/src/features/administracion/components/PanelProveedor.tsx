// LA FICHA CORTA DE UN PROVEEDOR — `22 · Proveedores v2.dc.html`, líneas 147-203.
//
// ═══ EL CUIT ES LA IDENTIDAD, Y POR ESO ES LO PRIMERO QUE RECLAMA ═══
//
// El dueño pidió *"proveedor como entidad canónica administrable"* y *"evitar duplicados por texto
// libre"*. La identidad no puede ser el nombre: «Corralón Progreso», «CORRALON PROGRESO» y «Corralon
// Progreso SRL» son tres textos y un proveedor. El CUIT es la única clave que ARCA, el banco y el
// Sheet comparten. Se guarda con 11 dígitos y sin guiones —lo normaliza `normalizarCuit`— porque
// escrito de dos formas deja de cruzar.
//
// Es OPCIONAL a propósito: 14 de los 36 proveedores cargados no lo tienen (medido 24/08/2026), y
// exigirlo dejaría a Administración sin poder registrar un proveedor real hasta conseguir un papel.
// Lo que sí se hace es DECIR qué se pierde sin él y poner el campo ahí mismo.
//
// ═══ CRITERIO 2: EL VERBO FUNCIONA EN EL LUGAR ═══
//
// «Cargar CUIT →» y «Editar» abren su formulario DEBAJO, en el panel. No navegan a una pantalla de
// edición: el patrón prohíbe el `Ver → Editar → formulario → Guardar`, y con razón — quien viene de
// la fila que reclama el CUIT ya sabe qué va a escribir, y mandarlo a otra ruta le hace perder de
// vista cuál de los 14 estaba resolviendo.
//
// ═══ LO QUE EL MOCKUP DIBUJA Y LA BASE NO PUEDE PROBAR ═══
//
// «ÚLTIMAS COMPRAS» con fecha, obra e importe por comprobante. Ninguna vista publica el
// comprobante de un proveedor: `proveedor_nombre_resuelto` agrega por nombre —comprobantes y total,
// sin fecha ni obra— y `costos_obra` guarda el proveedor como TEXTO LIBRE, así que llegar a sus
// filas exige normalizar dentro de Postgres, que PostgREST no puede hacer desde acá. Emparejar por
// el texto crudo encontraría sólo las grafías exactas y publicaría un «últimas compras» incompleto
// sin avisar, que es peor que no tenerlo. Se dibuja lo que sí está —los nombres vinculados con su
// peso— y el motivo queda escrito EN LA PANTALLA, no sólo acá.

import Link from 'next/link'
import { BotonAccion, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { CamposProveedor } from './proveedores/CamposProveedor'
import { IconoCerrar, IconoEditar, IconoProblema } from '@/shared/components/iconos'
import { pesos } from '@/shared/components/canon/formato'
import { formatearCuit } from '../services/identidad'
import { PanelFilo, RotuloPanel, V } from './proveedores/patron'
import type { ComprasDelProveedor } from '../services/proveedoresService'
import type { Proveedor } from '../types'

/** Una fila de propiedad del panel: rótulo de 104px y valor. `22v2:170-175`. */
function Prop({ k, children, apagado }: { k: string; children: React.ReactNode; apagado?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}>
      <span style={{ fontSize: '11.5px', color: V.tenue, width: 104, flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: '12px', color: apagado ? V.tenue : V.tinta, minWidth: 0 }}>{children}</span>
    </div>
  )
}

/**
 * LA BANDA DE LO QUE FALTA, CON EL CAMPO ADENTRO. `22v2:159-167`.
 *
 * El formulario manda los cuatro campos porque `editarProveedor` valida el registro entero y
 * comprueba que ni el CUIT ni el nombre normalizado sean de otro. Los tres que no se editan viajan
 * ocultos con su valor actual: partir la acción en una que sólo toque el CUIT sería una segunda
 * puerta de escritura sin el control de duplicados, que es el único motivo por el que la columna
 * existe.
 */
function CargarCuit({ proveedor, editar, abierto }: {
  proveedor: Proveedor
  editar: AccionFormulario
  abierto: boolean
}) {
  return (
    <details open={abierto} data-testid="cargar-cuit" style={{ marginTop: 14 }}>
      <summary
        className="cursor-pointer list-none"
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          borderTop: `1px solid ${V.lineaFila}`, borderBottom: `1px solid ${V.lineaFila}`,
          padding: '9px 0 9px 11px', boxShadow: `inset 2px 0 0 ${V.warn}`,
        }}
      >
        <span style={{ display: 'flex', color: V.warn, flexShrink: 0 }}>
          <IconoProblema className="h-[14px] w-[14px]" />
        </span>
        <span style={{ fontSize: '12px', color: V.tintaSuave, flex: 1, minWidth: 0 }}>
          No cruza con ARCA ni con el banco.
        </span>
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, flexShrink: 0 }}>Cargar CUIT →</span>
      </summary>
      <div style={{ paddingTop: 12 }}>
        <FormAccion accion={editar} testid="form-cargar-cuit" enviar="Guardar CUIT" mensajeOk="CUIT cargado.">
          <input type="hidden" name="nombre" value={proveedor.nombre} />
          <input type="hidden" name="razon_social" value={proveedor.razon_social ?? ''} />
          <input type="hidden" name="notas" value={proveedor.notas ?? ''} />
          <Campo label="CUIT" ayuda="11 dígitos. Se guarda sin guiones.">
            <input name="cuit" inputMode="numeric" maxLength={15} className={CTRL} data-testid="cuit-inline" autoFocus={abierto} />
          </Campo>
        </FormAccion>
      </div>
    </details>
  )
}

export function PanelProveedor({
  proveedor, compras, crear, editar, archivar, cerrarHref, abrirCuit = false,
}: {
  /** `null` = alta. */
  proveedor: Proveedor | null
  /** Lo que llega de Compras. `null` en el alta, o cuando la lectura de la cartera falló. */
  compras: ComprasDelProveedor | null
  crear: AccionFormulario
  editar: AccionFormulario
  archivar: (proveedorId: string, activo: boolean) => Promise<ResultadoAccion>
  cerrarHref: string
  /** Viene de la fila que reclama el CUIT: el formulario ya llega abierto. */
  abrirCuit?: boolean
}) {
  if (proveedor === null) {
    return (
      <PanelFilo testid="panel-proveedor">
        <Cabecera titulo="Nuevo proveedor" cerrarHref={cerrarHref} />
        <div style={{ marginTop: 18 }}>
          <FormAccion accion={crear} testid="form-proveedor-alta" enviar="Crear" limpiarAlOk mensajeOk="Proveedor creado.">
            <CamposProveedor proveedor={null} />
          </FormAccion>
        </div>
      </PanelFilo>
    )
  }

  const sinCompras = compras === null || compras.nombres.length === 0
  return (
    <PanelFilo testid="panel-proveedor">
      <Cabecera
        titulo={proveedor.nombre}
        cerrarHref={cerrarHref}
        bajo={
          <span className="font-mono" style={{ fontSize: '12px', color: proveedor.cuit ? V.apagado : V.warn }}>
            {proveedor.cuit ? formatearCuit(proveedor.cuit) : 'sin CUIT'}
          </span>
        }
        fichaHref={`/administracion/proveedores/${proveedor.id}`}
      />

      {!proveedor.cuit && <CargarCuit proveedor={proveedor} editar={editar} abierto={abrirCuit} />}

      <div style={{ marginTop: 18 }} data-testid="proveedor-props">
        <Prop k="Estado" apagado={!proveedor.activo}>{proveedor.activo ? 'Activo' : 'Archivado'}</Prop>
        <Prop k="Razón social" apagado={!proveedor.razon_social}>{proveedor.razon_social ?? 'sin cargar'}</Prop>
        <Prop k="Comprado" apagado={sinCompras}>
          {/* NI CERO NI GUIÓN MUDO: se distingue «no se le compró» de «no lo pude leer». */}
          {compras === null
            ? 'no pude leerlo'
            : compras.comprado === null
              ? 'sin compras'
              : <span data-testid="proveedor-comprado" className="font-mono tabular-nums">{pesos(compras.comprado)} · histórico</span>}
        </Prop>
        <Prop k="Comprobantes" apagado={sinCompras}>
          {compras === null ? 'no pude leerlos' : compras.comprobantes > 0 ? compras.comprobantes : 'ninguno'}
        </Prop>
        <Prop k="Notas" apagado={!proveedor.notas}>{proveedor.notas ?? 'sin cargar'}</Prop>
      </div>

      <div style={{ marginTop: 20 }}>
        <RotuloPanel cuenta={compras && compras.nombres.length ? compras.nombres.length : undefined}>
          Nombres de Compras vinculados
        </RotuloPanel>
        {sinCompras
          ? (
              <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="proveedor-sin-nombres">
                {compras === null
                  ? 'No pude leer la resolución de nombres: esta ficha no puede afirmar que no se le compró nada.'
                  : 'Todavía no se le compró nada: ningún texto de Compras apunta a esta ficha.'}
              </p>
            )
          : (
              <div data-testid="nombres-vinculados">
                {compras.nombres.map((n) => (
                  <div key={n.nombre_norm} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${V.lineaPanel}` }}>
                    {/* De dónde salió el vínculo: el nombre escrito IGUAL que el maestro, o una
                        resolución que alguien firmó. No es lo mismo para auditarlo. */}
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue, width: 52, flexShrink: 0 }}>
                      {n.manual ? 'resuelto' : 'exacto'}
                    </span>
                    <span className="truncate" style={{ fontSize: '12px', color: V.tintaSuave, minWidth: 0 }}>{n.nombre_norm}</span>
                    <span className="font-mono tabular-nums" style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tinta, flexShrink: 0 }}>
                      {pesos(n.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
        <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 10, textWrap: 'pretty' }} data-testid="sin-detalle-comprobantes">
          El detalle comprobante por comprobante —fecha y obra— no se puede mostrar: Compras guarda
          el proveedor como texto libre y ninguna vista publica esas filas por proveedor. Se ve por
          nombre vinculado, que es lo que el OS sí puede probar.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        <details data-testid="editar-proveedor" style={{ minWidth: 0, flex: '1 1 100%' }}>
          <summary
            className="inline-flex cursor-pointer list-none items-center gap-[7px] hover:border-[#D7D5CF]"
            style={{
              border: `1px solid ${V.linea}`, background: '#FFFFFF', color: V.tinta,
              fontSize: '12.5px', fontWeight: 500, borderRadius: 6, padding: '7px 12px',
            }}
          >
            <IconoEditar className="h-[14px] w-[14px]" />
            Editar
          </summary>
          <div style={{ paddingTop: 14 }}>
            <FormAccion accion={editar} testid="form-proveedor-editar" enviar="Guardar" mensajeOk="Guardado.">
              <CamposProveedor proveedor={proveedor} />
            </FormAccion>
          </div>
        </details>
        <BotonAccion
          accion={archivar}
          args={[proveedor.id, !proveedor.activo]}
          testid={proveedor.activo ? 'archivar-proveedor' : 'activar-proveedor'}
          tono="neutral"
        >
          {proveedor.activo ? 'Archivar' : 'Volver a activar'}
        </BotonAccion>
        <span style={{ fontSize: '11px', color: V.tenue }}>
          {proveedor.activo
            ? 'Sale de la cartera activa; sus compras quedan.'
            : 'No aparece en la lista ni se ofrece para vincular nombres.'}
        </span>
      </div>
    </PanelFilo>
  )
}

function Cabecera({ titulo, bajo, cerrarHref, fichaHref }: {
  titulo: string
  bajo?: React.ReactNode
  cerrarHref: string
  fichaHref?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: V.tinta, lineHeight: 1.25 }}>{titulo}</h2>
        {bajo && <div style={{ marginTop: 3 }}>{bajo}</div>}
      </div>
      {/* LA PUERTA A LA FICHA COMPLETA. El panel sirve para elegir y para corregir cuatro campos; la
          ficha es donde el proveedor se entiende. Sin este enlace la única forma de llegar sería
          escribir la URL a mano. */}
      {fichaHref && (
        <Link href={fichaHref} data-testid="abrir-ficha-proveedor" style={{ flexShrink: 0, fontSize: '12px', color: V.apagado, textDecoration: 'underline' }}>
          Ver ficha
        </Link>
      )}
      <Link href={cerrarHref} data-testid="cerrar-panel" aria-label="Cerrar el panel" title="Cerrar" style={{ display: 'flex', color: V.tenue, flexShrink: 0 }}>
        <IconoCerrar className="h-[14px] w-[14px]" />
      </Link>
    </div>
  )
}
