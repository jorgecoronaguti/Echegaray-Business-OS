// LA LISTA DE COMPRAS DE UN PROVEEDOR, CON SU COMPROBANTE AL LADO — la cara «Compras» de la ficha.
//
// Pedido del dueño, 14/09/2026: «no quiero una solapa de comprobantes en proveedores, quiero los
// comprobantes adjuntos al lado de cada compra hecha, tal como aparece en pestaña compras».
//
// Es UNA lista: la de compras que la ficha ya tenía, ahora leída de `proveedor_compra` (CUIT, o
// nombre resuelto si la compra no trae CUIT) y con la columna del papel a la derecha. La solapa
// «Comprobantes» que la duplicaba salió, y con ella la cara «Papeles».
//
// Desde el 15/09/2026 la columna Obra es el MISMO desplegable de Compras: quien revisa las facturas
// de un proveedor las imputa acá, sin cambiar de pantalla.
//
// ═══ A 390px SCROLLEA ADENTRO ═══
//
// Seis columnas no entran en un teléfono y ninguna sobra. La caja hace `overflow-x: auto` con ancho
// mínimo propio, así que el documento no se ensancha.

import Link from 'next/link'
import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import { Aviso } from '@/shared/components/ds'
import { pesos } from '@/shared/components/canon/formato'
import {
  aniosDe, contarEstados, contarPapeles, delAnio, filtrarComprobantes, SIN_FECHA, SIN_OBRA,
  TODOS_LOS_ANIOS, totalVisible,
  type AnioFiltro, type FiltroEstado, type FiltroPapel, type FiltrosComprobantes,
} from '../../services/comprobantesProveedor'
import type { ComprasConPapel } from '../../services/comprobantesProveedorService'
import type { ServiceResult } from '../../services/comprasSheetService'
import { ANCHO_MINIMO_COMPRAS, COLS_COMPROBANTES } from './columnasComprobantes'
import { FilaComprobanteProveedor } from './FilaComprobanteProveedor'

const PAPEL: { clave: FiltroPapel; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todas' },
  { clave: 'con', etiqueta: 'Con comprobante' },
  { clave: 'sin', etiqueta: 'Sin comprobante' },
]

/**
 * PENDIENTE / PAGADO — pedido del dueño, 22/09/2026: «necesito un filtro de estado pendiente/pagado
 * ahí mismo para ver bien lo de comprobantes». Los dos valores son los de la columna «Estado» de la
 * pestaña, escritos igual. Lo que no es ninguno de los dos —proyectado, anulada, celda vacía— no se
 * reparte entre ellos: vive en «Todos» y la línea de abajo dice cuántos son.
 */
const ESTADOS: { clave: FiltroEstado; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'pendiente', etiqueta: 'Pendiente' },
  { clave: 'pagado', etiqueta: 'Pagado' },
]

/** Todo lo que la lista sabe recortar, en un solo lugar: lo que no se cambia, se conserva. */
export interface CambioDeFiltro {
  anio?: AnioFiltro
  papel?: FiltroPapel
  estado?: FiltroEstado
  obra?: string | null
  texto?: string | null
}

/**
 * LA URL DE UN RECORTE — la MISMA para los cinco filtros, y por eso se combinan sin pisarse.
 *
 * Es `export` porque la cara «Obras» arma con ella el enlace de cada obra: si tuviera su propia
 * versión, abrir una obra volvería a perder el estado o la búsqueda que ya estaban puestos, que es
 * justo lo que el dueño marcó cuatro veces el mismo día.
 */
export function urlDeComprobantes(
  proveedorId: string, f: FiltrosComprobantes, cambio: CambioDeFiltro, anioActual: number,
): string {
  const p = new URLSearchParams()
  const anio = cambio.anio ?? f.anio
  const papel = cambio.papel ?? f.papel
  const estado = cambio.estado ?? f.estado
  const obra = cambio.obra === undefined ? f.obra : cambio.obra
  const texto = cambio.texto === undefined ? f.texto : cambio.texto
  if (anio !== anioActual) p.set('anio', String(anio))
  if (papel !== 'todos') p.set('papel', papel)
  if (estado !== 'todos') p.set('estado', estado)
  if (obra) p.set('obra', obra)
  if (texto) p.set('q', texto)
  const qs = p.toString()
  return `/administracion/proveedores/${proveedorId}${qs ? `?${qs}` : ''}`
}

