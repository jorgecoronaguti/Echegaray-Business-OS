// «AUDITORÍA DE CAMBIOS» — quién le tocó qué a esta persona, y desde qué valor.
//
// ═══ LA PREGUNTA QUE ESTA SOLAPA CONTESTA ═══
//
// `personas.actualizado_por`/`actualizado_en` guardaban el ÚLTIMO que tocó, no QUÉ tocó: con eso no
// se puede contestar «¿quién le cambió la categoría, y desde qué valor?», que es la única pregunta
// por la que alguien abre una auditoría. La migración 5200 dejó la bitácora campo por campo; esto es
// la ventana.
//
// ═══ EL NÚMERO DEL SUELDO NO PASA POR ACÁ, Y LA PANTALLA LO DICE ═══
//
// Esta solapa la lee `es_administracion()`, que incluye al jefe de obra — el mismo rol al que tres
// migraciones le cerraron la retribución pactada. El trigger registra el HECHO y tapa el VALOR con
// `•••`; acá se muestra tal cual llega y se explica al pie, porque un `•••` sin explicación se lee
// como un dato roto y alguien va a "arreglarlo".
//
// ═══ «VER MÁS» VIAJA EN LA URL ═══
//
// Nada de estado de cliente: el tramo es un parámetro (`?n=`), así que la lista larga se comparte,
// se recarga y se cierra con el botón de atrás. Es el mismo criterio que el panel de edición de esta
// misma ficha.

import Link from 'next/link'
import { Tabla, THead, Th, Tr, Td, Vacio, Aviso, Estado } from '@/shared/components/ds'
import type { Bitacora } from '../services/auditoriaService'

export function BloqueAuditoria({ bitacora, hrefMas }: { bitacora: Bitacora; hrefMas: string }) {
  // SIN LECTURA NO HAY LISTA — NUNCA UNA VACÍA. «Nunca se le cambió nada» y «no pude leer los
  // cambios» son afirmaciones opuestas, y la primera dicha sobre un error de permisos es una
  // mentira tranquila: alguien cierra la auditoría convencido de que no pasó nada.
  if (bitacora.error) {
    return <Aviso tono="neg" titulo="No pude leer la bitácora">{bitacora.error}</Aviso>
  }

  if (bitacora.cambios.length === 0) {
    return (
      <Vacio>
        Sin cambios registrados. La bitácora arranca el 21/08/2026: lo anterior a esa fecha no quedó
        anotado campo por campo, y no se puede reconstruir.
      </Vacio>
    )
  }

  const hayTapados = bitacora.cambios.some((c) => c.tapado)

  return (
    <>
      <Tabla testid="tabla-auditoria" minWidth={640}>
        <THead>
          <Th>Cuándo</Th>
          <Th>Qué cambió</Th>
          <Th>De</Th>
          <Th>A</Th>
          <Th>Quién</Th>
        </THead>
        <tbody>
          {bitacora.cambios.map((c) => (
            <Tr key={c.id} data-testid="fila-auditoria">
              <Td className="whitespace-nowrap font-mono text-[12px] tabular-nums text-faint">{c.cuando}</Td>
              <Td fuerte>{c.que}</Td>
              <Td>{c.antes}</Td>
              <Td fuerte>{c.despues}</Td>
              <Td>{c.autor}</Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        {bitacora.hayMas ? (
          <Link href={hrefMas} data-testid="auditoria-ver-mas" className="text-[12.5px] text-ink hover:underline">
            Ver más cambios →
          </Link>
        ) : (
          <span className="text-[12px] text-faint" data-testid="auditoria-completa">
            Es toda la bitácora de esta persona.
          </span>
        )}
        <Estado tono="nulo">{bitacora.cambios.length} cambios</Estado>
      </div>

      {hayTapados && (
        // EL «•••» EXPLICADO DONDE APARECE. Sin esto se lee como un dato corrupto y el próximo que
        // pase va a "arreglar" la única columna que está bien.
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint" data-testid="nota-tapado">
          <strong className="text-muted">•••</strong> es un valor que la base no publica por esta
          ventana. La retribución pactada se registra tapada a propósito: queda auditable QUE cambió,
          quién y cuándo, sin que la auditoría se convierta en la puerta por la que se lee el sueldo.
        </p>
      )}
    </>
  )
}
