'use client'

// «Sacar una foto» (M03): abre la cámara trasera, sube la foto al bucket `herramientas` DESDE EL
// NAVEGADOR (`services/subida-foto.ts`) y la guarda en la ficha por `editar_activo` con la ruta.
// No toca ubicación ni estado.
//
// La misma pieza sirve en la ficha de escritorio (`variante="escritorio"`): ahí no hay cámara trasera
// —`capture` se ignora— y el botón elige un archivo. Una sola implementación para las dos caras: la
// foto de la ficha se cambia igual desde la obra y desde la oficina (paridad, dueño 23/09).
//
// VARIAS FOTOS (`varias`, migración 20261001T1800; dueño 01/10: «sirve como evidencia del estado»): cada
// foto se SUMA a las anteriores por `agregar_fotos_activo`, nunca las pisa. En la computadora se eligen
// varias de una vez; en el teléfono la cámara saca una y el botón queda para la siguiente. Sin la tabla
// (`varias` falso) es la foto única de siempre.

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { cambiarFotoAction, quitarFotoAction } from '../../services/acciones'
import { agregarFotosAction } from '../../services/acciones-fotos'
import { subirFotoDeActivo } from '../../services/subida-foto'
import { resumenDeTanda, TOPE_FOTOS_POR_VEZ } from '../../logica/fotos'
import { V } from '../estilo'

type Aviso = { texto: string; tono: 'pos' | 'neg' | 'apagado' }
const SUBIENDO: Aviso = { texto: 'Subiendo…', tono: 'apagado' }
const COLOR = { pos: V.pos, neg: V.neg, apagado: V.apagado }

export function SacarFoto({ activo, variante = 'telefono', onGuardada, tieneFoto = false, varias = false }: {
  activo: string
  variante?: 'telefono' | 'escritorio'
  /** Con la tabla `activo_foto`: las fotos se suman (varias de una vez) en vez de reemplazar la única. */
  varias?: boolean
  /** Con foto puesta se ofrece «Quitar la foto»: la ficha queda sin foto (dueño, 23/09/2026). */
  tieneFoto?: boolean
  /** Escritorio: qué hacer después de guardar (refrescar el parque del espacio). */
  onGuardada?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const listo = () => (onGuardada ?? router.refresh)()

  async function subir(f: File) {
    setAviso(SUBIENDO)
    const s = await subirFotoDeActivo(f, activo)
    if (!s.ok) return setAviso({ texto: s.error, tono: 'neg' })
    try {
      const r = await cambiarFotoAction({ activo, ruta: s.ruta })
      setAviso(r.ok ? { texto: 'Foto guardada.', tono: 'pos' } : { texto: r.error, tono: 'neg' })
      if (r.ok) listo()
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo guardar la foto', tono: 'neg' })
    }
  }

  // Una que no sube no frena a las otras: se guardan las que llegaron y se dice cuántas no.
  async function agregar(archivos: File[]) {
    const errores: string[] = []
    const rutas: string[] = []
    for (const [i, f] of archivos.entries()) {
      setAviso(archivos.length > 1 ? { texto: `Subiendo ${i + 1} de ${archivos.length}…`, tono: 'apagado' } : SUBIENDO)
      const s = await subirFotoDeActivo(f, activo)
      if (s.ok) rutas.push(s.ruta)
      else errores.push(s.error)
    }
    let guardadas = 0
    if (rutas.length) {
      const r = await agregarFotosAction({ activo, rutas })
        .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'No se pudieron guardar las fotos' }))
      if (r.ok) guardadas = r.dato
      else errores.unshift(r.error)
    }
    const res = resumenDeTanda(guardadas, errores)
    setAviso({ texto: res.texto, tono: res.ok ? 'pos' : 'neg' })
    if (guardadas > 0) listo()
  }

  function elegidas(lista: FileList | null) {
    const archivos = Array.from(lista ?? [])
    if (!archivos.length) return
    if (!varias) return subir(archivos[0])
    if (archivos.length > TOPE_FOTOS_POR_VEZ) return setAviso({ texto: `Son ${archivos.length} fotos: elegí hasta ${TOPE_FOTOS_POR_VEZ} por vez.`, tono: 'neg' })
    agregar(archivos)
  }

  async function quitar() {
    setAviso({ texto: 'Quitando…', tono: 'apagado' })
    const r = await quitarFotoAction({ activo })
    setAviso(r.ok ? { texto: 'Foto quitada.', tono: 'pos' } : { texto: r.error, tono: 'neg' })
    if (r.ok) listo()
  }

  const telefono = variante === 'telefono'
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} data-testid="sacar-foto"
        style={telefono
          ? { minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', width: '100%', textAlign: 'left' }
          : { fontSize: '12px', color: V.apagado, textAlign: 'left' }}>
        {telefono ? <>Sacar una foto <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span></> : varias ? 'Agregar fotos' : 'Cambiar la foto'}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple={varias} hidden data-testid="sacar-foto-archivo"
        onChange={(e) => { elegidas(e.target.files); e.target.value = '' }} />
      {tieneFoto && (
        <button type="button" onClick={quitar} data-testid="quitar-foto"
          style={telefono
            ? { minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', width: '100%', textAlign: 'left', color: V.neg }
            : { fontSize: '12px', color: V.neg, textAlign: 'left' }}>
          Quitar la foto{telefono && <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>}
        </button>
      )}
      {aviso && <div role="status" style={{ fontSize: telefono ? '12.5px' : '12px', color: COLOR[aviso.tono] }}>{aviso.texto}</div>}
    </>
  )
}
