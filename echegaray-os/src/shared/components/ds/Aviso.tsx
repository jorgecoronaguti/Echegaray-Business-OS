import type { ReactNode } from 'react'

// AVISOS Y ERRORES — `design/system/COMPONENTS.md` §Alert, `INTERACTION.md` §Error.
//
// «Sólo cuando hay un problema REAL, y el mensaje incluye lo que dijo la fuente». Las dos mitades
// importan. Un bloque de color permanente que dice «recordá cargar el avance» entrena a la gente a
// no leer los bloques de color, y entonces el día que uno diga algo grave tampoco se lee.
//
// Y el mensaje de la fuente es la diferencia entre «no se pudo cargar» —que no deja hacer nada— y
// «ARCA devolvió 401: el token venció el 14/08» —que dice exactamente qué arreglar. Nunca se
// reemplaza el error real por una frase amable.
//
// «Una lista vacía POR ERROR no se dibuja como "no hay datos"»: son dos cosas opuestas y confundirlas
// hace que un sistema caído parezca una empresa sin trabajo.

type Tono = 'neg' | 'warn' | 'info'

const TONO: Record<Tono, string> = {
  neg: 'border-neg/40 bg-neg-soft text-neg',
  warn: 'border-warn/40 bg-warn-soft text-warn',
  info: 'border-info/40 bg-info-soft text-info',
}

export function Aviso({
  tono = 'warn',
  titulo,
  children,
  accion,
  testid = 'aviso',
}: {
  tono?: Tono
  titulo?: ReactNode
  children: ReactNode
  accion?: ReactNode
  testid?: string
}) {
  return (
    <div data-testid={testid} data-tono={tono} className={`rounded-card border px-3.5 py-3 ${TONO[tono]}`}>
      {titulo && <div className="text-[13px] font-semibold">{titulo}</div>}
      <div className={`text-[12.5px] leading-relaxed ${titulo ? 'mt-1' : ''}`}>{children}</div>
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

/** Error de un campo: texto `neg` de 11,5px debajo del control. Sin caja: ya está en contexto. */
export function ErrorCampo({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[11.5px] text-neg">{children}</p>
}
