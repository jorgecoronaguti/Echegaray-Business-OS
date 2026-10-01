'use client'

// EL ARREGLO — «lo llevé al mecánico» y «ya volvió». Una pieza para el panel de escritorio, la ficha y el
// teléfono (`variante`): en el teléfono sólo lo que hace falta a la vista (qué falla, a quién, cuándo vuelve;
// qué se le hizo, cuánto salió, cómo quedó) y el resto, plegado en «Más datos».
//
//   · ingreso: un arreglo nuevo, o un «hay que llevarlo» que pasa al mecánico (`abierto`, pendiente).
//   · cierre:  un arreglo en el mecánico (`abierto`, en_taller) que vuelve. Queda operativo o se da de baja.
//
// El costo y el N° de comprobante se guardan como datos del arreglo: no se escribe en Compras. Vacío no es cero.

import { useState, type ReactNode } from 'react'
import { SegmentedControl } from '@/shared/components/ui'
import { errorDeCierre, errorDeIngreso, hoyIso } from '../logica/arreglo'
import { NOMBRE_TIPO_EVENTO, TIPOS_EVENTO, type Evento, type TipoEvento } from '../logica/evento'
import { avanzarEventoAction, registrarEventoAction } from '../services/acciones-evento'
import { V, botonPrimarioGrande, campo, eyebrow } from './estilo'

type Props = {
  activo: string
  clase: 'herramienta' | 'equipo' | 'rodado'
  proveedores: { id: string; nombre: string }[]
  /** Con `abierto` pendiente es un ingreso; con `abierto` en el mecánico, el cierre. */
  abierto?: Evento
  variante?: 'escritorio' | 'telefono'
  onHecho: (texto: string) => void
  onCancelar?: () => void
}

/** Estilos de campo según la variante: en el teléfono, 48 de alto y 16px (menos no se toca con el pulgar). */
function estilos(tel: boolean) {
  return {
    campo: { ...campo, height: tel ? 48 : 34, fontSize: tel ? '16px' : '13.5px' },
    rotulo: { ...eyebrow, marginBottom: tel ? 6 : 4, display: 'block' as const },
    grilla: { display: 'grid', gridTemplateColumns: tel ? '1fr' : '1fr 1fr', gap: tel ? 14 : 12 } as const,
  }
}

function Pie({ tel, enviando, etiqueta, onEnviar, onCancelar, error }: {
  tel: boolean; enviando: boolean; etiqueta: string; onEnviar: () => void; onCancelar?: () => void; error: string | null
}) {
  return (
    <>
      {error && <div role="alert" style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.neg, lineHeight: 1.5 }} data-testid="arreglo-error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={onEnviar} disabled={enviando} data-testid="guardar-arreglo"
          style={{ ...botonPrimarioGrande, height: tel ? 52 : 38, flex: tel ? 1 : undefined, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Guardando…' : etiqueta}
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} style={{ fontSize: tel ? '14px' : '13px', color: V.apagado, padding: '0 10px' }}>Cancelar</button>}
      </div>
    </>
  )
}

/** En el teléfono lo secundario va plegado; en el escritorio, a la vista. */
function Mas({ tel, children }: { tel: boolean; children: ReactNode }) {
  if (!tel) return <>{children}</>
  return (
    <details data-testid="arreglo-mas-datos">
      <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center', fontSize: '14.5px', cursor: 'pointer' }}>Más datos</summary>
      <div style={{ display: 'grid', gap: 14, paddingTop: 6 }}>{children}</div>
    </details>
  )
}

export function FormularioArreglo(props: Props) {
  return props.abierto?.situacion === 'en_taller' ? <Cierre {...props} abierto={props.abierto} /> : <Ingreso {...props} />
}

