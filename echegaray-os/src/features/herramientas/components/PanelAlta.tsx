'use client'

// D12 · NUEVO ACTIVO — un panel de tres campos, no un formulario largo.
//
// El código lo asigna la base (HER-0001 / EQU-0001 / ROD-0001) salvo que se escanee una etiqueta ya
// pegada. No se muestra un «próximo código» calculado acá: la secuencia vive en la base y dos personas
// dando de alta a la vez harían mentir a la sugerencia. Al terminar, el activo queda en la cola de
// etiquetas (D14) por no tener `etiqueta_impresa_en`.

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { claveDestino, destinos } from '../logica/mover'
import { categorias } from '../logica/inventario'
import { darDeAltaAction } from '../services/acciones'
import type { Clase } from '../types'
import { useHerramientas } from './Espacio'
import { Bloque, ErrorPanel, PanelLateral } from './PanelLateral'
import { botonPrimarioGrande, botonSecundarioGrande, campo, eyebrow, V } from './estilo'

const CLASES: { v: Clase; t: string }[] = [
  { v: 'herramienta', t: 'Herramienta' }, { v: 'equipo', t: 'Equipo' }, { v: 'rodado', t: 'Rodado' },
]

export function PanelAlta({ onHecho }: { onHecho: (t: string) => void }) {
  const { parque, obras, cerrar, refrescar } = useHerramientas()
  const opciones = useMemo(() => destinos(parque, obras), [parque, obras])
  const taller = opciones.find((o) => o.grupo === 'taller')
  const cats = useMemo(() => categorias(parque.activos).valores, [parque.activos])
  const [clase, setClase] = useState<Clase>('herramienta')
  const [destino, setDestino] = useState(taller ? claveDestino(taller) : '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)

  async function enviar(otra: boolean) {
    if (!form.current) return
    const fd = new FormData(form.current)
    fd.set('clase', clase)
    fd.set('destino', destino)
    setEnviando(true)
    setError(null)
    const r = await darDeAltaAction(fd)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    const nombre = String(fd.get('nombre') ?? '')
    if (otra) {
      // Se conservan clase, categoría y destino: la tanda típica es «cinco amoladoras al Taller».
      const n = form.current.elements.namedItem('nombre') as HTMLInputElement | null
      const c = form.current.elements.namedItem('codigo') as HTMLInputElement | null
      const f = form.current.elements.namedItem('foto') as HTMLInputElement | null
      if (n) n.value = ''
      if (c) c.value = ''
      if (f) f.value = ''
      n?.focus()
      setUltimo(`${r.dato.codigo} · ${nombre} quedó dado de alta.`)
      refrescar()
      return
    }
    onHecho(`${r.dato.codigo} · ${nombre} quedó dado de alta y está en la cola de etiquetas.`)
  }

  return (
    <PanelLateral
      testid="panel-alta" titulo="Nuevo activo" onCerrar={cerrar}
      pie={
        <>
          <button type="button" data-testid="dar-de-alta" disabled={enviando} onClick={() => enviar(false)} style={botonPrimarioGrande}>
            {enviando ? 'Guardando…' : 'Dar de alta'}
          </button>
          <button type="button" disabled={enviando} onClick={() => enviar(true)} style={botonSecundarioGrande}>Alta y cargar otra</button>
        </>
      }
    >
      <form ref={form} onSubmit={(e) => { e.preventDefault(); enviar(false) }} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Bloque rotulo="Qué es" primero>
          <div role="radiogroup" style={{ display: 'flex', gap: 8 }}>
            {CLASES.map((c) => (
              <button
                key={c.v} type="button" role="radio" aria-checked={clase === c.v} onClick={() => setClase(c.v)}
                style={{
                  height: 34, padding: '0 11px', borderRadius: 6, fontSize: '13px',
                  border: `1px solid ${clase === c.v ? V.grafito : V.linea}`, color: clase === c.v ? V.tinta : V.apagado,
                  fontWeight: clase === c.v ? 500 : 400,
                }}
              >
                {c.t}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.45 }}>
            La clase define qué campos aparecen. Rodado agrega la patente.
          </div>
        </Bloque>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={eyebrow}>Nombre</span>
            <input name="nombre" required minLength={2} maxLength={160} autoFocus style={{ ...campo, borderColor: V.grafito }} data-testid="alta-nombre" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 11 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Categoría</span>
              <input name="categoria" list="categorias-herramientas" maxLength={60} placeholder="sin categoría" style={campo} />
              <datalist id="categorias-herramientas">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Dónde entra</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} style={campo} data-testid="alta-destino">
                <option value="">Sin ubicación cargada</option>
                {opciones.map((o) => <option key={claveDestino(o)} value={claveDestino(o)}>{o.rotulo}</option>)}
              </select>
            </label>
          </div>
          {clase === 'rodado' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Patente</span>
              <input name="patente" maxLength={20} style={{ ...campo, textTransform: 'uppercase' }} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={eyebrow}>Código</span>
            <input name="codigo" maxLength={40} placeholder="Se asigna solo al dar de alta" style={{ ...campo, fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px' }} />
            <span style={{ fontSize: '12.5px', color: V.apagado }}>Si la etiqueta ya está pegada, se escanea o se tipea acá y queda ese.</span>
          </label>
        </div>

        <Bloque rotulo="Opcional">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '13px' }}>
            Foto
            <input name="foto" type="file" accept="image/*" style={{ fontSize: '12.5px' }} />
          </label>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>
            Compra (fecha, precio) y número de serie se completan después desde la ficha. Nada de esto frena el alta.
          </div>
        </Bloque>
      </form>
      {ultimo && (
        <div role="status" style={{ fontSize: '12.5px', color: V.pos }}>
          {ultimo} <Link href="/herramientas/etiquetas" style={{ textDecoration: 'underline' }}>Ver la cola de etiquetas</Link>
        </div>
      )}
      <ErrorPanel texto={error} />
    </PanelLateral>
  )
}
