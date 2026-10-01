'use client'

// NOVEDAD DEL RODADO — una sola pantalla, en escritorio y en el teléfono (`variante`).
//
// Dos usos de la misma pieza:
//   · nuevo: «hay que llevarlo» · «ya hecho», con tipo, fecha, km, descripción, taller,
//     costo opcional, referencia de compra opcional y próximo service (km o fecha).
//   · avanzar (`abierto`): un «hay que llevarlo» que se resolvió sin mecánico pasa a «hecho».
// El paso por el mecánico (ingreso y vuelta) es de `FormularioArreglo`: lleva quién lo llevó, la vuelta estimada,
// qué se le hizo y cómo quedó, y no se carga por dos caminos.
// El taller es un proveedor del padrón si el nombre coincide; si no, texto libre. Lo que no se carga queda
// vacío: vacío no es cero.

import { useState } from 'react'
import { SegmentedControl } from '@/shared/components/ui'
import { avanzarEventoAction, registrarEventoAction } from '../services/acciones-evento'
import { NOMBRE_SITUACION, NOMBRE_TIPO_EVENTO, TIPOS_EVENTO, type Evento, type SituacionEvento, type TipoEvento } from '../logica/evento'
import type { Clase } from '../types'
import { V, botonPrimarioGrande, campo, eyebrow } from './estilo'

const ZONA = 'America/Argentina/San_Juan'
const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })

