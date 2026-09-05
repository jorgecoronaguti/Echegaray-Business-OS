// 22 · PROVEEDORES — el maestro sin caja, con la geometría del handoff CRM / Administración v4.
//
// `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html`, bloque «2 · PROVEEDORES»:
//   `minmax(240px,1.6fr) 160px 130px 160px minmax(120px,1fr)`, gap 16
//   PROVEEDOR · CUIT · TIPO · COMPRADO · ÚLTIMA COMPRA
//
// La tabla no vive en una tarjeta blanca con borde, radio, encabezado gris y pie de totales:
// criterio 3 del patrón, «sin cajas — filos, tipografía y números tabulares, el color sólo en la
// cifra». Con la caja se fue el PIE DE TOTALES: lo reemplaza el conteo `n/total` al final de la
// línea de filtros, que dice lo mismo (cuánto de la cartera estoy viendo) sin un bloque gris.
//
// ═══ QUÉ CAMBIÓ EL CONTRATO v4 (05/09/2026) ═══
//
// TIPO VUELVE COMO COLUMNA. El porte de agosto la había retirado y había bajado «subcontratista» a
// un chip al lado del nombre. El v4 la vuelve a dibujar, y con razón: el chip competía por el ancho
// del nombre y en angosto desaparecía, o sea que el único dato que separa a quien pone material de
// quien pone gente se perdía justo cuando la pantalla se achica. Lo que la columna PUEDE probar es
// UNA sola cosa —«Subcontratista», de tener al menos un paquete en `subcontrato`—; el rubro que el
// mockup dibuja como «Materiales» o «Fletes» NO TIENE FUENTE: medido el 05/09/2026, `proveedores`
// tiene doce columnas y ninguna es el rubro. Por eso el resto de las filas dice «sin rubro» apagado
// —la palabra del mockup— y no un rubro adivinado del nombre.
//
// «COMPROB.» SALE Y ENTRA «ÚLTIMA COMPRA», CON LA FECHA REAL. El porte del 05/09 la había dejado
// diciendo «sin leer» en el 100% de las filas porque la vista `proveedor_nombre_resuelto` publicaba
// `comprobantes` y `total` pero no la fecha máxima. El mockup dibuja fechas en cuatro de sus cinco
// filas de muestra, así que una columna muda era una divergencia del contrato, no una limitación
// honesta: la migración `20260905T1600` agregó `max(fecha)` al mismo `group by` que ya se hacía.
// Medido después de aplicarla: 33 de 33 nombres vinculados traen fecha, 0 sin fecha.
//
// El formato es `diaMes` —«01/09»— que es el del zip. Cuando la compra NO es del año en curso se
// escribe el año («15/11/25»): sin él, una compra de hace catorce meses se lee como una de la
// semana pasada, que es mezclar dos ventanas de tiempo en la misma columna.
//
// COMPRADO es HISTÓRICO y así lo dice la nota al pie: rotularlo «12 M» inventaría una ventana de
// tiempo que el dato no tiene (regla de oro 3). PAPELES sigue sin dibujarse: ninguna tabla vincula
// un archivo con un proveedor.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px la grilla suelta TIPO, COMPRADO y ÚLTIMA COMPRA y deja PROVEEDOR · CUIT. El
// umbral es del mockup (`22v2:401-409`): una fila sin nombre no identifica nada, así que el déficit
// de ancho nunca cae sobre él. Acá lo decide una media query y no `window.innerWidth`, para no
// volver la tabla un componente de cliente.