function Ingreso({ activo, clase, proveedores, abierto, variante = 'escritorio', onHecho, onCancelar }: Props) {
  const tel = variante === 'telefono'
  const e = estilos(tel)
  const hoy = hoyIso()
  const [falla, setFalla] = useState(abierto?.descripcion ?? '')
  const [taller, setTaller] = useState(abierto?.taller_texto ?? '')
  const [vuelta, setVuelta] = useState('')
  const [ingreso, setIngreso] = useState(hoy)
  const [llevadoPor, setLlevadoPor] = useState('')
  const [tipo, setTipo] = useState<TipoEvento>(abierto?.tipo ?? 'reparacion')
  const [km, setKm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const propietario = proveedores.find((p) => p.nombre.toLowerCase() === taller.trim().toLowerCase())

  async function enviar() {
    const falta = errorDeIngreso({ falla, taller, ingreso, vueltaEstimada: vuelta, hoy })
    if (falta) return setError(falta)
    setEnviando(true)
    setError(null)
    const comun = { km, proveedor: propietario?.id ?? '', taller: propietario ? '' : taller, llevadoPor, vueltaEstimada: vuelta }
    const r = await (abierto
      ? avanzarEventoAction({ evento: abierto.id, situacion: 'en_taller', fecha: ingreso, descripcion: falla, ...comun })
      : registrarEventoAction({ activo, tipo, situacion: 'en_taller', fecha: ingreso, descripcion: falla, ...comun })
    ).catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : 'No se pudo registrar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho('Quedó en el mecánico.')
  }

  return (
    <div data-testid="formulario-arreglo" style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }}>
      <label>
        <span style={e.rotulo}>Qué falla tiene</span>
        <input type="text" value={falla} maxLength={1000} onChange={(x) => setFalla(x.target.value)} placeholder="No arranca, pierde aceite, hace ruido…" style={e.campo} data-testid="arreglo-falla" />
      </label>
      <label>
        <span style={e.rotulo}>Mecánico o taller</span>
        <input type="text" list="proveedores-taller" value={taller} maxLength={160} onChange={(x) => setTaller(x.target.value)} placeholder="Proveedor o nombre" style={e.campo} data-testid="arreglo-taller" />
        <datalist id="proveedores-taller">{proveedores.slice(0, 200).map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
      </label>
      <label>
        <span style={e.rotulo}>Cuándo vuelve (estimado)</span>
        <input type="date" value={vuelta} min={ingreso} onChange={(x) => setVuelta(x.target.value)} style={e.campo} data-testid="arreglo-vuelta-estimada" />
      </label>
      <Mas tel={tel}>
        <div style={e.grilla}>
          <label>
            <span style={e.rotulo}>Entró al taller</span>
            <input type="date" value={ingreso} max={hoy} onChange={(x) => setIngreso(x.target.value)} style={e.campo} data-testid="arreglo-ingreso" />
          </label>
          <label>
            <span style={e.rotulo}>Quién lo llevó</span>
            <input type="text" value={llevadoPor} maxLength={120} onChange={(x) => setLlevadoPor(x.target.value)} placeholder="Vos, si lo dejás vacío" style={e.campo} data-testid="arreglo-llevado-por" />
          </label>
          {!abierto && (
            <label>
              <span style={e.rotulo}>Qué trabajo</span>
              <select value={tipo} onChange={(x) => setTipo(x.target.value as TipoEvento)} style={e.campo} data-testid="arreglo-tipo">
                {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{NOMBRE_TIPO_EVENTO[t]}</option>)}
              </select>
            </label>
          )}
          {clase === 'rodado' && (
            <label>
              <span style={e.rotulo}>Kilometraje</span>
              <input type="number" inputMode="decimal" min={0} step="0.1" value={km} onChange={(x) => setKm(x.target.value)} placeholder="km" style={e.campo} data-testid="arreglo-km" />
            </label>
          )}
        </div>
      </Mas>
      <Pie tel={tel} enviando={enviando} etiqueta="Lo llevé al mecánico" onEnviar={enviar} onCancelar={onCancelar} error={error} />
    </div>
  )
}