export function FormularioEvento({ activo, clase = 'rodado', proveedores, abierto, variante = 'escritorio', onHecho, onCancelar }: {
  activo: string
  clase?: Clase
  proveedores: { id: string; nombre: string }[]
  abierto?: Evento
  variante?: 'escritorio' | 'telefono'
  onHecho: (texto: string) => void
  onCancelar?: () => void
}) {
  const tel = variante === 'telefono'
  const opciones: { value: SituacionEvento; label: string }[] = abierto
    ? [{ value: 'hecho', label: 'Ya está hecho' }]
    : [{ value: 'pendiente', label: NOMBRE_SITUACION.pendiente }, { value: 'hecho', label: 'Ya está hecho' }]
  const [situacion, setSituacion] = useState<SituacionEvento>(opciones[0].value)
  const [tipo, setTipo] = useState<TipoEvento>(abierto?.tipo ?? 'reparacion')
  const [fecha, setFecha] = useState(hoyIso())
  const [descripcion, setDescripcion] = useState('')
  const [trabajo, setTrabajo] = useState('')
  const [km, setKm] = useState('')
  const [taller, setTaller] = useState('')
  const [costo, setCosto] = useState('')
  const [compraRef, setCompraRef] = useState('')
  const [proximoKm, setProximoKm] = useState('')
  const [proximoFecha, setProximoFecha] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const alto = tel ? 48 : 34
  const estiloCampo = { ...campo, height: alto, fontSize: tel ? '16px' : '13.5px' }
  const rotulo = { ...eyebrow, marginBottom: tel ? 6 : 4, display: 'block' as const }
  const pideTaller = situacion !== 'pendiente'
  const cierra = situacion === 'hecho'
  const propietario = proveedores.find((p) => p.nombre.toLowerCase() === taller.trim().toLowerCase())

  async function enviar() {
    setEnviando(true)
    setError(null)
    const comun = {
      km, proveedor: propietario?.id ?? '', taller: propietario ? '' : taller, costo: cierra ? costo : '', compraRef: cierra ? compraRef : '',
      proximoKm: cierra ? proximoKm : '', proximoFecha: cierra ? proximoFecha : '',
    }
    const r = await (abierto
      ? avanzarEventoAction({ evento: abierto.id, situacion: 'hecho', fecha, trabajo, ...comun })
      : registrarEventoAction({ activo, tipo, situacion, fecha, descripcion, ...comun })
    ).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'No se pudo registrar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(situacion === 'pendiente' ? 'Novedad cargada: hay que llevarlo.' : 'Trabajo registrado.')
  }

  return (
    <div data-testid="formulario-evento" style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }}>
      <div>
        <span style={rotulo}>{abierto ? `Ya se resolvió · ${abierto.descripcion}` : 'En qué está'}</span>
        <SegmentedControl options={opciones} value={situacion} onChange={setSituacion} size="control" ariaLabel="Situación del rodado" testid="evento-situacion" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: tel ? '1fr' : '1fr 1fr', gap: tel ? 14 : 12 }}>
        {!abierto && (
          <label>
            <span style={rotulo}>Qué trabajo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)} style={estiloCampo} data-testid="evento-tipo">
              {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{NOMBRE_TIPO_EVENTO[t]}</option>)}
            </select>
          </label>
        )}
        {(!abierto || cierra) && (
          <label>
            <span style={rotulo}>{cierra ? 'Fecha del trabajo' : 'Fecha'}</span>
            <input type="date" value={fecha} max={hoyIso()} onChange={(e) => setFecha(e.target.value)} style={estiloCampo} data-testid="evento-fecha" />
          </label>
        )}
        {abierto && cierra && (
          <label style={{ gridColumn: tel ? undefined : '1 / -1' }}>
            <span style={rotulo}>Qué se le hizo</span>
            <input type="text" value={trabajo} maxLength={1000} onChange={(e) => setTrabajo(e.target.value)} style={estiloCampo} data-testid="evento-trabajo" />
          </label>
        )}
        {!abierto && (
          <label style={{ gridColumn: tel ? undefined : '1 / -1' }}>
            <span style={rotulo}>{cierra ? 'Qué se le hizo' : 'Qué pasa'}</span>
            <input type="text" value={descripcion} maxLength={1000} onChange={(e) => setDescripcion(e.target.value)} placeholder="Pierde aceite, hace ruido al frenar…" style={estiloCampo} data-testid="evento-descripcion" />
          </label>
        )}
        {clase === 'rodado' && <label>
          <span style={rotulo}>Kilometraje</span>
          <input type="number" inputMode="decimal" min={0} step="0.1" value={km} onChange={(e) => setKm(e.target.value)} placeholder="km" style={estiloCampo} data-testid="evento-km" />
        </label>}
        {pideTaller && (
          <label>
            <span style={rotulo}>Taller o mecánico</span>
            <input type="text" list="proveedores-taller" value={taller} maxLength={160} onChange={(e) => setTaller(e.target.value)} placeholder="Proveedor o nombre" style={estiloCampo} data-testid="evento-taller" />
            <datalist id="proveedores-taller">{proveedores.slice(0, 200).map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
          </label>
        )}
        {cierra && (
          <>
            <label>
              <span style={rotulo}>Costo (opcional)</span>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$" style={estiloCampo} data-testid="evento-costo" />
            </label>
            <label>
              <span style={rotulo}>Factura o compra (opcional)</span>
              <input type="text" value={compraRef} maxLength={80} onChange={(e) => setCompraRef(e.target.value)} style={estiloCampo} data-testid="evento-compra" />
            </label>
            {clase === 'rodado' && <label>
              <span style={rotulo}>Próximo service (km)</span>
              <input type="number" inputMode="decimal" min={0} value={proximoKm} onChange={(e) => setProximoKm(e.target.value)} placeholder="km" style={estiloCampo} data-testid="evento-proximo-km" />
            </label>}
            <label>
              <span style={rotulo}>Próximo service (fecha)</span>
              <input type="date" value={proximoFecha} min={fecha} onChange={(e) => setProximoFecha(e.target.value)} style={estiloCampo} data-testid="evento-proximo-fecha" />
            </label>
          </>
        )}
      </div>

      {error && <div role="alert" style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.neg, lineHeight: 1.5 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={enviar} disabled={enviando} data-testid="guardar-evento"
          style={{ ...botonPrimarioGrande, height: tel ? 52 : 38, flex: tel ? 1 : undefined, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Guardando…' : abierto ? 'Guardar' : 'Cargar novedad'}
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} style={{ fontSize: tel ? '14px' : '13px', color: V.apagado, padding: '0 10px' }}>Cancelar</button>}
      </div>
    </div>
  )
}
