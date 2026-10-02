'use client'

// LA VISTA PREVIA DE LOS RECIBOS EN LOTE — el panel al costado donde se VE la hoja antes de guardar nada.
//
// Dueño, 01/10/2026 («rehacer»): la versión anterior registraba en los legajos e imprimía de un clic, sin mostrar
// qué iba a salir. Así lo hacen los sistemas de sueldos (vista previa antes de imprimir) y así lo pide la skill de
// diseño del OS: panel lateral, la grilla no se mueve, la acción primaria fija abajo.
//
// ═══ LO QUE SE VE ES LO QUE SALE ═══
//
// La hoja de la vista previa es `HojasDeRecibosA4`, el mismo componente que va a la impresora, achicado para que
// entre en el panel. No hay un dibujo «parecido» que pueda desviarse del papel.
//
// ═══ EL CHECKLIST DEL RECIBO, UNA VEZ PARA TODO EL LOTE (dueño, 01/10/2026) ═══
//
// *«cómo manejo los checklists que tiene cada persona […] que van componiendo el recibo, cómo logro eso en la
// impresión masiva»*. Arriba de la hoja va el mismo «Qué lleva el recibo» del panel de una persona. Lo que se
// tilda o destilda vale para todos los tildados y la hoja se redibuja ahí mismo, antes de guardar. Una opción en
// guion (indeterminada) es «por defecto cada uno lo lleva distinto»; apagada, «nadie del lote lo tiene».
//
// ═══ RECIÉN ACÁ SE GUARDA, Y SIN DUPLICAR ═══
//
// «Guardar e imprimir» y «Guardar y descargar PDF» pasan por `guardarRecibosDelLote`: una llamada para todos; a
// quien ya tiene guardado ESTE MISMO papel no se le registra otro (reimprimir no ensucia el legajo). Al que no se
// pudo guardar se lo nombra con el motivo y NO entra ni en la impresión ni en el PDF: un papel sin rastro está
// prohibido en este repo (cabecera de `ArmarRecibo.tsx`).

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { rotuloCategoria } from './CeldaTarifa'
import { guardarRecibosDelLote } from '../../../services/recibosEmitidosActions'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { abrirVentanaDeImpresion, imprimirEnVentana, fechaCorta } from './HojaDelRecibo'
import { ANCHO_DE_HOJA_PX, HojasDeRecibosA4, type ReciboParaLaHoja } from './HojasDeRecibosA4'
import {
  armarLote, avisoDelLote, estadoDeOpcion, OPCIONES_DEL_RECIBO, textoDelLote,
  type AvisoDelLote, type CambiosDelLote, type ReciboDeLaFila,
} from './lotesDeRecibos'
import type { ConceptoDelRecibo } from '../../../services/reciboDeLaQuincena'

type Tarea = 'imprimir' | 'pdf'

const SIN_RESPUESTA = 'El servidor no contestó y no sé si los recibos quedaron guardados. No imprimí ni descargué nada. Mirá en la grilla quién figura «impreso» y volvé a intentar: lo ya guardado no se duplica.'

/**
 * Baja el PDF SIN SALIR DE LA PANTALLA (auditoría 01/10/2026): navegar a la ruta dejaba al usuario mirando un JSON
 * de error si la ruta fallaba, con los recibos ya guardados. Devuelve el motivo si no se pudo, o `null`.
 */
async function bajarPdf(url: string): Promise<string | null> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) return `error ${r.status}`
  const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Recibos.pdf'
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(await r.blob())
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 60_000)
  return null
}

// `codigo` sólo existe para lo GUARDADO (lo da la base): la vista previa lo pasa vacío y el papel dice «N° al guardar».
const aLaHoja = (r: ReciboDeLaFila, codigo: string | null = null): ReciboParaLaHoja =>
  ({ personaId: r.fila.personaId, nombre: r.fila.nombre, categoria: r.categoria, recibo: r.recibo, codigo })