export function ComprasDelProveedor({ proveedorId, lectura, filtros, anioActual, opcionesObra }: {
  proveedorId: string
  lectura: ServiceResult<ComprasConPapel>
  filtros: FiltrosComprobantes
  anioActual: number
  /** El MISMO desplegable que Compras. Vacío ⇒ la obra se ve pero no se elige. */
  opcionesObra: string[]
}) {
  if (lectura.error !== null) {
    return <Aviso tono="neg" titulo="No pude leer las compras de este proveedor">{lectura.error}</Aviso>
  }
  const { filas, truncado, papelesSinLeer, obraEditable } = lectura.data
  // «Compras» es la cara por defecto: su URL no lleva `vista`.
  const base = `/administracion/proveedores/${proveedorId}`
  const url = (cambio: CambioDeFiltro) => urlDeComprobantes(proveedorId, filtros, cambio, anioActual)

  const delAnioElegido = delAnio(filas, filtros.anio)
  // LA OBRA RECORTA ANTES QUE LOS CHIPS: mirando una obra, «Pendiente 3» tiene que ser 3 de ESA
  // obra. Contarlos sobre el año entero diría un número que la lista de abajo no puede mostrar.
  const poblacion = filtrarComprobantes(delAnioElegido, {
    ...filtros, papel: 'todos', estado: 'todos', texto: null,
  })
  const cuentas = contarPapeles(poblacion)
  const estados = contarEstados(poblacion)
  const visibles = filtrarComprobantes(delAnioElegido, filtros)
  const suma = totalVisible(visibles)

  return (
    <div data-testid="compras-proveedor">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 24px', marginBottom: 8 }}>
        <FiltrosSuaves
          testid="filtro-anio"
          opciones={aniosDe(filas, anioActual).map((a) => ({
            clave: String(a),
            etiqueta: a === SIN_FECHA ? 'sin fecha' : a === TODOS_LOS_ANIOS ? 'todos los años' : String(a),
            href: url({ anio: a }), activo: a === filtros.anio,
          }))}
          conteo={{ n: delAnioElegido.length, total: filas.length, sustantivo: 'compras' }}
        />
        <FiltrosSuaves
          testid="filtro-estado"
          rotulo="Estado"
          opciones={ESTADOS.map((o) => ({
            ...o, href: url({ estado: o.clave }), activo: o.clave === filtros.estado,
            cuenta: o.clave === 'todos' ? undefined : estados[o.clave],
          }))}
        />
        <FiltrosSuaves
          testid="filtro-papel"
          opciones={PAPEL.map((o) => ({
            ...o, href: url({ papel: o.clave }), activo: o.clave === filtros.papel,
            // Si los papeles no se leyeron, los conteos no se dibujan: un 0 afirmaría algo no medido.
            cuenta: o.clave === 'todos' ? undefined : (papelesSinLeer ? null : cuentas[o.clave]),
          }))}
          conteo={{ n: visibles.length, total: delAnioElegido.length, sustantivo: 'del año' }}
        />
        <BuscadorFilo
          accion={base} q={filtros.texto ?? undefined}
          placeholder="Buscar en los comprobantes"
          oculto={{
            anio: filtros.anio === anioActual ? undefined : String(filtros.anio),
            papel: filtros.papel === 'todos' ? undefined : filtros.papel,
            estado: filtros.estado === 'todos' ? undefined : filtros.estado,
            obra: filtros.obra ?? undefined,
          }}
          testid="buscar-compra"
        />
      </div>

      {/* LA OBRA ABIERTA SE VE Y SE CIERRA. Sin esta línea, un enlace compartido con `?obra=` se
          leería como «este proveedor sólo tiene estos comprobantes». */}
      {filtros.obra && (
        <p style={{ fontSize: '12px', color: V.apagado, marginBottom: 8 }} data-testid="obra-abierta">
          Obra:{' '}
          <strong style={{ color: V.tinta }}>
            {filtros.obra === SIN_OBRA ? 'sin obra imputada' : filtros.obra}
          </strong>
          {' · '}
          <Link href={url({ obra: null })} prefetch={false} data-testid="quitar-obra" style={{ color: V.tinta, textDecoration: 'underline' }}>
            ver todas las obras
          </Link>
        </p>
      )}

      {/* LO QUE SUMA LO QUE SE VE. Es lo que deja cotejar el monto de la cara «Obras» contra sus
          comprobantes sin sacar una calculadora, y por eso dice también qué quedó fuera de la suma:
          una diferencia explicada no es una diferencia. */}
      <p style={{ fontSize: '12px', color: V.apagado, marginBottom: 8 }} data-testid="suma-visible">
        {visibles.length} {visibles.length === 1 ? 'comprobante' : 'comprobantes'} ·{' '}
        <span className="font-mono tabular-nums" style={{ color: V.tinta }} data-testid="suma-visible-total">
          {pesos(suma.total)}
        </span>
        {suma.anuladas > 0 && ` · ${suma.anuladas} anulada${suma.anuladas === 1 ? '' : 's'} que no suma${suma.anuladas === 1 ? '' : 'n'}`}
        {suma.sinImporte > 0 && ` · ${suma.sinImporte} sin importe cargado`}
        {estados.otro > 0 && filtros.estado === 'todos'
          && ` · ${estados.otro} sin «Pendiente» ni «Pagado» en la pestaña`}
      </p>

      <div style={{ overflowX: 'auto' }} data-testid="caja-scroll-compras">
        <div style={{ minWidth: ANCHO_MINIMO_COMPRAS }}>
          <div className={`grid gap-[14px] ${COLS_COMPROBANTES}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
            <RotuloCol>Fecha</RotuloCol>
            <RotuloCol>Concepto</RotuloCol>
            <RotuloCol>Obra</RotuloCol>
            <RotuloCol derecha>Importe</RotuloCol>
            <RotuloCol>Estado</RotuloCol>
            <RotuloCol>Comprobante</RotuloCol>
          </div>
          {visibles.map((c) => (
            <FilaComprobanteProveedor key={`${c.fila}-${c.clave ?? ''}`} c={c}
              papelesSinLeer={papelesSinLeer} proveedorId={proveedorId} opcionesObra={opcionesObra}
              // SIN OPCIONES NO SE EDITA: un desplegable vacío deja elegir «sin imputar» y nada más,
              // que es una forma de borrar la obra sin poder ponerle otra.
              obraEditable={obraEditable && opcionesObra.length > 0}
            />
          ))}
        </div>
      </div>

      {visibles.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="compras-vacio">
          {/* NUNCA EN BLANCO: una tabla vacía sin motivo se lee como «se rompió otra vez». Cada
              recorte dice lo suyo, del más grueso al más fino. */}
          {delAnioElegido.length === 0
            ? (filtros.anio === SIN_FECHA
                ? 'Ninguna compra sin fecha.'
                : filtros.anio === TODOS_LOS_ANIOS
                  ? 'Este proveedor no tiene compras cargadas.'
                  : `Sin compras en ${filtros.anio}.`)
            : poblacion.length === 0 && filtros.obra
              ? `Ningún comprobante imputado a ${filtros.obra === SIN_OBRA ? 'ninguna obra' : filtros.obra} en este corte.`
              : filtros.texto
                ? `Ningún comprobante con «${filtros.texto}».`
                : filtros.estado !== 'todos'
                  ? `Ninguno con estado «${filtros.estado === 'pagado' ? 'Pagado' : 'Pendiente'}».`
                  : 'Ninguna compra coincide.'}
        </p>
      )}
      {truncado && (
        <p style={{ fontSize: '11px', color: V.warn, paddingTop: 8 }} data-testid="compras-truncado">
          La lectura llegó al tope: puede haber compras que no se listan.
        </p>
      )}
    </div>
  )
}
