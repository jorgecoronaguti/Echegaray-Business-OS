// LA TABLA DEL ARCHIVO — una fila por archivo de Drive.
//
// La columna VENCE aparece SOLO si alguna fila a la vista tiene vencimiento. Hoy no lo tiene
// ninguna: las 847 filas de `documentacion_legajo` traen `fecha_vencimiento` en `null`. Una columna
// de 200 celdas que dicen «sin dato» no informa — empuja el resto fuera de la pantalla y enseña a
// no mirarla. El día que se cargue el primer vencimiento, la columna se dibuja sola.

import Link from 'next/link'
import { Estado, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { fecha } from '@/features/obras/components/formato'
import { estadoVigencia, hayVencimientos, migajaDe } from '../services/documentos'
import type { Documento } from '../types'

const TONO = { vencido: 'neg', 'vence-pronto': 'warn', vigente: 'pos' } as const
const PALABRA = { vencido: 'Vencido', 'vence-pronto': 'Vence pronto', vigente: 'Vigente' } as const

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
              </Td>
              <Td className="max-w-0">
                {d.vinculos.length === 0 ? (
                  // SIN VÍNCULO NO ES UN ERROR: 2 de cada 3 archivos del Drive no cuelgan de
                  // ninguna entidad todavía. Se dice, y la ruta de al lado ubica igual.
                  <Nulo>sin vincular</Nulo>
                ) : (
                  <div className="min-w-0 truncate">
                    <span className="text-[13px] text-ink-soft">
                      {d.vinculos.map((v) => v.nombre).join(' · ')}
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
