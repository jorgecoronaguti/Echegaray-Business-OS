'use client'

// REGISTRAR UN ARREGLO desde Mantenimiento — para un activo que todavía no se abrió en la ficha: se elige cuál
// (por código o nombre) y se carga a dónde lo llevaron. Es el mismo formulario que usa la ficha y el teléfono.

import { useState } from 'react'
import { activoDeTexto, candidatosArreglo, rotuloDeBusqueda } from '../logica/arreglo'
import { useHerramientas } from './Espacio'
import { FormularioArreglo } from './FormularioArreglo'
import { PanelLateral } from './PanelLateral'
import { V, campo, eyebrow } from './estilo'

export function PanelArreglo({ idInicial, onHecho }: { idInicial?: string; onHecho: (t: string) => void }) {
  const { parque, cerrar } = useHerramientas()
  const candidatos = candidatosArreglo(parque.activos, parque.eventos)
  const inicial = idInicial ? candidatos.find((a) => a.id === idInicial) ?? null : null
  const [texto, setTexto] = useState(inicial ? rotuloDeBusqueda(inicial) : '')
  const activo = activoDeTexto(candidatos, texto)
  const proveedores = (parque.proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))
  return (
    <PanelLateral testid="panel-arreglo" titulo="Registrar un arreglo" onCerrar={cerrar}>
      {parque.eventos == null ? (
        <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración 20260930T2300: todavía no se pueden cargar arreglos.</div>
      ) : (
        <>
          <label>
            <span style={{ ...eyebrow, display: 'block', marginBottom: 4 }}>Qué activo</span>
            <input type="text" list="candidatos-arreglo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código o nombre" style={{ ...campo, height: 34 }} data-testid="arreglo-activo" autoFocus />
            <datalist id="candidatos-arreglo">{candidatos.slice(0, 400).map((a) => <option key={a.id} value={rotuloDeBusqueda(a)} />)}</datalist>
          </label>
          {texto.trim() && !activo && <div style={{ fontSize: '12.5px', color: V.apagado }}>Ese activo no está o no se puede cargar (ya está en el mecánico, está dado de baja o es un lote).</div>}
          {activo && <FormularioArreglo key={activo.id} activo={activo.id} clase={activo.clase} proveedores={proveedores} onHecho={onHecho} onCancelar={cerrar} />}
        </>
      )}
    </PanelLateral>
  )
}
