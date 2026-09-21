'use client'

// COMPLETAR DATOS DE LA FICHA — lo que el alta deja para después (D12 «Opcional»): nombre, categoría,
// número de serie, patente y compra. Nada de esto toca ubicación ni estado: va por `editar_activo`.
// Si viene de un alta desde obra, guardar la marca como revisada.

import { useState } from 'react'
import { categorias } from '../logica/inventario'
import { cambiarFotoAction, editarActivoAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { ErrorPanel, PanelLateral } from './PanelLateral'
import { botonPrimarioGrande, botonSecundarioGrande, campo, eyebrow, V } from './estilo'

export function PanelEditar({ id, onHecho }: { id: string; onHecho: (t: string) => void }) {
  const { parque, cerrar } = useHerramientas()
  const a = parque.activoPorId.get(id)
  const [v, setV] = useState(() => ({
    nombre: a?.nombre ?? '', categoria: a?.categoria ?? '', numero_serie: a?.numero_serie ?? '', patente: a?.patente ?? '',
    compra_fecha: a?.compra_fecha ?? '', compra_precio: a?.compra_precio != null ? String(a.compra_precio) : '',
  }))
  const [revisada, setRevisada] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (!a) return null
  const cats = categorias(parque.activos).valores

  async function guardar() {
    if (!a) return
    setEnviando(true)
    setError(null)
    const r = await editarActivoAction({
      activo: a.id,
      datos: {
        nombre: v.nombre, categoria: v.categoria, numero_serie: v.numero_serie, compra_fecha: v.compra_fecha,
        compra_precio: v.compra_precio.replace(',', '.'),
        ...(a.clase === 'rodado' ? { patente: v.patente } : {}),
        ...(revisada ? { revisada: true as const } : {}),
      },
    })
    if (r.ok && foto) {
      const fd = new FormData()
      fd.set('activo', a.id)
      fd.set('foto', foto)
      const f = await cambiarFotoAction(fd)
      if (!f.ok) {
        setEnviando(false)
        return setError(`Los datos se guardaron, la foto no: ${f.error}`)
      }
    }
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(`${a.codigo}: datos guardados.`)
  }

  const fila = (k: keyof typeof v, rotulo: string, extra?: Partial<React.InputHTMLAttributes<HTMLInputElement>>) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={eyebrow}>{rotulo}</span>
      <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={campo} {...extra} />
    </label>
  )

  return (
    <PanelLateral
      testid="panel-editar" titulo="Datos de la ficha" subtitulo={`${a.codigo} · ${a.nombre}`} onCerrar={cerrar}
      pie={
        <>
          <button type="button" disabled={enviando} onClick={guardar} style={botonPrimarioGrande} data-testid="guardar-datos">{enviando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={cerrar} style={botonSecundarioGrande}>Cancelar</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fila('nombre', 'Nombre', { maxLength: 160 })}
        {fila('categoria', 'Categoría', { maxLength: 60, list: 'categorias-editar' })}
        <datalist id="categorias-editar">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        {fila('numero_serie', 'Número de serie', { maxLength: 80 })}
        {a.clase === 'rodado' && fila('patente', 'Patente', { maxLength: 20 })}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 11 }}>
          {fila('compra_fecha', 'Fecha de compra', { type: 'date' })}
          {fila('compra_precio', 'Precio de compra', { inputMode: 'decimal', placeholder: 'sin cargar' })}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={eyebrow}>Foto</span>
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} style={{ fontSize: '12.5px' }} />
        </label>
        {a.alta_desde_obra && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '13px', color: V.tinta }}>
            <input type="checkbox" checked={revisada} onChange={(e) => setRevisada(e.target.checked)} />
            Alta desde obra revisada por administración
          </label>
        )}
      </div>
      <ErrorPanel texto={error} />
    </PanelLateral>
  )
}
