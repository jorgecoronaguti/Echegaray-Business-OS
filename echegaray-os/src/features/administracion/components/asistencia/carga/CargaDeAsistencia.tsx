'use client'

// LA CARGA ÚNICA DE ASISTENCIA — el cliente: resumen, buscador, grupos por obra y cada toque guardado.
//
// ═══ CADA TOQUE SE GUARDA AL INSTANTE, CON LA MISMA REGLA QUE EL TELÉFONO ═══
//
// `casillaTrasToque` decide la casilla y `marcaDeLaCasilla` qué se escribe; `guardarPresencia` y
// `quitarPresencia` escriben. Es exactamente lo que hace `FormPresencia` desde el 17/09: si la base
// rechaza, la casilla vuelve a como estaba y la fila dice por qué.
//
// ═══ TIEMPO REAL SIN PISAR LO QUE SE ESTÁ TOCANDO ═══
//
// El layout de Personal refresca la página cuando cambia `asistencia_dia`, `registros_hh` u
// `obra_asignacion`. Las casillas se fusionan por persona con `fusionarConElServidor`: lo que otro
// usuario guardó entra, lo que esta persona tocó y todavía no volvió del servidor se respeta.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fusionarConElServidor, huellaDe } from '@/shared/tiempo-real/estadoDelServidor'
import { Aviso } from '@/shared/components/ds'
import {
  casillaTrasToque, marcaDeLaCasilla, type CasillaPresencia, type ToqueDePresencia,
} from '@/features/administracion/services/presenciaDelDia'
import { guardarPresencia, quitarPresencia } from '@/features/administracion/services/presenciaDelDiaActions'
import {
  agruparPorObra, filtrarCarga, resumenDeCarga, type FilaDeCarga as Fila, type GrupoDeCarga, type PermisoDelDia,
} from '@/features/administracion/services/cargaDeAsistencia'
import { FilaDeCarga } from './FilaDeCarga'
import { ALTO, type EstadoDeGuardado, type ObraElegible } from './ControlesDeFila'

type Casillas = Record<string, CasillaPresencia>

const casillasDe = (filas: readonly Fila[]): Casillas =>
  Object.fromEntries(filas.map((f) => [f.persona.id, f.casilla]))

