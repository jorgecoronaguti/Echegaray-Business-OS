// 22 · PROVEEDORES v2 — el maestro sin caja. Porte literal de `22 · Proveedores v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE DE AGOSTO ═══
//
// La tabla ya no vive en una tarjeta blanca con borde, radio, encabezado gris y pie de totales:
// criterio 3 del patrón, «sin cajas — filos, tipografía y números tabulares, el color sólo en la
// cifra». Con la caja se fue el PIE DE TOTALES: el v2 lo reemplaza por el conteo `n/total` al final
// de la línea de filtros, que dice lo mismo (cuánto de la cartera estoy viendo) sin un bloque gris.
// Y se fue la columna TIPO: «subcontratista» pasó a ser un chip al lado del nombre, porque una
// columna que dice «—» en 36 de 36 filas gasta ancho para no decir nada.
//
// ═══ LAS CUATRO COLUMNAS SON LAS QUE LA BASE PUEDE PROBAR ═══
//
// PROVEEDOR · CUIT · COMPRADO · COMPROB. El canónico v1 dibujaba además RUBRO y PAPELES; el v2 ya
// viene podado porque ninguna de las dos tiene fuente — `proveedores` no guarda rubro y ninguna
// tabla vincula un archivo con un proveedor. COMPRADO es HISTÓRICO y así lo dice la nota al pie:
// `proveedor_nombre_resuelto` publica comprobantes y total, no la fecha de cada uno, así que
// rotularlo «12 M» inventaría una ventana de tiempo que el dato no tiene (regla de oro 3).
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px la grilla suelta COMPRADO y COMPROB. y el chip de subcontrato, y deja
// PROVEEDOR · CUIT · verbo. El umbral y el orden en que se sueltan son del mockup (`22v2:401-409`):
// una fila sin nombre no identifica nada, así que el déficit de ancho nunca cae sobre él. Acá lo
// decide una media query y no `window.innerWidth`, para no volver la tabla un componente de cliente.

