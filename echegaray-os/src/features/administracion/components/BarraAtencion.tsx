// LO QUE PIDE TRABAJO, ARRIBA Y A UN CLIC (Design 23/08/2026, pantalla 00).
//
// Era una columna a la derecha con tres renglones de dos líneas cada uno. Ahora es una fila de chips:
// el número primero —en mono, que es lo que se barre— y el destino ES el filtro que produjo ese
// número, no la pantalla en general. Un chip que dice «14 sin CUIT» y aterriza en una lista de 36
// obliga a buscar a mano los 14 que acaba de contar.
//
// NORMAL SILENCIOSO: sin pendientes no hay barra. Pero «no pude leer ninguno» NO es lo mismo que «no
// hay ninguno», y por eso ese caso se dice — callarlo dibujaría una empresa sin problemas cada vez
// que la base no responde.

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import type { ChipAtencion } from '../services/homeAdministracion'

const TONO: Record<ChipAtencion['tono'], string> = {
  warn: 'border-warn/30 bg-warn-soft text-warn hover:border-warn/60',
  neg: 'border-neg/30 bg-neg-soft text-neg hover:border-neg/60',
}

export function BarraAtencion({ chips, noLeida }: { chips: ChipAtencion[]; noLeida: boolean }) {
  if (noLeida) {
    return (
      <div className="mb-5">
        <Aviso tono="warn" titulo="No pude leer los pendientes del área" testid="admin-atencion-sin-lectura">
          Ninguna de las fuentes de atención respondió. Esta pantalla no puede afirmar que no haya
          nada que resolver.
        </Aviso>
      </div>
    )
  }
  if (chips.length === 0) return null

  return (
    <div data-testid="admin-atencion" className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        // `prefetch={false}`: son rutas dinámicas y cada prefetch es un render RSC completo del
        // módulo entero — el mismo motivo por el que lo apagaron los tabs.
        <Link
          key={c.clave}
          href={c.href}
          prefetch={false}
          data-testid={`atencion-${c.clave}`}
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${TONO[c.tono]}`}
        >
          <IconoProblema className="h-[14px] w-[14px] shrink-0" />
          <span className="font-mono text-[13px] font-semibold tabular-nums">{c.numero}</span>
          <span className="text-[12px] text-ink-soft">{c.texto}</span>
        </Link>
      ))}
    </div>
  )
}
