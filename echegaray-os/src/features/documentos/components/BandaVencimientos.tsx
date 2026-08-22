// LA BANDA DE VENCIMIENTOS — el aviso que la pantalla no podía dar.
//
// ═══ TRES ESTADOS, PORQUE SON TRES HECHOS DISTINTOS ═══
//
// 1. **Nadie cargó ninguna fecha** (`conFecha = 0`, que es el estado de hoy: las 847 filas de
//    `documentacion_legajo` tienen `fecha_vencimiento` en null). La banda NO dice «0 vencidos»:
//    eso se lee como «está todo en orden» y sería una afirmación falsa. Dice que el control no
//    está cargado y dónde se carga.
// 2. **Hay fechas y ninguna en riesgo.** Ahí sí «0 vencidos» significa algo, porque hay contra qué
//    medirlo, y la banda queda en tono neutro con el número de papeles controlados.
// 3. **Hay vencidos o vencen este mes.** Es lo único que se dibuja en rojo o ámbar, y cada número
//    es un ENLACE que recorta la tabla a esos documentos. Un contador que no lleva a las filas
//    obliga a buscarlas a mano entre 3.123.
//
// «Sólo cuando hay un problema REAL» (`Aviso`): por eso el caso 2 no usa `Aviso` sino una línea de
// texto. Un bloque de color permanente entrena a no leer los bloques de color.

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import type { ResumenVencimientos } from '../types'

export function BandaVencimientos({
  resumen,
  error,
  hrefVencidos,
  hrefEsteMes,
  hrefTodo,
  recorte,
}: {
  resumen: ResumenVencimientos | null
  error: string | null
  hrefVencidos: string
  hrefEsteMes: string
  hrefTodo: string
  /** Qué recorte está aplicado ahora, para poder deshacerlo desde la misma banda. */
  recorte?: string
}) {
  // NO SE PUDO CONTAR ≠ NO HAY NADA QUE AVISAR. Si la consulta falló, se dice; callarse dibujaría
  // una pantalla tranquila sobre un control que no corrió.
  if (error) {
    return (
      <div className="mb-4" data-testid="banda-vencimientos">
        <Aviso tono="warn" titulo="No pude contar los vencimientos">{error}</Aviso>
      </div>
    )
  }
  if (!resumen) return null

  const { vencidos, venceEsteMes, conFecha } = resumen

  if (conFecha === 0) {
    return (
      <p className="mb-4 text-[12px] leading-relaxed text-faint" data-testid="banda-vencimientos" data-estado="sin-control">
        Ningún documento tiene fecha de vencimiento cargada, así que esta pantalla todavía no puede
        avisar de un papel vencido. La fecha se carga en el panel de un documento vinculado a un
        legajo; desde ahí, ART, seguros y libretas empiezan a vencer solas.
      </p>
    )
  }

  if (vencidos === 0 && venceEsteMes === 0) {
    return (
      <p className="mb-4 text-[12px] leading-relaxed text-muted" data-testid="banda-vencimientos" data-estado="al-dia">
        <span className="font-medium text-ink">{conFecha}</span>{' '}
        {conFecha === 1 ? 'documento con vencimiento controlado' : 'documentos con vencimiento controlado'}.
        Ninguno vencido ni venciendo este mes.
      </p>
    )
  }

  return (
    <div className="mb-4" data-testid="banda-vencimientos" data-estado="alerta">
      <Aviso
        tono={vencidos > 0 ? 'neg' : 'warn'}
        titulo={vencidos > 0 ? 'Hay documentación vencida' : 'Hay documentación por vencer'}
      >
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {vencidos > 0 && (
            <Link href={hrefVencidos} className="underline underline-offset-2" data-testid="ver-vencidos">
              {vencidos} {vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}
            </Link>
          )}
          {venceEsteMes > 0 && (
            <Link href={hrefEsteMes} className="underline underline-offset-2" data-testid="ver-vence-este-mes">
              {venceEsteMes} {venceEsteMes === 1 ? 'vence este mes' : 'vencen este mes'}
            </Link>
          )}
          <span className="text-[11.5px] opacity-80">sobre {conFecha} con vencimiento cargado</span>
          {recorte && (
            <Link href={hrefTodo} className="text-[11.5px] underline underline-offset-2" data-testid="quitar-recorte-vencimiento">
              ver todo el archivo
            </Link>
          )}
        </span>
      </Aviso>
    </div>
  )
}
