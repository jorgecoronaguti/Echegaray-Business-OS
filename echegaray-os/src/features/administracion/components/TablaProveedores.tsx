// 22 · PROVEEDORES CARTERA — porte literal de `echegaray-design/22 · Proveedores Cartera.dc.html`.
//
// El CUIT se MUESTRA formateado para leerlo (30-70839055-7) pero se GUARDA sin guiones: el formato
// es de la pantalla, no del dato. Guardado con guiones dejaría de cruzar contra ARCA y contra el
// banco, que es para lo único que existe la columna.
//
// ═══ CUATRO COLUMNAS DE LAS SEIS DEL CANÓNICO, Y CUÁLES FALTAN ═══
//
// El zip dibuja PROVEEDOR · RUBRO · TIPO · CUIT · COMPRADO 12 M · PAPELES. Acá están las cuatro que
// la base puede probar. RUBRO no existe como columna en `proveedores` y no se deriva de nada.
// PAPELES tampoco: ninguna tabla vincula un archivo con un proveedor —el mismo agujero que declara
// la ficha 23—, y una columna de ✓ sobre eso sería la afirmación más cara de esta pantalla: diría
// «tiene los papeles al día» sin haber mirado ningún papel.
//
// COMPRADO no dice «12 M». `proveedor_nombre_resuelto` publica comprobantes y total, no fechas: el
// total es histórico. Rotularlo «12 M» sería inventar la ventana de tiempo (regla de oro 3).
//
// ═══ LOS ANCHOS SON LOS DEL ZIP, MENOS LAS DOS COLUMNAS QUE NO EXISTEN ═══
//
// El canónico fija `minmax(0,1.4fr) minmax(0,1.2fr) 138px 138px 124px 76px 26px`. Al caer RUBRO
// (la segunda) y PAPELES (la sexta), cada columna que sobrevive conserva SU ancho medido y el
// sobrante va al nombre, que es la que se estira. Reinventar los anchos porque cambió la cantidad
// de columnas dibujaría una tabla que no se parece a ninguna de las otras cuatro carteras.

import Link from 'next/link'
import { Estado } from '@/shared/components/ds'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  IcoCuadrilla, IcoEquipo, entero, millones,
} from '@/shared/components/canon'
// El formateo vive en `services/identidad.ts` y no acá: en un archivo con JSX `node --test` no lo
// puede ejercitar, y un formateador que parte a ciegas convierte un dato roto en uno con forma de
// válido. Se re-exporta para no romper a quien ya lo importaba desde este componente.
import { formatearCuit } from '../services/identidad'
import type { CompradoProveedor, ResumenCartera } from '../services/proveedoresService'
import type { Proveedor } from '../types'

export { formatearCuit }

