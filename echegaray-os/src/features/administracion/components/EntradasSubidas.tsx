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

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Estado } from '@/shared/components/ds'
import { C } from '@/shared/components/canon'
import {
  ROTULO, hayTrabajoEnCurso, type EntradaComprobante,
} from '../services/comprobanteEntrada'

/** Cada cuánto se vuelve a preguntar mientras el worker trabaja. El timer corre cada minuto. */
const REFRESCO_MS = 5000
const CLAVE_QUITADAS = 'compras.entradas-quitadas'

const oyentes = new Set<() => void>()
function suscribirQuitadas(cb: () => void) { oyentes.add(cb); return () => { oyentes.delete(cb) } }
function avisarQuitadas() { oyentes.forEach((cb) => cb()) }
function leerQuitadas(): string {
  try { return localStorage.getItem(CLAVE_QUITADAS) ?? '[]' } catch { return '[]' }
}
function parsearQuitadas(texto: string): string[] {
  try { const v: unknown = JSON.parse(texto); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] }
}

export function EntradasSubidas({ entradas }: { entradas: EntradaComprobante[] }) {
  const router = useRouter()
  const enCurso = hayTrabajoEnCurso(entradas)

  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(() => router.refresh(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [enCurso, router])

  // QUITAR ES DE QUIEN MIRA (dueño 25/09: «no tengo opción ni de hacer click ni de editar ni de
  // borrar»). La fila no es un dato: es el acuse de una carga, y la carga ya quedó en Compras o en su
  // entrega. Quitarla la saca de esta pantalla, en este navegador; el comprobante no se toca.
  // useSyncExternalStore y no un efecto: el servidor dibuja «ninguna quitada» y el navegador lee su
  // almacenamiento sin un segundo render ni un desajuste de hidratación (#418).
  const quitadasTexto = useSyncExternalStore(suscribirQuitadas, leerQuitadas, () => '[]')
  const quitadas = parsearQuitadas(quitadasTexto)
  const quitar = (id: string) => {
    try { localStorage.setItem(CLAVE_QUITADAS, JSON.stringify([...quitadas, id].slice(-100))) } catch { /* sin almacenamiento */ }
    avisarQuitadas()
  }
  const visibles = entradas.filter((e) => !quitadas.includes(e.id))

  if (!visibles.length) return null

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
      {visibles.map((e) => <FilaEntrada key={e.id} entrada={e} onQuitar={() => quitar(e.id)} />)}
    </div>
  )
}

/** Una línea: el archivo, en qué quedó, y dónde quedó si entró. */
function FilaEntrada({ entrada, onQuitar }: { entrada: EntradaComprobante; onQuitar: () => void }) {
  const r = ROTULO[entrada.estado]
  const cargados = entrada.resultado?.comprobantes ?? null
  return (
    <div
      // En el teléfono el archivo toma su renglón y lo demás baja: cuatro datos en 358px se truncaban
      // a tres letras cada uno.
      className="flex items-center gap-3 max-md:flex-wrap max-md:gap-y-1"
      style={{ borderBottom: `1px solid ${C.lineaFila}`, padding: '8px 14px' }}
      data-testid="fila-entrada"
      data-estado={entrada.estado}
    >
      {entrada.enlace ? (
        <Link href={entrada.enlace} className="min-w-0 flex-1 truncate text-[12px] underline max-md:basis-full max-md:text-[13px]"
          style={{ color: C.tinta }} data-testid="entrada-abrir" title="Abrir donde se resuelve">{entrada.nombre_archivo}</Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px] max-md:basis-full max-md:text-[13px]" style={{ color: C.tinta }}>{entrada.nombre_archivo}</span>
      )}
      <span className="min-w-0 flex-[2] truncate text-[11.5px]" style={{ color: C.apagado }} title={entrada.motivo ?? r.ayuda}>
        {entrada.motivo ?? r.ayuda}
      </span>
      <span className="shrink-0 text-[11px]" style={{ color: C.tenue }}>{dondeQuedo(entrada, cargados)}</span>
      <span className="shrink-0"><Estado tono={r.tono} clave={entrada.estado}>{r.texto}</Estado></span>
      {entrada.enlace && (
        <Link href={entrada.enlace} className="shrink-0 text-[11.5px] underline max-md:min-h-[44px] max-md:inline-flex max-md:items-center"
          style={{ color: C.tinta }} data-testid="entrada-resolver">
          {entrada.estado === 'cargado' || entrada.estado === 'ya_estaba' ? 'Ver' : 'Resolver'}
        </Link>
      )}
      <button type="button" onClick={onQuitar} aria-label={`Quitar ${entrada.nombre_archivo} de esta lista`}
        className="shrink-0 text-[14px] leading-none max-md:min-h-[44px] max-md:min-w-[44px]"
        style={{ color: C.tenue, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        data-testid="entrada-quitar" title="Quitar de esta lista (el comprobante no se toca)">×</button>
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
