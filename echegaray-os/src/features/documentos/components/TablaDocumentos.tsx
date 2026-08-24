// LA TABLA DEL ARCHIVO — una fila por archivo de Drive.
//
// La columna VENCE aparece SOLO si alguna fila a la vista tiene vencimiento. Hoy no lo tiene
// ninguna: las 847 filas de `documentacion_legajo` traen `fecha_vencimiento` en `null`. Una columna
// de 200 celdas que dicen «sin dato» no informa — empuja el resto fuera de la pantalla y enseña a
// no mirarla. El día que se cargue el primer vencimiento, la columna se dibuja sola.

import Link from 'next/link'
import { Estado, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { IconoCliente, IconoObra, IconoPersona } from '@/shared/components/iconos'
import { fecha } from '@/features/obras/components/formato'
import { estadoVigencia, hayVencimientos, migajaDe } from '../services/documentos'
import { categoriaDe, ETIQUETA_CATEGORIA } from '../services/categorias'
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

  return (
    <Tabla testid="tabla-documentos" minWidth={conVence ? 820 : 720}>
      <THead>
        <Th>Documento</Th>
        <Th>Vinculado a</Th>
        <Th>Ubicación</Th>
        <Th num>Modificado</Th>
        {conVence && <Th num>Vence</Th>}
      </THead>
      <tbody>
        {documentos.map((d) => {
          const vigencia = estadoVigencia(d.vence, hoy)
          return (
            <Tr key={d.drive_file_id} compacta seleccionada={d.drive_file_id === seleccionado}>
              <Td fuerte className="max-w-0">
                <Link href={hrefDe(d.drive_file_id)} data-testid="abrir-documento" className="block truncate hover:underline">
                  {d.name}
                </Link>
                {/* LA CATEGORÍA VA ACÁ Y NO EN UNA COLUMNA PROPIA: es lo que hace verificable el
                    chip de arriba —se ve por qué esta fila entró— y una columna más empujaría la
                    ruta fuera de la pantalla. Se calcula con la misma regla que filtró en Postgres. */}
                <span className="block text-[10.5px] font-normal text-faint" data-testid="categoria-documento">
                  {ETIQUETA_CATEGORIA[categoriaDe(d)]}
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
              <Td className="max-w-0 truncate text-muted">
                {migajaDe(d.path) ?? <Nulo>sin ruta</Nulo>}
              </Td>
              <Td num className="text-muted">{fecha(d.modified_time)}</Td>
              {conVence && (
                <Td num>
                  {vigencia === null
                    ? <Nulo>sin control</Nulo>
                    : <Estado tono={TONO[vigencia]} clave={vigencia}>{`${fecha(d.vence)} · ${PALABRA[vigencia]}`}</Estado>}
                </Td>
              )}
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}
