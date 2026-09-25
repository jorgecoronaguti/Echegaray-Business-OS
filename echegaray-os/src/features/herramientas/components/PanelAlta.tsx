'use client'

// D12 · NUEVO ACTIVO — un panel de tres campos, no un formulario largo.
//
// El código son tres letras que salen del nombre (AMO-007) y se pueden cambiar, guiado (`CampoCodigo`);
// el número lo asigna la base bajo candado, así que la vista previa nunca choca con otra alta. Al
// terminar, el activo queda en la cola de etiquetas (D14) por no tener `etiqueta_impresa_en`.
//
// Es el mismo «Dar de alta una herramienta» del teléfono (M14): desde Ubicaciones entra en el lugar
// elegido (`destinoInicial`), como en obra entra donde está parado el teléfono.

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { claveDestino, destinos } from '../logica/mover'
import { prefijoDeNombre } from '../logica/codigo'
import { ACCION } from '../logica/acciones-lugar'
import { darDeAltaAction } from '../services/acciones'
import { subirFotoDeActivo } from '../services/subida-foto'
import type { Clase } from '../types'
import { CATEGORIA_PERSONAL, SERIES_TALLE, normalizarTalle, type ClasePersonal } from '../logica/vestimenta'
import { useHerramientas } from './Espacio'
import { CampoCodigo } from './CampoCodigo'
import { Bloque, ErrorPanel, PanelLateral } from './PanelLateral'
import { botonPrimarioGrande, botonSecundarioGrande, campo, eyebrow, V } from './estilo'

const CLASES: { v: Clase; t: string }[] = [
  { v: 'herramienta', t: 'Herramienta' }, { v: 'equipo', t: 'Maquinaria' }, { v: 'rodado', t: 'Rodado' },
  { v: 'epp', t: 'EPP' }, { v: 'ropa', t: 'Ropa de trabajo' },
]

const esPersonalClase = (c: Clase): c is ClasePersonal => c === 'epp' || c === 'ropa'

