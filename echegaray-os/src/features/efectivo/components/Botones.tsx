'use client'

// LOS BOTONES CON COMPORTAMIENTO DE «EFECTIVO A RENDIR»: exportar la lista, subir el papel de conformidad y
// anular una entrega mal cargada. Lo demás de las pantallas es servidor y enlaces.

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import type { Entrega } from '../types'
import { entregasCsv } from '../logica/entregas'
import { anularEntregaAction, borrarEntregaDePruebaAction, reclamarRendicionAction } from '../services/acciones'
import { subirConformidadEnPapel } from '../services/subida'
import { ACCEPT_PAGO } from '@/features/administracion/services/comprobanteDePago'
import { V, botonClaro, campo } from './estilo'

/** «Exportar» — la lista entera como CSV (`;` y coma decimal, lo que abre bien una planilla acá). */
export function BotonExportar({ entregas, hoy }: { entregas: Entrega[]; hoy: string }) {
  const bajar = () => {
    const blob = new Blob([`﻿${entregasCsv(entregas, hoy)}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `efectivo-a-rendir-${hoy}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return <button type="button" onClick={bajar} style={botonClaro} data-testid="efectivo-exportar">Exportar</button>
}

/**
 * LA CONFORMIDAD EN PAPEL: la foto del papel firmado. La firma con el dedo es de quien recibió la plata, en su
 * teléfono (etapa 2): desde acá sólo se sube el papel.
 */
export function SubirPapel({ entrega }: { entrega: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const elegir = (f: File | undefined) => {
    if (!f) return
    setError(null)
    empezar(async () => {
      const r = await subirConformidadEnPapel(f, entrega)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <input ref={input} type="file" accept={ACCEPT_PAGO} hidden onChange={(e) => elegir(e.target.files?.[0])} data-testid="papel-archivo" />
      <button type="button" onClick={() => input.current?.click()} disabled={pendiente} style={{ ...botonClaro, height: 28, fontSize: '12.5px' }} data-testid="subir-papel">
        {pendiente ? 'Subiendo…' : 'Subir el papel firmado'}
      </button>
      {error && <span role="alert" style={{ fontSize: '12px', color: V.neg }}>{error}</span>}
    </span>
  )
}

/**
 * D03 · «RECLAMAR RENDICIÓN» — el pedido sale por el canal Efectivo.
 *
 * ═══ POR QUÉ NO DICE «AVISADO» AL VOLVER ═══
 *
 * Apretar el botón ENCOLA (`efectivo_aviso`); quien publica en Mattermost es el orquestador de la VM,
 * que es el único con el token del bot. Decir «avisado» acá sería afirmar un efecto que todavía no
 * ocurrió — el mismo defecto que tenía el botón apagado, al revés. La pantalla dice «encolado» y la
 * ficha muestra cuándo salió de verdad, que es cuando la cola guarda el id del post.
 */
export function ReclamarRendicion({ entrega, ultimo }: { entrega: string; ultimo: string | null }) {
  const router = useRouter()
  const [dicho, setDicho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const reclamar = () => empezar(async () => {
    setError(null)
    const r = await reclamarRendicionAction(entrega)
    if (!r.ok) { setError(r.error); return }
    setDicho('Pedido encolado: sale por el canal Efectivo.')
    router.refresh()
  })
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <button type="button" onClick={reclamar} disabled={pendiente} style={{ ...botonClaro, opacity: pendiente ? 0.6 : 1 }} data-testid="reclamar-rendicion">
        {pendiente ? 'Reclamando…' : 'Reclamar rendición'}
      </button>
      {error && <span role="alert" style={{ fontSize: '12px', color: V.neg }}>{error}</span>}
      {!error && (dicho || ultimo) && (
        <span style={{ fontSize: '11.5px', color: V.apagado }} data-testid="reclamo-estado">{dicho ?? ultimo}</span>
      )}
    </span>
  )
}

/** ANULAR — sólo un error de carga y con motivo. La base rechaza si ya tiene rendiciones o devoluciones. */
export function AnularEntrega({ entrega, volverHref, devuelto = false, tickets = 0 }: {
  entrega: string
  volverHref: string
  /** La entrega tiene un vuelto registrado: anularla lo borra, y eso se dice antes. */
  devuelto?: boolean
  /** Tickets todavía en camino: la anulación los descarta con su motivo. */
  tickets?: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2 }} data-testid="anular-entrega">
        Anular (error de carga)
      </button>
    )
  }
  const anular = () => empezar(async () => {
    const r = await anularEntregaAction({ id: entrega, motivo })
    if (!r.ok) { setError(r.error); return }
    router.push(volverHref)
  })
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" maxLength={400} style={{ ...campo, height: 30, width: 220 }} aria-label="Motivo de la anulación" />
      <button type="button" onClick={anular} disabled={pendiente || !motivo.trim()} style={{ ...botonClaro, height: 30, color: V.neg }} data-testid="anular-confirmar">
        {pendiente ? 'Anulando…' : 'Anular'}
      </button>
      <button type="button" onClick={() => setAbierto(false)} style={{ fontSize: '12.5px', color: V.apagado }}>Cancelar</button>
      {(devuelto || tickets > 0) && (
        <span style={{ fontSize: '12px', color: V.apagado, flexBasis: '100%' }} data-testid="anular-arrastra">
          {[
            devuelto ? 'se borra la devolución registrada' : null,
            tickets > 0 ? `${tickets} ticket${tickets === 1 ? '' : 's'} queda${tickets === 1 ? '' : 'n'} descartado${tickets === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
      )}
      {error && <span role="alert" style={{ fontSize: '12px', color: V.neg }}>{error}</span>}
    </span>
  )
}

/**
 * BORRAR UNA PRUEBA. Sólo se dibuja si la entrega se declaró prueba al crearla, y la base lo vuelve a
 * exigir: una entrega real no se borra desde ninguna puerta.
 *
 * PIDE ESCRIBIR EL CÓDIGO. Borrar no se deshace, y un botón que borra al primer clic borra la entrega
 * de al lado tarde o temprano. Tipear «ER-0007» tarda tres segundos y no hay forma de hacerlo sin
 * querer.
 */
export function BorrarPrueba({ entrega, codigo, volverHref }: {
  entrega: string
  codigo: string
  volverHref: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  if (!abierto) {
    return (
      <button
        type="button" onClick={() => setAbierto(true)} data-testid="borrar-prueba"
        style={{ fontSize: '12.5px', color: V.neg, textDecoration: 'underline', textUnderlineOffset: 2 }}
      >
        Borrar esta prueba
      </button>
    )
  }
  const borrar = () => empezar(async () => {
    const r = await borrarEntregaDePruebaAction({ id: entrega })
    if (!r.ok) { setError(r.error); return }
    router.push(volverHref)
  })
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input
        value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder={codigo} maxLength={12}
        style={{ ...campo, height: 30, width: 130 }} aria-label={`Escribí ${codigo} para borrar`}
      />
      <button
        type="button" onClick={borrar} disabled={pendiente || escrito.trim().toUpperCase() !== codigo}
        style={{ ...botonClaro, height: 30, color: V.neg }} data-testid="borrar-prueba-confirmar"
      >
        {pendiente ? 'Borrando…' : 'Borrar del todo'}
      </button>
      <button type="button" onClick={() => setAbierto(false)} style={{ fontSize: '12.5px', color: V.apagado }}>Cancelar</button>
      <span style={{ flexBasis: '100%', fontSize: '12px', color: V.apagado }}>
        Escribí <strong>{codigo}</strong> para confirmar. No se puede deshacer: no queda nada en la app.
      </span>
      {error && <span role="alert" style={{ fontSize: '12px', color: V.neg, flexBasis: '100%' }}>{error}</span>}
    </span>
  )
}