function Cierre({ clase, abierto, variante = 'escritorio', onHecho, onCancelar }: Props & { abierto: Evento }) {
  const tel = variante === 'telefono'
  const e = estilos(tel)
  const hoy = hoyIso()
  const [trabajo, setTrabajo] = useState('')
  const [costo, setCosto] = useState('')
  const [resultado, setResultado] = useState<'operativo' | 'baja'>('operativo')
  const [repuestos, setRepuestos] = useState('')
  const [compraRef, setCompraRef] = useState('')
  const [vuelta, setVuelta] = useState(hoy)
  const [proximoKm, setProximoKm] = useState('')
  const [proximoFecha, setProximoFecha] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const baja = resultado === 'baja'

  async function enviar() {
    const falta = errorDeCierre({ trabajo, vuelta, ingreso: abierto.ingreso_taller ?? null, costo, resultado, hoy })
    if (falta) return setError(falta)
    setEnviando(true)
    setError(null)
    const r = await avanzarEventoAction({
      evento: abierto.id, situacion: 'hecho', fecha: vuelta, trabajo, costo, repuestos, compraRef, resultado,
      proximoKm: baja ? '' : proximoKm, proximoFecha: baja ? '' : proximoFecha,
    }).catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : 'No se pudo registrar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(baja ? 'Arreglo cerrado: se dio de baja.' : 'Volvió: quedó operativo.')
  }

  return (
    <div data-testid="formulario-arreglo-cierre" style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }}>
      <label>
        <span style={e.rotulo}>Qué se le hizo</span>
        <input type="text" value={trabajo} maxLength={1000} onChange={(x) => setTrabajo(x.target.value)} placeholder="Cambio de bomba, rectificado…" style={e.campo} data-testid="arreglo-trabajo" />
      </label>
      <label>
        <span style={e.rotulo}>Costo (opcional)</span>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={costo} onChange={(x) => setCosto(x.target.value)} placeholder="$" style={e.campo} data-testid="arreglo-costo" />
      </label>
      <div>
        <span style={e.rotulo}>Cómo quedó</span>
        <SegmentedControl
          options={[{ value: 'operativo', label: 'Operativo' }, { value: 'baja', label: 'Se da de baja' }]}
          value={resultado} onChange={setResultado} size="control" ariaLabel="Cómo quedó" testid="arreglo-resultado"
        />
        {baja && <div style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.neg, marginTop: 6 }}>La baja no se deshace: sale del inventario y queda en su historial.</div>}
      </div>
      <Mas tel={tel}>
        <div style={e.grilla}>
          <label>
            <span style={e.rotulo}>Volvió el</span>
            <input type="date" value={vuelta} min={abierto.ingreso_taller ?? undefined} max={hoy} onChange={(x) => setVuelta(x.target.value)} style={e.campo} data-testid="arreglo-vuelta" />
          </label>
          <label>
            <span style={e.rotulo}>Repuestos</span>
            <input type="text" value={repuestos} maxLength={500} onChange={(x) => setRepuestos(x.target.value)} placeholder="Filtro, correa…" style={e.campo} data-testid="arreglo-repuestos" />
          </label>
          <label>
            <span style={e.rotulo}>Comprobante en Compras (N°)</span>
            <input type="text" value={compraRef} maxLength={80} onChange={(x) => setCompraRef(x.target.value)} style={e.campo} data-testid="arreglo-compra" />
          </label>
          {!baja && clase !== 'herramienta' && (
            <label>
              <span style={e.rotulo}>Próximo service (fecha)</span>
              <input type="date" value={proximoFecha} min={vuelta} onChange={(x) => setProximoFecha(x.target.value)} style={e.campo} data-testid="arreglo-proximo-fecha" />
            </label>
          )}
          {!baja && clase === 'rodado' && (
            <label>
              <span style={e.rotulo}>Próximo service (km)</span>
              <input type="number" inputMode="decimal" min={0} value={proximoKm} onChange={(x) => setProximoKm(x.target.value)} placeholder="km" style={e.campo} data-testid="arreglo-proximo-km" />
            </label>
          )}
        </div>
      </Mas>
      <Pie tel={tel} enviando={enviando} etiqueta={baja ? 'Cerrar y dar de baja' : 'Ya volvió'} onEnviar={enviar} onCancelar={onCancelar} error={error} />
    </div>
  )
}
