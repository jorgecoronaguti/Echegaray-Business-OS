'use client'

// CARGAR UNA REVISIÓN — RTO, service, seguro o inspección de un rodado o máquina (dueño, 23/09).
//
// Una sola pieza para las dos caras: en escritorio va dentro de la ficha de revisión (Mantenimiento);
// en el teléfono, en `/campo/herramientas/a/<código>/revision` con campos de 48px y teclado numérico.
// Los campos son los que trae el certificado de RTO en Argentina (fecha, vigencia, número de oblea =
// número de certificado, planta, resultado apto/condicional/rechazado, km) y los de un service de
// máquina (horómetro, taller, costo). Lo que no se carga queda vacío: vacío no es cero.

import { useRef, useState } from 'react'
import { registrarRevisionAction, type EntradaRevision } from '../services/acciones-revision'
import { subirFotoDeActivo } from '../services/subida-foto'
import {
  CON_RESULTADO, NOMBRE_RESULTADO, NOMBRE_REVISION, TIPOS_POR_CLASE, UNIDAD_LECTURA, type ClaseRevisable, type ResultadoRevision, type TipoRevision,
} from '../logica/revision'
import { V, campo, eyebrow } from './estilo'

const ZONA = 'America/Argentina/San_Juan'
/** Hoy en San Juan como yyyy-mm-dd: el servidor corre en UTC y a las 22 h ya sería mañana. */
const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })

