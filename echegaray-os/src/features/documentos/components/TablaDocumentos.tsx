// LA TABLA DEL ARCHIVO — una fila por archivo de Drive.
//
// ═══ LAS COLUMNAS SON LAS DEL CANÓNICO 27, CON LAS DOS QUE NO TIENEN FUENTE DECLARADAS ═══
//
// El zip dibuja: DOCUMENTO · PERTENECE A · PARA QUÉ SIRVE · ESTADO · VENCE · SUBIDO.
//
// **PARA QUÉ SIRVE** se derivó de la categoría que esta pantalla ya calculaba (`PROPOSITO`): es la
// misma regla leída desde el uso del papel en vez de desde su tipo. La etiqueta de la categoría
// queda debajo, en la misma celda, para que el chip de arriba se siga pudiendo auditar mirando lo
// que devolvió.
//
// **SUBIDO no existe.** `drive_index` no tiene `created_time`: la única fecha del índice es
// `modified_time`, la última modificación en Drive. La columna se rotula MODIFICADO, que es lo que
// contiene. Rotularla «Subido» diría que ese día alguien cargó el archivo, y para un plano
// reeditado tres veces esa fecha no es la de la carga.
//
// **UBICACIÓN se fue de columna a subtítulo**: el canónico no la dibuja, pero la ruta es lo que
// permite ir a buscar el archivo a Drive. Va bajo el nombre, que es donde no compite con nada.
//
// ═══ ESTADO Y VENCE APARECEN JUNTAS, Y SÓLO CUANDO HAY FECHAS ═══
//
// Son la misma fuente: `documentacion_legajo.fecha_vencimiento`. Hoy está en `null` en las 847
// filas, así que ninguna de las dos se dibuja — 100 pastillas que dicen «sin control» no informan,
// empujan el resto fuera de la pantalla y enseñan a no mirar la columna. El día que se cargue el
// primer vencimiento las dos aparecen solas.
//
// Y NO HAY PASTILLA SIN FECHA. El zip pinta «Vigente» en verde en casi todas las filas, y también
// «Sin firmar» y «Falta»: los tres son estados que ninguna tabla de la base sabe. Sólo se dibuja el
// estado que `estadoVigencia` puede probar con una fecha.

import Link from 'next/link'
import { Estado, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { IconoCliente, IconoObra, IconoPersona } from '@/shared/components/iconos'
import { fecha } from '@/features/obras/components/formato'
import { estadoVigencia, hayVencimientos, migajaDe, resumirListado } from '../services/documentos'
import { categoriaDe, ETIQUETA_CATEGORIA, PROPOSITO } from '../services/categorias'
import type { ClaseVinculo, Documento } from '../types'

const TONO = { vencido: 'neg', 'vence-pronto': 'warn', vigente: 'pos' } as const
const PALABRA = { vencido: 'Vencido', 'vence-pronto': 'Vence pronto', vigente: 'Vigente' } as const

// UNA ACCIÓN = UN ICONO, y acá una CLASE = UN ICONO: el canónico 27 marca de qué cuelga el archivo
// con el mismo icono con el que se nombra esa entidad en todo el OS. Va con `title` porque solo no
// se lee: «obra», «persona» y «cliente» son tres siluetas parecidas a 13px.
const ICONO: Record<ClaseVinculo, typeof IconoObra> = {
  obra: IconoObra,
  persona: IconoPersona,
  cliente: IconoCliente,
}

function IconoClase({ clase }: { clase: ClaseVinculo }) {
  const Icono = ICONO[clase]
  return <Icono className="h-[13px] w-[13px] shrink-0 text-faint" />
}

/** Un par rótulo/número del pie. El rótulo va en versalitas `faint` y el número en `ink`, igual que
 *  el encabezado y la celda: el pie es el mismo par leído al revés. */
function Total({ rotulo, valor, tono }: { rotulo: string; valor: number; tono?: 'neg' | 'warn' }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</span>
      <span
        data-testid={`total-${rotulo.toLowerCase().replace(/\s+/g, '-')}`}
        className={`font-mono text-[12px] font-medium tabular-nums ${
          tono === 'neg' ? 'text-[#B42318]' : tono === 'warn' ? 'text-[#B54708]' : 'text-ink'
        }`}
      >
        {valor.toLocaleString('es-AR')}
      </span>
    </span>
  )
}