import Link from 'next/link'
import { IconoProblema, IconoProveedor } from '@/shared/components/iconos'
import { formatearCuit } from '../services/identidad'
import { diaMes, pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import type { CompradoProveedor } from '../services/proveedoresService'
import type { Proveedor } from '../types'

/**
 * LA GRILLA DEL HANDOFF v4, carácter por carácter. Literal porque Tailwind no compila un valor
 * armado en runtime.
 */
const COLS
  = 'grid-cols-[minmax(240px,1.6fr)_160px_130px_160px_minmax(120px,1fr)]'
  + ' max-[1249px]:grid-cols-[minmax(160px,1.6fr)_minmax(0,1fr)]'
/** `gap:16` del bloque «2 · PROVEEDORES». El patrón v2 declara 14 y esta pantalla lo corre a 16. */
const GAP = 16
/**
 * Las celdas que se sueltan en angosto, en la fila y en el encabezado.
 *
 * EL `display` DE ESTAS CELDAS VA POR CLASE, NUNCA INLINE. Un `style={{ display: 'grid' }}` le gana
 * a `max-[1249px]:hidden` —un estilo inline gana a cualquier media query— y el rótulo se quedaba
 * dibujado sobre una grilla que ya no tenía su columna: «COMPROB.» aparecía pisando el nombre de la
 * primera fila. Medido a 1200px el 25/08/2026. Es la misma trampa que `EnvoltorioAncho` documenta.
 */
const SOLO_ANCHO = 'max-[1249px]:hidden'

/**
 * POR QUÉ UNA FILA PUEDE NO TENER FECHA, dicho en la celda y no sólo en un comentario. Con la
 * migración del 05/09 esto dejó de ser el caso general y pasó a ser el borde: un nombre vinculado
 * cuyas compras no tienen `fecha` cargada. Medido ese día: 0 de 33.
 */
const SIN_FECHA
  = 'Este proveedor tiene compras vinculadas, pero ninguna con fecha cargada en costos_obra.'

/**
 * LA FECHA DE LA COLUMNA. `diaMes` («01/09») mientras la compra sea de este año, que es lo que
 * dibuja el zip y lo que entra en la columna. Fuera del año en curso se agrega el año en dos
 * dígitos: «15/11» y «15/11/25» son la misma columna, pero uno de los dos es de hace catorce meses
 * y la tabla no puede decir lo mismo de los dos.
 */
export function fechaCompra(
  iso: string | null | undefined,
  // El año entra por parámetro para que se pueda probar: con `new Date()` adentro, el test que
  // afirma «una compra de 2026 se escribe 01/09» empieza a fallar solo el 1 de enero.
  anioActual = new Date().getFullYear(),
): string | null {
  const dm = diaMes(iso)
  if (!dm || !iso) return null
  const anio = Number(iso.slice(0, 4))
  return anio === anioActual ? dm : `${dm}/${String(anio).slice(2)}`
}

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
      <div className={`grid ${COLS}`} style={{ ...ENCABEZADO, gap: GAP }}>
        <RotuloCol>Proveedor</RotuloCol>
        <RotuloCol>CUIT</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Tipo</RotuloCol></span>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Comprado</RotuloCol></span>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Última compra</RotuloCol></span>
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
            className={`relative grid items-center ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              gap: GAP,
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
              {/* EL ⚠ DEL MOCKUP, no un SVG dibujado a mano: `IconoProblema` es el mismo triángulo
                  del §11 que ya usa el campo. Repite en forma lo que la celda de al lado dice en
                  palabras — quien barre la lista de un vistazo ve el problema sin leer. */}
              {!p.cuit && (
                <span
                  title="Sin CUIT no cruza con ARCA ni con el banco"
                  data-testid="alerta-sin-cuit"
                  style={{ display: 'flex', color: V.warn, flexShrink: 0 }}
                >
                  <IconoProblema className="h-[15px] w-[15px]" />
                </span>
              )}
            </span>

            {/* SIN CUIT NO ES UN HUECO: es lo que impide cruzar la compra con ARCA y con el banco.
                CRITERIO 2 — la fila que reclama algo trae su verbo, y acá el verbo ES la celda que
                reclama: la ausencia en ámbar abre el formulario del panel, sin navegar afuera. El
                v4 no dibuja una columna de verbos, y una columna llena de «Cargar CUIT →» en 14 de
                36 filas gasta el ancho que la ausencia ya usaba para decir lo mismo. */}
            {p.cuit
              ? (
                  <span className="truncate font-mono" style={{ fontSize: '12px', color: V.tintaSuave }}>
                    {formatearCuit(p.cuit)}
                  </span>
                )
              : (
                  <Link
                    href={hrefCuitDe(p.id)}
                    data-testid="fila-cargar-cuit"
                    title="Cargar el CUIT"
                    className="relative z-10 truncate hover:underline"
                    style={{ fontSize: '12px', color: V.warn }}
                  >
                    <span data-testid="celda-sin-cuit">sin cargar</span>
                  </Link>
                )}

            {/* TIPO — lo único que la base puede probar es el subcontrato. El rubro NO tiene columna
                en `proveedores` (medido el 05/09/2026): «sin rubro» va apagado porque no bloquea
                nada, y jamás se deduce del nombre. Una lectura fallida dice «sin leer», no «sin
                rubro»: un control que no pudo mirar no dice «no está». */}
            <span
              className={`truncate ${SOLO_ANCHO}`}
              style={{ fontSize: '12px', color: esSub ? V.tintaSuave : V.tenue }}
              data-testid="tipo-proveedor"
            >
              {esSub ? 'Subcontratista' : subcontratistas ? 'sin rubro' : 'sin leer'}
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

            {/* ÚLTIMA COMPRA — LA FECHA, Y DOS AUSENCIAS QUE NO SE DICEN IGUAL. Sin ningún nombre
                vinculado no hay compra y por lo tanto no hay fecha: ése es el «—» del mockup. Con
                compras vinculadas pero sin ninguna fechada, «sin fecha» y el motivo en el `title`:
                un «—» ahí afirmaría que nunca se le compró a alguien a quien sí se le compró. Y sin
                haber podido leer la cartera, «sin leer», que no es ninguna de las dos. */}
            <span
              className={`truncate font-mono tabular-nums ${SOLO_ANCHO}`}
              style={{ fontSize: '12px', color: V.tenue }}
              title={c && !c.ultima ? SIN_FECHA : undefined}
              data-testid="ultima-compra"
            >
              {c ? (fechaCompra(c.ultima) ?? 'sin fecha') : comprado ? '—' : 'sin leer'}
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