import Link from 'next/link'
import { IconoProveedor } from '@/shared/components/iconos'
import { formatearCuit } from '../services/identidad'
import { pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from './proveedores/patron'
import type { CompradoProveedor } from '../services/proveedoresService'
import type { Proveedor } from '../types'

/** `22v2:406-408`. Las clases van literales porque Tailwind no compila un valor armado en runtime. */
const COLS
  = 'grid-cols-[minmax(220px,1.6fr)_minmax(0,150px)_minmax(0,140px)_minmax(0,84px)_minmax(0,116px)]'
  + ' max-[1249px]:grid-cols-[minmax(160px,1.6fr)_minmax(0,1fr)_minmax(0,104px)]'
/**
 * Las celdas que se sueltan en angosto, en la fila y en el encabezado.
 *
 * EL `display` DE ESTAS CELDAS VA POR CLASE, NUNCA INLINE. Un `style={{ display: 'grid' }}` le gana
 * a `max-[1249px]:hidden` —un estilo inline gana a cualquier media query— y el rótulo se quedaba
 * dibujado sobre una grilla que ya no tenía su columna: «COMPROB.» aparecía pisando el nombre de la
 * primera fila. Medido a 1200px el 25/08/2026. Es la misma trampa que `EnvoltorioAncho` documenta.
 */
const SOLO_ANCHO = 'max-[1249px]:hidden'

export function TablaProveedores({
  proveedores, seleccionado, hrefDe, hrefCuitDe, comprado, subcontratistas, limpiarHref,
}: {
  proveedores: Proveedor[]
  seleccionado?: string
  hrefDe: (proveedorId: string) => string
  /** El verbo de la fila: abre el panel CON el formulario de CUIT desplegado, sin navegar afuera. */
  hrefCuitDe: (proveedorId: string) => string
  /** De `proveedor_nombre_resuelto`. `null` = no se pudo leer: la columna no afirma nada. */
  comprado: Map<string, CompradoProveedor> | null
  /** Los que tienen al menos un paquete en `subcontrato`. `null` = no se pudo leer. */
  subcontratistas: Set<string> | null
  limpiarHref: string
}) {
  return (
    <div data-testid="tabla-proveedores">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Proveedor</RotuloCol>
        <RotuloCol>CUIT · identidad</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Comprado</RotuloCol></span>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Comprob.</RotuloCol></span>
        <span style={{ paddingBottom: 6 }} />
      </div>

      {proveedores.map((p) => {
        const c = comprado?.get(p.id)
        const esSub = subcontratistas?.has(p.id) ?? false
        const elegido = p.id === seleccionado
        return (
          <div
            key={p.id}
            role="row"
            data-testid="fila-proveedor"
            data-seleccionada={elegido ? '' : undefined}
            className={`relative grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              height: ALTO_V2.fila,
              borderBottom: `1px solid ${V.lineaFila}`,
              background: elegido ? V.seleccion : undefined,
              // Estado y selección por canales distintos: el filo ámbar dice «esto bloquea» y
              // sobrevive a la selección, que se expresa sólo con el fondo (`22v2:422`).
              boxShadow: p.cuit ? undefined : FILO_BLOQUEA,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoProveedor className="h-[15px] w-[15px]" />
              </span>
              {/* El enlace se estira sobre la fila entera —el mockup la hace clicable completa— sin
                  anidar un enlace dentro de otro, que es HTML inválido y rompe el tabulador. */}
              <Link
                href={hrefDe(p.id)}
                data-testid="abrir-proveedor"
                className="min-w-0 truncate after:absolute after:inset-0 after:content-['']"
                style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}
              >
                {p.nombre}
                {!p.activo && (
                  <span style={{ marginLeft: 8, fontSize: '10px', color: V.tenue }} data-estado="archivado">archivado</span>
                )}
              </Link>
              {esSub && (
                // Dato secundario: no encoge y en angosto se va, porque si no su déficit cae sobre
                // el nombre. El panel lo sigue diciendo igual.
                <span
                  title="Tiene al menos un paquete de subcontrato"
                  data-testid="chip-subcontrato"
                  className={SOLO_ANCHO}
                  style={{
                    fontSize: '10.5px', color: V.apagado, border: `1px solid ${V.linea}`,
                    borderRadius: 5, padding: '1px 6px', flexShrink: 0,
                  }}
                >
                  subcontrato
                </span>
              )}
            </span>

            <span
              className="truncate font-mono"
              style={{ fontSize: '12px', color: p.cuit ? V.tintaSuave : V.warn }}
            >
              {/* SIN CUIT NO ES UN HUECO: es lo que impide cruzar la compra con ARCA y con el banco. */}
              {p.cuit ? formatearCuit(p.cuit) : <span data-testid="celda-sin-cuit">sin cargar</span>}
            </span>

            <span
              className={`font-mono tabular-nums ${SOLO_ANCHO}`}
              style={{ fontSize: '12px', textAlign: 'right', color: c ? V.tinta : V.cuentaApagada }}
            >
              {/* NO PUDE LEERLO ≠ NO SE LE COMPRÓ. Y ninguno de los dos es $ 0. */}
              {/* PESOS COMPLETOS, no la escala en millones: el mockup escribe `$ 64.180.000`
                  (`22v2:316`). A esta escala la abreviatura «$ 64,2 M» esconde justo el orden de
                  magnitud que separa a un proveedor de $ 900.000 de uno de $ 90.000.000. */}
              {c ? (pesos(c.total) ?? 'sin compras') : comprado ? 'sin compras' : 'sin leer'}
            </span>

            <span
              className={`font-mono tabular-nums ${SOLO_ANCHO}`}
              style={{ fontSize: '12px', textAlign: 'right', color: V.apagado }}
            >
              {c ? c.comprobantes : comprado ? '—' : 'sin leer'}
            </span>

            <span style={{ textAlign: 'right', paddingRight: 2, minWidth: 0 }}>
              {/* CRITERIO 2: la fila que reclama algo trae su verbo, y el verbo abre el formulario
                  acá mismo. Las filas que no reclaman nada no llevan verbo: una columna llena de
                  «Ver →» es ruido que esconde a las que sí piden trabajo. */}
              {!p.cuit && (
                <Link
                  href={hrefCuitDe(p.id)}
                  data-testid="fila-cargar-cuit"
                  className="relative z-10 hover:underline"
                  style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}
                >
                  Cargar CUIT →
                </Link>
              )}
            </span>
          </div>
        )
      })}

      {proveedores.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="proveedores-vacio">
          Nada coincide.{' '}
          <Link href={limpiarHref} data-testid="proveedores-ver-todo" style={{ color: V.tinta, fontWeight: 500, textDecoration: 'underline' }}>
            Ver todo
          </Link>
        </div>
      )}
    </div>
  )
}