export function TablaDocumentos({
  documentos, seleccionado, hrefDe, hoy, vacio,
}: {
  documentos: Documento[]
  seleccionado?: string
  hrefDe: (driveFileId: string) => string
  /** El día contra el que se mide la vigencia, en ISO. Se pasa: `new Date()` dentro de un
   *  componente lo vuelve imposible de probar y hace que el render dependa del reloj del servidor. */
  hoy: string
  vacio: React.ReactNode
}) {
  if (documentos.length === 0) return <Vacio>{vacio}</Vacio>
  const conVence = hayVencimientos(documentos)
  // El pie cuenta LAS FILAS DIBUJADAS con el MISMO `hoy` con que se pintó cada pastilla. El total
  // del archivo entero lo dice la banda de arriba, que consulta Postgres: son dos preguntas, y
  // cruzarlas en la misma línea invitaría a leer los vencidos como parte de este listado.
  const totales = resumirListado(documentos, hoy)
  const columnas = conVence ? 6 : 4

  return (
    <Tabla testid="tabla-documentos" minWidth={conVence ? 940 : 720}>
      <THead>
        <Th>Documento</Th>
        <Th>Pertenece a</Th>
        <Th>Para qué sirve</Th>
        {conVence && <Th>Estado</Th>}
        {conVence && <Th num>Vence</Th>}
        <Th num>Modificado</Th>
      </THead>
      <tbody>
        {documentos.map((d) => {
          const vigencia = estadoVigencia(d.vence, hoy)
          const categoria = categoriaDe(d)
          const proposito = PROPOSITO[categoria]
          return (
            <Tr key={d.drive_file_id} compacta seleccionada={d.drive_file_id === seleccionado}>
              <Td fuerte className="max-w-0">
                <Link href={hrefDe(d.drive_file_id)} data-testid="abrir-documento" className="block truncate hover:underline">
                  {d.name}
                </Link>
                {/* LA RUTA ES EL SUBTÍTULO DEL NOMBRE, no una columna: dos archivos que se llaman
                    igual sólo se distinguen por dónde viven, y es lo que hay que copiar para ir a
                    buscarlo a Drive. */}
                <span className="block truncate text-[10.5px] font-normal text-faint" data-testid="ubicacion-documento">
                  {migajaDe(d.path) ?? 'sin ruta'}
                </span>
              </Td>
              <Td className="max-w-0">
                {d.vinculos.length === 0 ? (
                  // SIN VÍNCULO NO ES UN ERROR: 2 de cada 3 archivos del Drive no cuelgan de
                  // ninguna entidad todavía. Se dice, y la ruta de al lado ubica igual.
                  <Nulo>sin vincular</Nulo>
                ) : (
                  <div className="min-w-0 truncate">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-soft">
                      {/* El icono de la PRIMERA clase: cuando un archivo cuelga de dos entidades, el
                          detalle de abajo las nombra a las dos. Dos iconos en 13px de alto son dos
                          manchas. */}
                      <IconoClase clase={d.vinculos[0].clase} />
                      <span className="min-w-0 truncate">{d.vinculos.map((v) => v.nombre).join(' · ')}</span>
                    </span>
                    <span className="block truncate text-[10.5px] text-faint">
                      {d.vinculos.map((v) => v.detalle ?? `${v.clase} · sin clasificar`).join(' · ')}
                    </span>
                  </div>
                )}
              </Td>
              {/* PARA QUÉ SIRVE — el uso; abajo, la categoría que lo produjo. `otros` no tiene uso
                  conocido y son la mitad del archivo: la celda lo dice en vez de elegirle uno. */}
              <Td className="max-w-0">
                {proposito === null ? (
                  <Nulo>sin clasificar</Nulo>
                ) : (
                  <span className="block truncate text-[13px] text-ink-soft">{proposito}</span>
                )}
                <span className="block truncate text-[10.5px] text-faint" data-testid="categoria-documento">
                  {ETIQUETA_CATEGORIA[categoria]}
                </span>
              </Td>
              {conVence && (
                <Td>
                  {vigencia === null
                    ? <Nulo>sin control</Nulo>
                    : <Estado tono={TONO[vigencia]} clave={vigencia}>{PALABRA[vigencia]}</Estado>}
                </Td>
              )}
              {conVence && (
                <Td num className={vigencia === 'vencido' ? 'text-[#B42318]' : vigencia === 'vence-pronto' ? 'text-[#B54708]' : 'text-muted'}>
                  {d.vence ? fecha(d.vence) : <Nulo>—</Nulo>}
                </Td>
              )}
              <Td num className="text-muted">{fecha(d.modified_time)}</Td>
            </Tr>
          )
        })}
      </tbody>
      {/* EL PIE DE TOTALES DEL CANÓNICO. Va en `tfoot` y no en un `div` debajo: son los totales de
          estas columnas, y una tabla que scrollea de costado tiene que llevárselos con ella.

          VENCIDOS y POR VENCER SÓLO SE DIBUJAN SI HAY AL MENOS UNA FECHA CARGADA entre las filas
          listadas. Con cero fechas —el estado de hoy— un «VENCIDOS 0» se lee «está todo en orden», y
          lo que pasa es que nadie cargó el control. Es la misma regla que aplica la banda de arriba. */}
      <tfoot>
        <tr className="border-t border-line">
          <td colSpan={columnas} className="pt-2.5 pb-1 text-right" data-testid="totales-documentos">
            <span className="inline-flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1">
              <Total rotulo="Documentos" valor={totales.documentos} />
              {totales.conVencimiento > 0 && (
                <>
                  <Total rotulo="Vencidos" valor={totales.vencidos} tono={totales.vencidos > 0 ? 'neg' : undefined} />
                  <Total rotulo="Por vencer 30 d" valor={totales.porVencer} tono={totales.porVencer > 0 ? 'warn' : undefined} />
                </>
              )}
            </span>
          </td>
        </tr>
      </tfoot>
    </Tabla>
  )
}