export function FormularioRevision({ activo, clase, variante = 'escritorio', tipoInicial, onHecho, onCancelar }: {
  activo: string
  clase: ClaseRevisable
  variante?: 'escritorio' | 'telefono'
  tipoInicial?: TipoRevision
  onHecho: (texto: string) => void
  onCancelar?: () => void
}) {
  const tel = variante === 'telefono'
  const tipos = TIPOS_POR_CLASE[clase]
  const [tipo, setTipo] = useState<TipoRevision>(tipoInicial ?? tipos[0])
  const [fecha, setFecha] = useState(hoyIso())
  const [vencimiento, setVencimiento] = useState('')
  const [lectura, setLectura] = useState('')
  const [resultado, setResultado] = useState<ResultadoRevision | ''>('')
  const [lugar, setLugar] = useState('')
  const [numero, setNumero] = useState('')
  const [costo, setCosto] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const conResultado = CON_RESULTADO.includes(tipo)
  const unidad = UNIDAD_LECTURA[clase]

  const alto = tel ? 48 : 34
  const fuente = tel ? '16px' : '13.5px'
  const estiloCampo = { ...campo, height: alto, fontSize: fuente }
  const rotulo = { ...eyebrow, marginBottom: tel ? 6 : 4, display: 'block' as const }

  async function enviar() {
    setEnviando(true)
    setError(null)
    let adjunto: string | undefined
    if (foto) {
      const s = await subirFotoDeActivo(foto, `revisiones/${activo}`)
      if (!s.ok) { setEnviando(false); return setError(s.error) }
      adjunto = s.ruta
    }
    const entrada: EntradaRevision = {
      activo, tipo, fecha, vencimiento, lectura, resultado: conResultado ? resultado : '', lugar, numero, costo, observaciones, adjunto,
    }
    const r = await registrarRevisionAction(entrada).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'No se pudo registrar' }))
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho(`${NOMBRE_REVISION[tipo]} registrada${vencimiento ? `, vence el ${vencimiento.slice(8, 10)}/${vencimiento.slice(5, 7)}/${vencimiento.slice(0, 4)}` : ''}.`)
  }

  return (
    <div data-testid="formulario-revision" style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }}>
      <div>
        <span style={rotulo}>Qué revisión</span>
        <div role="radiogroup" style={{ display: 'flex', gap: tel ? 8 : 6, flexWrap: 'wrap' }}>
          {tipos.map((t) => (
            <label key={t} style={{
              minHeight: alto, padding: tel ? '0 16px' : '0 12px', display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${tipo === t ? V.grafito : V.lineaFuerte}`, fontSize: tel ? '15px' : '13px', fontWeight: tipo === t ? 600 : 400, color: V.tinta,
            }}>
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => { setTipo(t); setResultado('') }} style={{ accentColor: V.grafito }} data-testid={`revision-tipo-${t}`} />
              {NOMBRE_REVISION[t]}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: tel ? '1fr' : '1fr 1fr', gap: tel ? 14 : 12 }}>
        <label>
          <span style={rotulo}>Fecha de la revisión</span>
          <input type="date" value={fecha} max={hoyIso()} onChange={(e) => setFecha(e.target.value)} style={estiloCampo} data-testid="revision-fecha" required />
        </label>
        <label>
          <span style={rotulo}>{tipo === 'service' ? 'Próximo service (fecha)' : 'Vence'}</span>
          <input type="date" value={vencimiento} min={fecha} onChange={(e) => setVencimiento(e.target.value)} style={estiloCampo} data-testid="revision-vencimiento" />
        </label>
        <label>
          <span style={rotulo}>{unidad === 'km' ? 'Kilometraje' : 'Horómetro (horas)'}</span>
          <input type="number" inputMode="decimal" min={0} step="0.1" value={lectura} onChange={(e) => setLectura(e.target.value)} placeholder={unidad === 'km' ? 'km' : 'h'} style={estiloCampo} data-testid="revision-lectura" />
        </label>
        <label>
          <span style={rotulo}>{tipo === 'rto' ? 'N° de certificado / oblea' : tipo === 'seguro' ? 'N° de póliza' : 'N° de orden o remito'}</span>
          <input type="text" value={numero} maxLength={80} onChange={(e) => setNumero(e.target.value)} style={estiloCampo} data-testid="revision-numero" />
        </label>
        <label style={{ gridColumn: tel ? undefined : '1 / -1' }}>
          <span style={rotulo}>{tipo === 'rto' ? 'Planta de RTO' : tipo === 'seguro' ? 'Compañía' : tipo === 'service' ? 'Taller' : 'Quién inspeccionó'}</span>
          <input type="text" value={lugar} maxLength={160} onChange={(e) => setLugar(e.target.value)} style={estiloCampo} data-testid="revision-lugar" />
        </label>
        <label>
          <span style={rotulo}>Costo (opcional)</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$" style={estiloCampo} data-testid="revision-costo" />
        </label>
      </div>

      {conResultado && (
        <div>
          <span style={rotulo}>Resultado</span>
          <div role="radiogroup" style={{ display: 'flex', flexDirection: tel ? 'column' : 'row', gap: tel ? 0 : 6 }}>
            {(['apto', 'condicional', 'rechazado'] as ResultadoRevision[]).map((r, i) => (
              <label key={r} style={{
                minHeight: alto, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: tel ? '15px' : '13px',
                ...(tel ? { borderBottom: i < 2 ? `1px solid ${V.linea}` : undefined } : { padding: '0 12px', border: `1px solid ${resultado === r ? V.grafito : V.lineaFuerte}`, borderRadius: 6 }),
                color: r === 'rechazado' && resultado === r ? V.neg : V.tinta, fontWeight: resultado === r ? 600 : 400,
              }}>
                <input type="radio" name="resultado" checked={resultado === r} onChange={() => setResultado(r)} style={{ accentColor: V.grafito, width: tel ? 20 : undefined, height: tel ? 20 : undefined }} data-testid={`revision-resultado-${r}`} />
                {NOMBRE_RESULTADO[r]}
              </label>
            ))}
          </div>
          {resultado === 'condicional' && !vencimiento && (
            <div style={{ fontSize: tel ? '13px' : '12px', color: V.warn, marginTop: 6 }}>Un apto condicional lleva el plazo de la nueva verificación: cargá «Vence».</div>
          )}
        </div>
      )}

      <label>
        <span style={rotulo}>Observaciones</span>
        <textarea value={observaciones} maxLength={1000} rows={tel ? 3 : 2} onChange={(e) => setObservaciones(e.target.value)} data-testid="revision-observaciones"
          style={{ ...campo, height: 'auto', minHeight: tel ? 88 : 64, padding: tel ? 12 : 10, fontSize: fuente }} />
      </label>

      <button type="button" onClick={() => input.current?.click()} data-testid="revision-foto"
        style={{ height: alto, border: `1px dashed ${V.lineaFuerte}`, borderRadius: 6, fontSize: tel ? '14px' : '13px', color: foto ? V.pos : V.tinta }}>
        {foto ? 'Foto lista · cambiar' : 'Foto del certificado o ticket (opcional)'}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setFoto(e.target.files?.[0] ?? null); e.target.value = '' }} />

      {error && <div role="alert" style={{ fontSize: tel ? '13.5px' : '12.5px', color: V.neg, lineHeight: 1.5 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', ...(tel ? { position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: V.fondo } : {}) }}>
        <button type="button" onClick={enviar} disabled={enviando || !fecha} data-testid="guardar-revision"
          style={{ height: tel ? 52 : 38, flex: tel ? 1 : undefined, padding: '0 18px', borderRadius: 6, border: 0, background: V.marca, color: V.grafito, fontSize: tel ? '15px' : '13.5px', fontWeight: 600, cursor: 'pointer', opacity: fecha ? 1 : 0.45 }}>
          {enviando ? 'Guardando…' : 'Guardar revisión'}
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} style={{ fontSize: tel ? '14px' : '13px', color: V.apagado, padding: '0 10px' }}>Cancelar</button>}
      </div>
    </div>
  )
}