export function PanelAlta({ destinoInicial, claseInicial, onHecho }: { destinoInicial?: string; claseInicial?: Clase; onHecho: (t: string) => void }) {
  const { parque, obras, cerrar, refrescar } = useHerramientas()
  const opciones = useMemo(() => destinos(parque, obras), [parque, obras])
  const taller = opciones.find((o) => o.grupo === 'taller')
  // La lista cerrada de la base (`activo_categoria`): no se tipea una categoría nueva.
  const cats = parque.categorias ?? []
  const [categoria, setCategoria] = useState('')
  const [clase, setClase] = useState<Clase>(claseInicial ?? 'herramienta')
  // EPP y ropa (20260925T1100): un ítem por talle. Se elige una serie y se sacan los que no van.
  const personal = esPersonalClase(clase)
  const [talles, setTalles] = useState<string[]>(claseInicial === 'ropa' ? SERIES_TALLE[0].talles : [])
  const [talleSuelto, setTalleSuelto] = useState('')
  const [destino, setDestino] = useState(destinoInicial ?? (taller ? claveDestino(taller) : ''))
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  // Las tres letras siguen al nombre hasta que alguien las toca.
  const [prefijo, setPrefijo] = useState<{ v: string; aMano: boolean }>({ v: '', aMano: false })
  const letras = prefijo.aMano ? prefijo.v : prefijoDeNombre(nombre)
  const form = useRef<HTMLFormElement>(null)

  async function enviar(otra: boolean) {
    if (!form.current) return
    const fd = new FormData(form.current)
    fd.set('clase', clase)
    fd.set('destino', destino)
    fd.set('codigo', letras)
    fd.set('categoria', clase === 'rodado' ? 'Rodados' : personal ? CATEGORIA_PERSONAL[clase as ClasePersonal] : categoria)
    if (clase !== 'rodado' && !personal && !categoria) return setError('Elegí la categoría')
    setEnviando(true)
    setError(null)
    // La foto va del navegador al bucket; a la acción llega sólo la ruta (`logica/foto.ts`).
    const foto = fd.get('foto')
    fd.delete('foto')
    if (foto instanceof File && foto.size > 0) {
      const s = await subirFotoDeActivo(foto, 'alta')
      if (!s.ok) { setEnviando(false); return setError(s.error) }
      fd.set('foto', s.ruta)
    }
    // Un alta por talle; sin talles, una sola (talle único). Si un talle falla, los anteriores ya quedaron.
    const tandas = personal && talles.length ? talles : [null]
    const codigos: string[] = []
    let r: Awaited<ReturnType<typeof darDeAltaAction>> | null = null
    for (const t of tandas) {
      if (t) fd.set('talle', t)
      else fd.delete('talle')
      r = await darDeAltaAction(fd)
      if (!r.ok) break
      codigos.push(t ? `${r.dato.codigo} (${t})` : r.dato.codigo)
    }
    setEnviando(false)
    if (!r) return
    if (!r.ok) return setError(codigos.length ? `Quedaron ${codigos.join(', ')}. ${r.error}` : r.error)
    const nombre = String(fd.get('nombre') ?? '')
    if (codigos.length > 1 && !otra) {
      onHecho(`${nombre}: ${codigos.length} talles dados de alta (${codigos.join(', ')}). El stock se carga con el recuento del Taller.`)
      return
    }
    if (otra) {
      // Se conservan clase, categoría y destino: la tanda típica es «cinco amoladoras al Taller».
      const n = form.current.elements.namedItem('nombre') as HTMLInputElement | null
      const f = form.current.elements.namedItem('foto') as HTMLInputElement | null
      if (n) n.value = ''
      setNombre('')
      setPrefijo({ v: '', aMano: false })
      if (f) f.value = ''
      n?.focus()
      setUltimo(`${codigos.join(', ')} · ${nombre} quedó dado de alta.`)
      refrescar()
      return
    }
    onHecho(personal
      ? `${r.dato.codigo} · ${nombre} quedó dado de alta. El stock se carga con el recuento del Taller.`
      : `${r.dato.codigo} · ${nombre} quedó dado de alta y está en la cola de etiquetas.`)
  }

  return (
    <PanelLateral
      testid="panel-alta" titulo={ACCION.alta} onCerrar={cerrar}
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
            <input name="nombre" required minLength={2} maxLength={160} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...campo, borderColor: V.grafito }} data-testid="alta-nombre" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 11 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Categoría</span>
              {clase === 'rodado' || personal ? (
                <div style={{ ...campo, display: 'flex', alignItems: 'center', color: V.tintaSuave }}>{personal ? CATEGORIA_PERSONAL[clase as ClasePersonal] : 'Rodados'}</div>
              ) : (
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ ...campo, borderColor: categoria ? V.lineaFuerte : V.grafito }} data-testid="alta-categoria">
                  <option value="">Elegí la categoría</option>
                  {cats.filter((c) => c !== 'Rodados').map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Dónde entra</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} style={campo} data-testid="alta-destino">
                <option value="">Sin ubicación cargada</option>
                {opciones.map((o) => <option key={claveDestino(o)} value={claveDestino(o)}>{o.rotulo}</option>)}
              </select>
            </label>
          </div>
          {personal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="alta-talles">
              <span style={eyebrow}>Talles · uno por ítem</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SERIES_TALLE.map((x) => (
                  <button key={x.clave} type="button" onClick={() => setTalles(x.talles)} style={{ fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 3 }}>{x.rotulo}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {talles.length === 0 && <span style={{ fontSize: '13px', color: V.tintaSuave }}>Talle único</span>}
                {talles.map((t) => (
                  <button key={t} type="button" onClick={() => setTalles(talles.filter((x) => x !== t))} title="Sacar este talle"
                    style={{ height: 28, padding: '0 8px', borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, fontSize: '12.5px', color: V.tinta, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {t}<span aria-hidden style={{ color: V.tenue }}>×</span>
                  </button>
                ))}
                <input value={talleSuelto} onChange={(e) => setTalleSuelto(e.target.value)} placeholder="otro" aria-label="Agregar un talle" maxLength={12}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const t = normalizarTalle(talleSuelto)
                    if (t && !talles.includes(t)) setTalles([...talles, t])
                    setTalleSuelto('')
                  }}
                  style={{ height: 28, width: 64, padding: '0 8px', border: `1px solid ${V.linea}`, borderRadius: 6, fontSize: '12.5px' }} />
              </div>
            </div>
          )}
          {clase !== 'rodado' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 140 }}>
              <span style={eyebrow}>Cantidad</span>
              <input key={personal ? 'p' : 'h'} name="cantidad" type="number" min={personal ? 0 : 1} max={100000} step={1} defaultValue={personal ? 0 : 1} style={campo} data-testid="alta-cantidad" />
              <span style={{ fontSize: '12px', color: V.tenue }}>{personal ? '0 = se cuenta después, en el recuento del Taller.' : 'Más de 1 = un lote.'}</span>
            </label>
          )}
          {clase === 'rodado' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={eyebrow}>Patente</span>
              <input name="patente" maxLength={20} style={{ ...campo, textTransform: 'uppercase' }} />
            </label>
          )}
          <CampoCodigo nombre={nombre} prefijo={letras} onPrefijo={(v, aMano) => setPrefijo({ v, aMano })} />
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
