// LOS FILTROS COMBINABLES DE LA PESTAÑA COMPRAS — un `form` GET, sin una línea de JavaScript.
//
// Pedido del dueño (07/09/2026): *«necesito filtros para seccion compras y proveedores en modulo
// administracion»*, y al detallarlos: proveedor, fecha, obra e importe · estado de pago y
// vencimiento · período y categoría.
//
// ═══ POR QUÉ NO ES UN CONTROL NUEVO ═══
//
// `BarraFiltros` + `SelectFiltro` ya son exactamente esto —form GET, estado en la URL, se comparte y
// vuelve con «atrás»— y ya están en producción en Personal y Proveedores. Dibujar acá un tercer
// control de filtro con otro aspecto es lo que un sistema de componentes existe para evitar.
//
// ═══ LOS CHIPS NO SE PISAN ═══
//
// `f` (el chip: todo/aPagar/sinObra/…) y `s` (la fila abierta en el panel) viajan como campos ocultos.
// Sin eso, filtrar por proveedor devolvería a «Todo» y cerraría el panel: la persona perdería las dos
// decisiones que ya había tomado. Los chips deciden la población y estos criterios la recortan.
//
// Las opciones NO son constantes: salen de las filas reales (`opcionesDe`). Un desplegable escrito a
// mano ofrece proveedores que ya no están y esconde los que el dueño agregó ayer.

import { BarraFiltros, CampoFiltro, SelectFiltro } from './BarraFiltros'
import { LLAVE, type Criterios, type Opciones } from '../services/comprasFiltros'

/** El mes `2026-08` como «ago 2026», que es como se lee un período y no como se guarda. */
function rotuloPeriodo(p: string): string {
  const [a, m] = p.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${meses[Number(m) - 1] ?? m} ${a}`
}

const TODOS = { valor: '', etiqueta: 'Todos' }

export function FiltrosComprasSheet({
  accion, q, criterios, opciones, extra, limpiarHref,
}: {
  accion: string
  q?: string
  criterios: Criterios
  opciones: Opciones
  /** Lo que hay que conservar al filtrar: el chip activo y la fila abierta. */
  extra?: Record<string, string | undefined>
  /** A dónde lleva «limpiar». `undefined` = no hay ningún criterio puesto. */
  limpiarHref?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <BarraFiltros
        accion={accion}
        q={q}
        placeholder="Proveedor, concepto, comprobante…"
        testid="filtros-compras"
        extra={extra}
      >
        <SelectFiltro
          label="Proveedor" name={LLAVE.proveedor} valor={criterios.proveedor} testid="f-proveedor"
          opciones={[TODOS, ...opciones.proveedores.map((v) => ({ valor: v, etiqueta: v }))]}
        />
        <SelectFiltro
          label="Obra" name={LLAVE.obra} valor={criterios.obra} testid="f-obra"
          opciones={[TODOS, ...opciones.obras.map((v) => ({ valor: v, etiqueta: v }))]}
        />
        <SelectFiltro
          label="Estado" name={LLAVE.estado} valor={criterios.estado} testid="f-estado"
          opciones={[TODOS, ...opciones.estados.map((v) => ({ valor: v, etiqueta: v }))]}
        />
        <SelectFiltro
          label="Vencimiento" name={LLAVE.vencimiento} valor={criterios.vencimiento} testid="f-vencimiento"
          opciones={[TODOS, ...opciones.vencimientos.map((v) => ({ valor: v, etiqueta: v }))]}
        />
        <SelectFiltro
          label="Período" name={LLAVE.periodo} valor={criterios.periodo} testid="f-periodo"
          opciones={[TODOS, ...opciones.periodos.map((v) => ({ valor: v, etiqueta: rotuloPeriodo(v) }))]}
        />
        {/* La categoría se muestra con la letra de la pestaña. No se traduce: es la columna del dueño. */}
        <SelectFiltro
          label="Categoría" name={LLAVE.categoria} valor={criterios.categoria} testid="f-categoria"
          opciones={[TODOS, ...opciones.categorias.map((v) => ({ valor: v, etiqueta: v }))]}
        />
        <CampoFiltro label="Desde" name={LLAVE.desde} valor={criterios.desde} tipo="date" testid="f-desde" />
        <CampoFiltro label="Hasta" name={LLAVE.hasta} valor={criterios.hasta} tipo="date" testid="f-hasta" />
        <CampoFiltro
          label="Importe mín." name={LLAVE.min} placeholder="0"
          valor={criterios.min?.toString()} testid="f-min"
        />
        <CampoFiltro
          label="Importe máx." name={LLAVE.max} placeholder="sin tope"
          valor={criterios.max?.toString()} testid="f-max"
        />
      </BarraFiltros>
      {limpiarHref && (
        <a href={limpiarHref} className="self-start text-[11px] text-faint underline" data-testid="f-limpiar">
          Limpiar filtros
        </a>
      )}
    </div>
  )
}
