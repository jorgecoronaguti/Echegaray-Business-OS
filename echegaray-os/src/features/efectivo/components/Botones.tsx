'use client'

// LOS BOTONES CON COMPORTAMIENTO DE «EFECTIVO A RENDIR»: exportar la lista, subir el papel de conformidad y
// anular una entrega mal cargada. Lo demás de las pantallas es servidor y enlaces.

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import type { Entrega } from '../types'
import { entregasCsv } from '../logica/entregas'
import { anularEntregaAction } from '../services/acciones'
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

/** ANULAR — sólo un error de carga y con motivo. La base rechaza si ya tiene rendiciones o devoluciones. */
export function AnularEntrega({ entrega, volverHref }: { entrega: string; volverHref: string }) {
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
      {error && <span role="alert" style={{ fontSize: '12px', color: V.neg }}>{error}</span>}
    </span>
  )
}
