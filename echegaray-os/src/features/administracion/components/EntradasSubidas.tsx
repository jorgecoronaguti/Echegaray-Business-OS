'use client'

// QUÉ PASÓ CON CADA COMPROBANTE QUE SE SUBIÓ DESDE LA PANTALLA.
//
// ═══ POR QUÉ ESTA LISTA EXISTE APARTE DE LA TABLA GRANDE ═══
//
// La tabla de abajo es el LIBRO DE COMPRAS de ARCA: lo que la empresa tiene declarado. Un
// comprobante recién sacado del bolsillo no está ahí y puede tardar días en estarlo (ARCA lo publica
// cuando lo publica). Lo que esta lista contesta es otra pregunta y es la urgente: *«la foto que
// acabo de subir, ¿entró o no entró?»*. Mezclarlas haría que un archivo subido hace veinte segundos
// se buscara entre 653 filas donde todavía no puede estar.
//
// ═══ NO SE INVENTA UN «CARGADO» ═══
//
// El estado viene de la fila que escribió el worker DESPUÉS de leer el registro en su destino
// (`comunicacion.comprobantes_cargados`). Cuando ese registro no se pudo leer, la fila lo dice en
// vez de afirmar que entró: un ✔ que nadie verificó es peor que un renglón que admite que no sabe.
//
// Se refresca sola mientras haya algo en curso, y DEJA de refrescarse cuando no queda nada: un
// polling eterno sobre una pantalla abierta todo el día es una consulta cada cinco segundos para
// siempre.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Estado } from '@/shared/components/ds'
import { C } from '@/shared/components/canon'
import {
  ROTULO, hayTrabajoEnCurso, type EntradaComprobante,
} from '../services/comprobanteEntrada'

/** Cada cuánto se vuelve a preguntar mientras el worker trabaja. El timer corre cada minuto. */
const REFRESCO_MS = 5000

export function EntradasSubidas({ entradas }: { entradas: EntradaComprobante[] }) {
  const router = useRouter()
  const enCurso = hayTrabajoEnCurso(entradas)

  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(() => router.refresh(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [enCurso, router])

  if (!entradas.length) return null

  return (
    <div
      data-testid="entradas-subidas"
      style={{
        background: C.superficie, border: `1px solid ${C.linea}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 12,
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ background: C.superficieTenue, borderBottom: `1px solid ${C.linea}`, padding: '7px 14px' }}
      >
        <span className="text-[10px] tracking-[.05em]" style={{ color: C.tenue }}>COMPROBANTES QUE SUBISTE</span>
        {enCurso && (
          <span className="text-[11px]" style={{ color: C.info }} data-testid="entradas-en-curso">
            leyendo…
          </span>
        )}
      </div>
      {entradas.map((e) => <FilaEntrada key={e.id} entrada={e} />)}
    </div>
  )
}

/** Una línea: el archivo, en qué quedó, y dónde quedó si entró. */
function FilaEntrada({ entrada }: { entrada: EntradaComprobante }) {
  const r = ROTULO[entrada.estado]
  const cargados = entrada.resultado?.comprobantes ?? null
  return (
    <div
      className="flex items-center gap-3"
      style={{ borderBottom: `1px solid ${C.lineaFila}`, padding: '8px 14px' }}
      data-testid="fila-entrada"
      data-estado={entrada.estado}
    >
      <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: C.tinta }}>{entrada.nombre_archivo}</span>
      <span className="min-w-0 flex-[2] truncate text-[11.5px]" style={{ color: C.apagado }} title={entrada.motivo ?? r.ayuda}>
        {entrada.motivo ?? r.ayuda}
      </span>
      <span className="shrink-0 text-[11px]" style={{ color: C.tenue }}>{dondeQuedo(entrada, cargados)}</span>
      <span className="shrink-0"><Estado tono={r.tono} clave={entrada.estado}>{r.texto}</Estado></span>
    </div>
  )
}

/**
 * DÓNDE quedó, no sólo que quedó.
 *
 * `null` (no se pudo leer el registro) y `[]` (se leyó y no había) NO son lo mismo y no se escriben
 * igual: confundirlos convertiría una lectura fallida en la afirmación de que no entró nada.
 */
function dondeQuedo(
  entrada: EntradaComprobante,
  cargados: NonNullable<EntradaComprobante['resultado']>['comprobantes'],
): string {
  if (entrada.estado !== 'cargado' && entrada.estado !== 'ya_estaba') return ''
  if (cargados === null || cargados === undefined) return 'no pude confirmar la fila'
  const filas = cargados.map((c) => c?.fila).filter((f): f is number => typeof f === 'number')
  if (!filas.length) return ''
  return filas.length === 1 ? `Compras · fila ${filas[0]}` : `Compras · filas ${filas.join(', ')}`
}
