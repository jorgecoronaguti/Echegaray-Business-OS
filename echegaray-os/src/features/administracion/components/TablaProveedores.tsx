// EL LISTADO DE PROVEEDORES — el maestro canónico, identificado por CUIT (canónico 22).
//
// El CUIT se MUESTRA formateado para leerlo (30-70839055-7) pero se GUARDA sin guiones: el formato
// es de la pantalla, no del dato. Guardado con guiones dejaría de cruzar contra ARCA y contra el
// banco, que es para lo único que existe la columna.
//
// ═══ CUÁTRO COLUMNAS DE LAS SEIS DEL CANÓNICO, Y CUÁLES FALTAN ═══
//
// El zip dibuja PROVEEDOR · RUBRO · TIPO · CUIT · COMPRADO 12 M · PAPELES. Acá están las cuatro que
// la base puede probar. RUBRO no existe como columna en `proveedores` y no se deriva de nada.
// PAPELES tampoco: ninguna tabla vincula un archivo con un proveedor —el mismo agujero que declara
// la ficha 23—, y una columna de ✓ sobre eso sería la afirmación más cara de esta pantalla: diría
// «tiene los papeles al día» sin haber mirado ningún papel.
//
// COMPRADO no dice «12 M». `proveedor_nombre_resuelto` publica comprobantes y total, no fechas: el
// total es histórico. Rotularlo «12 M» sería inventar la ventana de tiempo (regla de oro 3).

import Link from 'next/link'
import { Estado, FilaTotal, Nulo, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import { plataCorta } from '@/features/obras/components/formato'
// El formateo vive en `services/identidad.ts` y no acá: en un archivo con JSX `node --test` no lo
// puede ejercitar, y un formateador que parte a ciegas convierte un dato roto en uno con forma de
// válido. Se re-exporta para no romper a quien ya lo importaba desde este componente.
import { formatearCuit } from '../services/identidad'
import type { CompradoProveedor, ResumenCartera } from '../services/proveedoresService'
import type { Proveedor } from '../types'

export { formatearCuit }

export function TablaProveedores({
  proveedores, seleccionado, hrefDe, comprado, subcontratistas, resumen,
}: {
  proveedores: Proveedor[]
  seleccionado?: string
  hrefDe: (proveedorId: string) => string
  /** De `proveedor_nombre_resuelto`. `null` = no se pudo leer: la columna no afirma nada. */
  comprado: Map<string, CompradoProveedor> | null
  /** Los que tienen al menos un paquete en `subcontrato`. `null` = no se pudo leer. */
  subcontratistas: Set<string> | null
  resumen: ResumenCartera
}) {
  return (
    <Tabla testid="tabla-proveedores" minWidth={720}>
      <THead>
        <Th>Proveedor</Th>
        <Th>Tipo</Th>
        <Th>CUIT</Th>
        <Th num>Comprado</Th>
      </THead>
      <tbody>
        {proveedores.map((p) => {
          const c = comprado?.get(p.id)
          return (
            <Tr key={p.id} data-testid="fila-proveedor" seleccionada={p.id === seleccionado}>
              <Td fuerte>
                <Link href={hrefDe(p.id)} className="block min-w-0" data-testid="abrir-proveedor">
                  <span className="text-[13px] text-ink hover:underline">{p.nombre}</span>
                  {/* Archivado va pegado al nombre y no en una columna propia: la lista muestra
                      activos por defecto, y una columna que dice «activo» en todas las filas gasta
                      ancho para no decir nada. */}
                  {!p.activo && <span className="ml-2 text-[10px] text-faint" data-estado="archivado">archivado</span>}
                  {p.razon_social && p.razon_social !== p.nombre && (
                    <span className="block truncate text-[11px] text-faint">{p.razon_social}</span>
                  )}
                </Link>
              </Td>
              <Td className="w-[150px]">
                {/* SÓLO SE DIBUJA LO QUE SE PUEDE PROBAR. Un proveedor sin paquetes no es «Material»:
                    es uno del que no sabemos el tipo, y la celda vacía dice eso sin inventarlo. */}
                {subcontratistas?.has(p.id)
                  ? <Estado tono="curso" clave="subcontratista" testid="tipo-proveedor">Subcontratista</Estado>
                  : <span className="text-[12px] text-faint">—</span>}
              </Td>
              <Td className="w-[170px]">
                {p.cuit
                  ? <span className="font-mono text-[12px] tabular-nums text-muted">{formatearCuit(p.cuit)}</span>
                  // SIN CUIT NO ES UN HUECO: es un dato que falta y que BLOQUEA — sin él la compra no
                  // cruza con ARCA ni con el banco. Por eso va en ámbar y con el motivo al lado en la
                  // ficha, no como un guión más en la tabla.
                  : <span className="font-mono text-[12px] text-warn" data-testid="celda-sin-cuit">sin cargar</span>}
              </Td>
              <Td num className="w-[150px]">
                {/* SIN NOMBRES VINCULADOS NO ES $ 0. Un cero afirmaría que se le compró por cero;
                    lo que pasa es que ningún texto de Compras apunta todavía a esta ficha. */}
                {c
                  ? (
                      <span title={`${c.comprobantes} comprobantes`}>
                        <Num className="text-ink">{plataCorta(c.total)}</Num>
                      </span>
                    )
                  : <Nulo>{comprado ? 'sin compras' : 'sin leer'}</Nulo>}
              </Td>
            </Tr>
          )
        })}
      </tbody>
      <tfoot>
        {/* EL PIE CUENTA LO QUE LA PANTALLA MUESTRA, no la empresa: cambia con el filtro y con la
            búsqueda, igual que las filas que resume. El aviso de cuántos sin CUIT hay en total vive
            arriba, en la barra de atención, y cuenta con el predicado de la base. */}
        <FilaTotal>
          <Td fuerte>
            <Num className="text-ink">{resumen.proveedores}</Num>{' '}
            <span className="text-[12px] font-normal text-muted">
              {resumen.proveedores === 1 ? 'proveedor' : 'proveedores'}
            </span>
          </Td>
          <Td>
            {subcontratistas
              ? (
                  <span data-testid="total-subcontratistas" className="text-[12px] font-normal text-muted">
                    <Num className="text-muted">{resumen.subcontratistas}</Num> subcontratistas
                  </span>
                )
              : <span className="text-[12px] font-normal text-faint">sin leer</span>}
          </Td>
          <Td>
            {resumen.sinCuit > 0
              ? (
                  <span data-testid="total-sin-cuit" className="text-[12px] font-normal text-warn">
                    <Num className="text-warn">{resumen.sinCuit}</Num> sin CUIT
                  </span>
                )
              : <span className="text-[12px] font-normal text-faint">todos con CUIT</span>}
          </Td>
          <Td num>
            {resumen.comprado === null
              ? <span className="text-[12px] font-normal text-faint">sin compras</span>
              : <Num className="text-ink" >{plataCorta(resumen.comprado)}</Num>}
          </Td>
        </FilaTotal>
      </tfoot>
    </Tabla>
  )
}