export function VistaPreviaDeRecibos({ filas, marcados, quincena, onCerrar }: {
  /** Las filas visibles, en el orden de la grilla. */
  filas: readonly FilaDelEspejo[]
  marcados: ReadonlySet<string>
  quincena: { desde: string; hasta: string }
  onCerrar: () => void
}) {
  const router = useRouter()
  const [tarea, setTarea] = useState<Tarea | null>(null)
  const [, empezar] = useTransition()
  const [aviso, setAviso] = useState<AvisoDelLote | null>(null)
  const [paraImprimir, setParaImprimir] = useState<ReciboParaLaHoja[] | null>(null)
  const [escala, setEscala] = useState(0.6)
  const ventana = useRef<Window | null>(null)
  const hoja = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [cambios, setCambios] = useState<CambiosDelLote>({})
  const lote = armarLote(filas, marcados, quincena, pesos, rotuloCategoria, cambios)
  const tildadas = filas.filter((f) => marcados.has(f.personaId))
  const alternar = (clave: ConceptoDelRecibo, marcar: boolean) => {
    if (tarea) return
    setAviso(null)
    setCambios((c) => ({ ...c, [clave]: marcar }))
  }

  // LA HOJA ENTRA ENTERA EN EL ANCHO DEL PANEL, sea el costado del escritorio o la pantalla del teléfono.
  // El ancho que se mide NO puede depender del alto de lo que se dibuja con él: por eso el panel reserva el
  // lugar de la barra de scroll (`barraEstable`). Sin eso el zoom y la barra se persiguen sin parar.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setEscala(Math.min(1, el.clientWidth / (ANCHO_DE_HOJA_PX + 2)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // La hoja a imprimir se dibuja en el DOM (fuera de pantalla, a tamaño real) y recién entonces se copia a la
  // ventana: `outerHTML` necesita el nodo.
  useEffect(() => {
    if (!paraImprimir || !hoja.current || !ventana.current) return
    imprimirEnVentana(ventana.current, hoja.current,
      `Recibos ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`, { horizontal: true })
    ventana.current = null
    setParaImprimir(null)
  }, [paraImprimir, quincena.desde, quincena.hasta])

  /** Guarda el lote y devuelve los que quedaron en el legajo (con su id), dejando el aviso escrito. */
  const guardar = async (): Promise<{ recibo: ReciboDeLaFila; id: string; codigo: string | null }[]> => {
    const r = await guardarRecibosDelLote(lote.listos.map((x) => x.sellado))
    if (!r.ok) { setAviso({ tono: 'mal', lineas: [r.error] }); return [] }
    const porPersona = new Map(r.recibos.map((x) => [x.personaId, x]))
    const guardados = lote.listos.flatMap((recibo) => {
      const x = porPersona.get(recibo.fila.personaId)
      return x?.ok && x.id ? [{ recibo, id: x.id, codigo: x.codigo ?? null }] : []
    })
    const fallos = lote.listos.flatMap((recibo) => {
      const x = porPersona.get(recibo.fila.personaId)
      return x?.ok ? [] : [`${recibo.fila.nombre}: ${x?.error ?? 'no volvió respuesta'}`]
    })
    setAviso(avisoDelLote(r.recibos.filter((x) => x.ok && !x.yaEstaba).length, r.recibos.filter((x) => x.ok && x.yaEstaba).length, fallos))
    // La marca «impreso» de cada fila sale de lo recién guardado: se vuelve a leer la quincena.
    if (r.recibos.some((x) => x.ok && !x.yaEstaba)) router.refresh()
    return guardados
  }

  const imprimir = () => {
    if (tarea) return
    // LA VENTANA SE ABRE EN EL CLIC, antes de guardar: después de un `await` el navegador ya no la deja abrir.
    // Si la bloquea no se guarda nada: es mejor frenar acá que dejar recibos en el legajo sin papel.
    const v = abrirVentanaDeImpresion()
    if (!v) {
      setAviso({ tono: 'mal', lineas: ['El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar y probá de nuevo. No guardé nada.'] })
      return
    }
    setTarea('imprimir')
    empezar(async () => {
      try {
        const guardados = await guardar()
        if (guardados.length === 0) { v.close(); return }
        ventana.current = v
        setParaImprimir(guardados.map((g) => aLaHoja(g.recibo, g.codigo)))
      } catch {
        // La acción no volvió (conexión cortada, error del servidor): la ventana en blanco no queda huérfana y los
        // botones no quedan muertos en «Guardando…» (auditoría 01/10/2026).
        v.close()
        setAviso({ tono: 'mal', lineas: [SIN_RESPUESTA] })
      } finally {
        setTarea(null)
      }
    })
  }

  const descargar = () => {
    if (tarea) return
    setTarea('pdf')
    empezar(async () => {
      try {
        const guardados = await guardar()
        if (guardados.length === 0) return
        // El PDF se arma con lo GUARDADO (la ruta lee los recibos por id), en el orden de la grilla.
        const falla = await bajarPdf(`/administracion/personas/recibos-lote?ids=${guardados.map((g) => g.id).join(',')}`)
        if (falla) setAviso((a) => ({ tono: 'mal', lineas: [...(a?.lineas ?? []), `Los recibos quedaron guardados, pero no pude armar el PDF (${falla}). Tocá de nuevo «Guardar y descargar PDF»: no se duplican.`] }))
      } catch {
        setAviso({ tono: 'mal', lineas: [SIN_RESPUESTA] })
      } finally {
        setTarea(null)
      }
    })
  }

  const nada = lote.listos.length === 0
  return (
    <Drawer testid="vista-previa-recibos" titulo={textoDelLote(lote.listos.length)} subtitulo="A4 horizontal · 4 por hoja"
      ancho={760} onCerrar={onCerrar} barraEstable
      pie={(
        <>
          <button type="button" onClick={imprimir} disabled={Boolean(tarea) || nada} data-testid="recibos-lote-imprimir"
            className="min-h-9 rounded-md border-0 px-4 text-[13px] font-semibold text-white max-[767px]:min-h-11 max-[767px]:flex-1"
            style={{ background: V.grafito, cursor: tarea ? 'progress' : 'pointer', opacity: tarea || nada ? 0.5 : 1 }}>
            {tarea === 'imprimir' ? 'Guardando…' : 'Guardar e imprimir'}
          </button>
          <button type="button" onClick={descargar} disabled={Boolean(tarea) || nada} data-testid="recibos-lote-pdf"
            className="min-h-9 rounded-md bg-transparent px-4 text-[13px] font-medium max-[767px]:min-h-11 max-[767px]:flex-1"
            style={{ border: `1px solid ${V.lineaFuerte}`, color: V.tinta, cursor: tarea ? 'progress' : 'pointer', opacity: tarea || nada ? 0.5 : 1 }}>
            {tarea === 'pdf' ? 'Guardando…' : 'Guardar y descargar PDF'}
          </button>
        </>
      )}>
      {aviso && (
        <div data-testid={aviso.tono === 'ok' ? 'recibos-lote-ok' : 'recibos-lote-falla'} role="status"
          style={{ marginBottom: 16, fontSize: '12.5px', lineHeight: 1.5, color: aviso.tono === 'ok' ? V.tinta : V.warn }}>
          {aviso.lineas.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      <fieldset data-testid="recibos-lote-opciones" disabled={Boolean(tarea)}
        className="m-0 mb-4 grid grid-cols-2 gap-x-6 border-0 p-0 max-[767px]:grid-cols-1">
        <legend style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado, marginBottom: 8 }}>
          Qué lleva el recibo
        </legend>
        {OPCIONES_DEL_RECIBO.map(({ clave, rotulo }) => {
          const estado = estadoDeOpcion(tildadas, clave, cambios)
          const nadie = estado === 'nadie'
          return (
            <label key={clave} className="flex min-h-8 items-center gap-2 max-[767px]:min-h-11"
              style={{ fontSize: '13px', color: nadie ? V.apagado : V.tinta, cursor: nadie ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={estado === 'todas'} disabled={nadie}
                ref={(el) => { if (el) el.indeterminate = estado === 'algunas' }}
                onChange={() => alternar(clave, estado !== 'todas')}
                data-testid={`recibos-lote-opcion-${clave}`} data-estado={estado}
                style={{ width: 16, height: 16, accentColor: V.grafito }} />
              <span>{rotulo}</span>
              {nadie && <span style={{ fontSize: '11.5px' }}>· nadie del lote lo tiene</span>}
            </label>
          )
        })}
      </fieldset>
      {lote.sinNada.length > 0 && (
        <div data-testid="recibos-lote-sin-nada" style={{ marginBottom: 16, fontSize: '12.5px', lineHeight: 1.5, color: V.warn }}>
          Con esta selección no les queda nada para imprimir: {lote.sinNada.join(', ')}.
        </div>
      )}
      <div ref={caja} data-testid="recibos-lote-hojas">
        <div style={{ zoom: escala }}>
          <HojasDeRecibosA4 vista recibos={lote.listos.map((r) => aLaHoja(r))} quincena={quincena} />
        </div>
      </div>
      {paraImprimir && (
        <div aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: '281mm', pointerEvents: 'none' }}>
          <HojasDeRecibosA4 hoja={hoja} recibos={paraImprimir} quincena={quincena} />
        </div>
      )}
    </Drawer>
  )
}
