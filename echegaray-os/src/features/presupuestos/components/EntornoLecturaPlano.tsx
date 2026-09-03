'use client'

// EL ENTORNO DE LECTURA DEL PLANO — `/presupuestos/nuevo`, pedido textual del dueño (03/09/2026):
// «una parte conversacional que va determinando los 7 pasos… y a la derecha cómo se va conformando
// a medida que la conversación progresa». Reemplaza al formulario que mandaba el PDF y esperaba la
// respuesta entera en el mismo request — el timeout que reportó — por un POST que encola en <3 s
// (`ComposerInicial`) y un sondeo que arma la lectura paso a paso (`useSondeoTrabajo`).
//
// DOS COLUMNAS DE UNA VEZ QUE HAY UN TRABAJO ABIERTO: la conversación (`ConversacionLectura`) a la
// izquierda, el presupuesto formándose (`PresupuestoEnFormacion`) a la derecha — porte de
// «Presupuestos v5 · Lectura del plano». Antes de eso, el arranque es el estado `esVacio` de
// «Presupuestos v5 · entorno xsas»: el legajo se tira ahí, o se describe la obra a mano.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSondeoTrabajo } from '../hooks/useSondeoTrabajo'
import { base64DeArchivo, cancelarLectura, iniciarLectura, type AdjuntoLocal } from '../services/trabajoCotizarApi'
import { ComposerInicial } from './ComposerInicial'
import { ConversacionLectura } from './ConversacionLectura'
import { PresupuestoEnFormacion } from './PresupuestoEnFormacion'

export function EntornoLecturaPlano() {
  const router = useRouter()
  const [trabajoId, setTrabajoId] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errorArranque, setErrorArranque] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string | null>(null)
  const [pasosVistos, setPasosVistos] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null)

  const { trabajo, errorSondeo } = useSondeoTrabajo(trabajoId)

  // CADA PASO NUEVO SE ABRE SOLO — así se lee «Presupuestos v5 · Lectura del plano»: el más
  // reciente queda expandido, los anteriores se colapsan a resumen. Se ajusta EN EL RENDER, no en
  // un efecto: es estado derivado de un resultado nuevo (`trabajo.pasos`), y hacerlo en un efecto
  // sería una segunda pasada de render para lo mismo que React ya resuelve acá mismo.
  const pasosLen = trabajo?.pasos.length ?? 0
  if (pasosLen !== pasosVistos) {
    setPasosVistos(pasosLen)
    if (pasosLen > pasosVistos) setAbierto(trabajo!.pasos[pasosLen - 1].id)
  }

  const arrancar = useCallback(async (mensaje: string, archivos: File[]) => {
    setEnviando(true)
    setErrorArranque(null)
    try {
      const adjuntos: AdjuntoLocal[] = await Promise.all(
        archivos.map(async (f) => ({ nombre: f.name, contenido_base64: await base64DeArchivo(f) })),
      )
      const { id } = await iniciarLectura({ mensaje: mensaje || undefined, adjuntos })
      setPasosVistos(0)
      setAbierto(null)
      setFiltro(null)
      setCancelando(false)
      setErrorCancelar(null)
      setTrabajoId(id)
    } catch (e) {
      setErrorArranque(e instanceof Error ? e.message : 'no se pudo iniciar la lectura')
    } finally {
      setEnviando(false)
    }
  }, [])

  const rehacer = useCallback(() => {
    setTrabajoId(null)
    setAbierto(null)
    setFiltro(null)
    setErrorArranque(null)
    setPasosVistos(0)
    setCancelando(false)
    setErrorCancelar(null)
  }, [])

  // CANCELAR NO LIMPIA LA PANTALLA. La fila queda en CANCELADO y el sondeo la trae en la vuelta
  // siguiente (≤1,5 s): el estado terminal lo declara el SERVIDOR, no este componente. Si se
  // borrara acá el trabajo, «cancelé» sería una afirmación de la pantalla sin nada que la respalde.
  const cancelar = useCallback(async () => {
    if (!trabajoId) return
    setCancelando(true)
    setErrorCancelar(null)
    try {
      await cancelarLectura(trabajoId)
    } catch (e) {
      setErrorCancelar(e instanceof Error ? e.message : 'no se pudo cancelar')
    } finally {
      setCancelando(false)
    }
  }, [trabajoId])

  const alternarAbierto = useCallback((id: string) => setAbierto((a) => (a === id ? null : id)), [])
  const alternarFiltro = useCallback((id: string) => setFiltro((f) => (f === id ? null : id)), [])
  const derivar = useCallback(() => {
    if (trabajo?.presupuesto_id) router.push(`/presupuestos/${trabajo.presupuesto_id}`)
  }, [trabajo, router])

  if (!trabajoId || !trabajo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ComposerInicial enviando={enviando} error={errorArranque ?? errorSondeo} onEnviar={arrancar} />
      </div>
    )
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col xl:flex-row" style={{ minHeight: 0 }} data-testid="entorno-lectura">
      <ConversacionLectura
        pasos={trabajo.pasos} estado={trabajo.estado} etapa={trabajo.etapa}
        error={trabajo.error ?? errorSondeo} filtro={filtro} abierto={abierto}
        // Un fallo del SONDEO (red, no del trabajo) mientras todavía no hay estado terminal: se
        // avisa aparte, sin pisar el bloque de error final que sólo corresponde a `estado==='ERROR'`.
        errorTransitorio={trabajo.estado !== 'ERROR' ? errorSondeo : null}
        cancelando={cancelando} errorCancelar={errorCancelar}
        onAbrir={alternarAbierto} onFiltrar={alternarFiltro} onRehacer={rehacer} onCancelar={cancelar}
      />
      <PresupuestoEnFormacion
        pasos={trabajo.pasos} computo={trabajo.computo} cascada={trabajo.cascada}
        filtro={filtro} listo={trabajo.estado === 'LISTO'} presupuestoId={trabajo.presupuesto_id}
        onQuitarFiltro={() => setFiltro(null)} onDerivar={derivar}
      />
    </div>
  )
}