export function CargaDeAsistencia({ filas, obraFiltro, fecha, hoy, rotuloDia, obras, nombres, cierre, permiso, puedeMover, certificados }: {
  filas: Fila[]
  /** `persona_id` → nombre del certificado médico que cubre el día. */
  certificados: Record<string, string>
  obraFiltro: string | null
  fecha: string
  hoy: string
  rotuloDia: string
  obras: ObraElegible[]
  nombres: Record<string, string>
  cierre: string | null
  permiso: PermisoDelDia
  puedeMover: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const base = useMemo(() => casillasDe(filas), [filas])
  const [casillas, setCasillas] = useState<Casillas>(base)
  const [vista, setVista] = useState(() => ({ huella: huellaDe(base), base }))
  if (huellaDe(base) !== vista.huella) {
    const anterior = vista.base
    setVista({ huella: huellaDe(base), base })
    setCasillas((prev) => fusionarConElServidor(prev, anterior, base))
  }
  const [estados, setEstados] = useState<Record<string, EstadoDeGuardado>>({})
  const [acuse, setAcuse] = useState<{ ok: boolean; texto: string } | null>(null)
  const [, arrancar] = useTransition()

  const visibles = filtrarCarga(filas, { obra: obraFiltro, q })
  const grupos = agruparPorObra(visibles, nombres)
  const resumen = resumenDeCarga(visibles.map((f) => casillas[f.persona.id] ?? f.casilla))
  // UNA SOLA RAZÓN DE SÓLO LECTURA POR DÍA: la quincena cerrada gana sobre el permiso porque ni
  // Administración la puede tocar sin reabrirla.
  const soloLectura = cierre ?? (permiso.ok ? null : permiso.porque)

  const marcarEstado = (id: string, e: EstadoDeGuardado) => setEstados((prev) => ({ ...prev, [id]: e }))

  const onToque = (id: string, obraId: string, toque: ToqueDePresencia) => {
    const antes = casillas[id] ?? { estado: null, motivo: null }
    const despues = casillaTrasToque(antes, toque)
    const marca = marcaDeLaCasilla(id, despues)
    setAcuse(null)
    setCasillas((prev) => ({ ...prev, [id]: despues }))
    marcarEstado(id, { tipo: 'guardando' })
    arrancar(async () => {
      const r = marca
        ? await guardarPresencia({ obra_id: obraId, fecha, marcas: [marca] })
        // DECISIÓN 3: en esta pantalla quitar el presente retira la jornada por defecto que nadie tocó.
        : antes.estado ? await quitarPresencia({ persona_id: id, fecha, quitar_jornada_por_defecto: true }) : { ok: true as const, mensaje: '' }
      if (r.ok) { marcarEstado(id, { tipo: 'ok' }); router.refresh() }
      else { setCasillas((prev) => ({ ...prev, [id]: antes })); marcarEstado(id, { tipo: 'error', texto: r.error }) }
    })
  }

  // «MARCAR A TODOS» DEL GRUPO: sólo a quien estaba sin marcar, en una escritura. No pisa un «No vino».
  const marcarTodos = (g: GrupoDeCarga) => {
    if (!g.obraId) return
    const obraId = g.obraId
    const sinMarcar = g.filas.filter((f) => !(casillas[f.persona.id] ?? f.casilla).estado).map((f) => f.persona.id)
    if (sinMarcar.length === 0) { setAcuse({ ok: true, texto: `En ${g.nombre} ya estaban todos marcados.` }); return }
    const previas = casillas
    setCasillas((prev) => ({ ...prev, ...Object.fromEntries(sinMarcar.map((id) => [id, { estado: 'presente' as const, motivo: null }])) }))
    arrancar(async () => {
      const r = await guardarPresencia({ obra_id: obraId, fecha, marcas: sinMarcar.map((persona_id) => ({ persona_id, estado: 'presente', motivo: null })) })
      setAcuse(r.ok ? { ok: true, texto: `${g.nombre}: ${r.mensaje}` } : { ok: false, texto: `${g.nombre}: ${r.error}` })
      if (r.ok) router.refresh()
      else setCasillas(previas)
    })
  }

  return (
    <div data-testid="carga-de-asistencia">
      <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
        <p className="flex flex-wrap gap-x-1 gap-y-0.5 text-[13px] text-ink" data-testid="resumen-del-dia">
          <Cifra n={resumen.presentes} rotulo="presentes" clase="text-pos" />
          <Cifra n={resumen.ausentes} rotulo="ausentes" clase={resumen.ausentes > 0 ? 'text-neg' : 'text-muted'} />
          <Cifra n={resumen.licencias} rotulo="licencia" clase="text-muted" />
          <Cifra n={resumen.sinMarcar} rotulo="sin marcar" clase={resumen.sinMarcar > 0 ? 'text-warn' : 'text-muted'} />
          <Cifra n={resumen.conTardanza} rotulo="con tardanza" clase={resumen.conTardanza > 0 ? 'text-warn' : 'text-muted'} ultima />
        </p>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona o categoría"
          aria-label="Buscar persona o categoría" data-testid="buscar-carga"
          className={`${ALTO} w-full rounded-control border border-line bg-surface px-3 text-[16px] text-ink md:w-64 md:text-[13px]`}
        />
      </div>

      {soloLectura && <div className="pb-3"><Aviso tono="info" testid="dia-solo-lectura">{soloLectura}</Aviso></div>}
      {acuse && <div className="pb-3"><Aviso tono={acuse.ok ? 'info' : 'neg'} testid="acuse-carga">{acuse.texto}</Aviso></div>}

      {grupos.length === 0 && (
        <p className="border-t border-line py-6 text-center text-[13px] text-muted" data-testid="carga-vacia">
          {q ? `Nadie coincide con «${q}».` : 'Nadie del plantel en esta obra ese día.'}
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.obraId ?? 'sin-obra'} className="pb-4" data-testid="grupo-obra" data-obra={g.obraId ?? 'sin-obra'}>
          <div className="flex items-center justify-between gap-3 border-b border-line-strong pb-1">
            <h2 className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.04em] text-ink">
              {g.nombre} <span className="font-normal text-faint">· {g.filas.length}</span>
            </h2>
            {g.obraId && !soloLectura && (
              <button
                type="button" onClick={() => marcarTodos(g)} data-testid="marcar-todos-grupo"
                className={`${ALTO} shrink-0 rounded-control px-2 text-[12.5px] text-ink underline hover:text-ink-soft`}
              >
                Marcar a todos presentes
              </button>
            )}
          </div>
          <ul>
            {g.filas.map((f) => (
              <FilaDeCarga
                key={f.persona.id} fila={f} casilla={casillas[f.persona.id] ?? f.casilla} estado={estados[f.persona.id] ?? null}
                fecha={fecha} hoy={hoy} rotuloDia={rotuloDia} obras={obras} nombres={nombres}
                soloLectura={soloLectura} puedeMover={puedeMover} certificado={certificados[f.persona.id] ?? null} onToque={onToque}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Cifra({ n, rotulo, clase, ultima }: { n: number; rotulo: string; clase: string; ultima?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`font-mono font-semibold tabular-nums ${clase}`}>{n}</span>
      <span className="text-muted"> {rotulo}</span>
      {!ultima && <span className="text-faint"> · </span>}
    </span>
  )
}