/** `22`, línea 100, sin RUBRO ni PAPELES. */
const COLS = 'minmax(0,1.4fr) 138px 138px 124px 26px'

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
    <TarjetaTabla testid="tabla-proveedores">
      <EncabezadoCanon
        cols={COLS}
        columnas={[
          { rotulo: 'PROVEEDOR' },
          { rotulo: 'TIPO' },
          { rotulo: 'CUIT' },
          // Sin «12 M»: la vista que suma no publica la fecha de cada comprobante.
          { rotulo: 'COMPRADO', alineacion: 'derecha' },
          { rotulo: '', vacia: true },
        ]}
      />

      {proveedores.map((p) => {
        const c = comprado?.get(p.id)
        const esSub = subcontratistas?.has(p.id) ?? false
        return (
          <FilaCanon
            key={p.id}
            cols={COLS}
            alto={ALTO.fila}
            seleccionada={p.id === seleccionado}
            testid="fila-proveedor"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              {/* El icono dice el TIPO de un vistazo, como en el canónico. Cuando no se sabe, va el
                  genérico: no se dibuja el de material «por defecto», que afirmaría un tipo. */}
              <span style={{ display: 'flex', color: C.apagado, flexShrink: 0 }} title={esSub ? 'Subcontratista' : 'Tipo sin determinar'}>
                {esSub ? <IcoCuadrilla s={15} /> : <IcoEquipo s={15} />}
              </span>
              <Link href={hrefDe(p.id)} data-testid="abrir-proveedor" style={{ minWidth: 0 }} className="block">
                <span className="block truncate hover:underline" style={{ fontSize: '12.5px', fontWeight: 500, color: C.tinta }}>
                  {p.nombre}
                  {/* Archivado va pegado al nombre y no en una columna propia: la lista muestra
                      activos por defecto, y una columna que dice «activo» en todas las filas gasta
                      ancho para no decir nada. */}
                  {!p.activo && <span style={{ marginLeft: 8, fontSize: '10px', color: C.tenue }} data-estado="archivado">archivado</span>}
                </span>
                {p.razon_social && p.razon_social !== p.nombre && (
                  <span className="block truncate" style={{ fontSize: '11px', color: C.tenue }}>{p.razon_social}</span>
                )}
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {/* SÓLO SE DIBUJA LO QUE SE PUEDE PROBAR. Un proveedor sin paquetes no es «Material»:
                  es uno del que no sabemos el tipo, y la celda vacía dice eso sin inventarlo. */}
              {esSub
                ? <Estado tono="curso" clave="subcontratista" testid="tipo-proveedor">Subcontratista</Estado>
                : <span style={{ fontSize: '12px', color: C.tenue }}>—</span>}
            </div>

            <CeldaTexto mono tam="11.5px" color={p.cuit ? C.tintaSuave : C.warn}>
              {/* SIN CUIT NO ES UN HUECO: es un dato que falta y que BLOQUEA — sin él la compra no
                  cruza con ARCA ni con el banco. Por eso va en ámbar, como en el canónico. */}
              {p.cuit
                ? formatearCuit(p.cuit)
                : <span data-testid="celda-sin-cuit">sin cargar</span>}
            </CeldaTexto>

            <CeldaTexto mono alineacion="derecha" color={c ? C.tinta : C.tenue} titulo={c ? `${c.comprobantes} comprobantes` : undefined}>
              {/* SIN NOMBRES VINCULADOS NO ES $ 0. Un cero afirmaría que se le compró por cero; lo
                  que pasa es que ningún texto de Compras apunta todavía a esta ficha. */}
              {c ? (millones(c.total) ?? 'sin compras') : comprado ? 'sin compras' : 'sin leer'}
            </CeldaTexto>

            <span />
          </FilaCanon>
        )
      })}

      {proveedores.length === 0 && (
        <VacioCanon testid="proveedores-vacio">Ningún proveedor coincide con lo buscado.</VacioCanon>
      )}

      {/* EL PIE CUENTA LO QUE LA PANTALLA MUESTRA, no la empresa: cambia con el filtro y con la
          búsqueda, igual que las filas que resume. El aviso de cuántos sin CUIT hay en TOTAL vive
          arriba, en la barra de atención, y cuenta con el predicado de la base. */}
      <PieCanon
        totales={[
          { rotulo: 'PROVEEDORES', valor: entero(resumen.proveedores) ?? '0' },
          {
            rotulo: 'SUBCONTRATISTAS',
            valor: subcontratistas ? (entero(resumen.subcontratistas) ?? '0') : 'sin leer',
            testid: 'total-subcontratistas',
          },
          {
            rotulo: 'SIN CUIT',
            valor: entero(resumen.sinCuit) ?? '0',
            color: resumen.sinCuit > 0 ? C.warn : C.tinta,
            testid: 'total-sin-cuit',
          },
          {
            rotulo: 'COMPRADO',
            valor: resumen.comprado === null ? 'sin compras' : (millones(resumen.comprado) ?? 'sin compras'),
            fuerte: true,
          },
        ]}
      />
    </TarjetaTabla>
  )
}
