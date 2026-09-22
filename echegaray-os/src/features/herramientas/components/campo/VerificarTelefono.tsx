'use client'

// M10 · VERIFICAR RODADO (40 s) y M13 · MÁQUINA QUE SE OPERA (30 s).
//
// Km u horas y cuatro toques Bien/Mal. La base decide (migración 20260922T1200): rechaza un km que
// baja y un «Mal» crítico deja el activo fuera de servicio. Acá sólo se avisa antes de mandar: el km
// que baja (la base lo va a rechazar) y el salto raro (se confirma y se manda igual).
//
// Desvíos del diseño, a propósito:
//   · Los ítems empiezan SIN respuesta: una verificación que ya viene en «Bien» es una que nadie hizo.
//   · Sin «habilitado · licencia E.2», «RTO vence…» ni «próximo service»: no existen en la base.
//   · Se agrega «Observación», que el diseño no dibuja y el registro sí guarda.
// El checklist es operativo de la empresa: no se dice en pantalla que cumpla ninguna norma (la base
// normativa que cita el diseño está sin verificar).

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import type { EstadoActivo } from '../../types'
import { registrarVerificacionAction } from '../../services/acciones'
import {
  ITEMS, UNIDAD, chequearLectura, completo, enMal, leerNumero, numeroAr, type ClaseVerificable, type Respuestas,
} from '../../logica/verificacion'
import { V, eyebrow } from '../estilo'
import { diaMes } from '../formato'
import { primarioTelefono } from './MarcoTelefono'

export interface PropsVerificar {
  activo: { id: string; clase: ClaseVerificable; estado: EstadoActivo; estado_desde: string }
  anterior: { valor: number; fecha: string } | null
  /** «hoy 07:40 · R. Sosa», o null si nunca se verificó. */
  ultima: string | null
  /** Sólo equipo: quiénes pueden figurar como operador (las personas que la sesión ve). */
  operadores: { id: string; nombre: string }[]
  yo: string | null
  volverA: string
}

const COPIA: Record<ClaseVerificable, { titulo: string; bajada: string; rotuloLectura: string; regla: string }> = {
  rodado: {
    titulo: 'Antes de salir',
    bajada: 'Cuatro toques. La firma el que maneja.',
    rotuloLectura: 'Kilómetros',
    regla: 'Frenos, dirección o luces en «Mal»: no sale. El resto sólo reporta.',
  },
  equipo: {
    titulo: 'Antes de arrancar',
    bajada: 'La firma el que la opera.',
    rotuloLectura: 'Horómetro',
    regla: 'Guardas, corte de emergencia o alarma en «Mal»: fuera de servicio. El resto sólo reporta.',
  },
}

export function VerificarTelefono({ activo, anterior, ultima, operadores, yo, volverA }: PropsVerificar) {
  const router = useRouter()
  const clase = activo.clase
  const unidad = UNIDAD[clase]
  const c = COPIA[clase]
  const [texto, setTexto] = useState('')
  const [resp, setResp] = useState<Respuestas>({})
  const [obs, setObs] = useState('')
  const [operador, setOperador] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<{ criticos: string[]; otros: string[] } | null>(null)

  const lectura = leerNumero(texto)
  const ilegible = texto.trim() !== '' && lectura == null
  const chequeo = chequearLectura(lectura, anterior, unidad)
  const mal = enMal(clase, resp)
  const hayMal = mal.criticos.length + mal.otros.length > 0
  const listo = completo(clase, resp) && !ilegible && chequeo.tipo !== 'baja'
  const pideConfirmar = chequeo.tipo === 'salto' && !confirmado

  async function enviar() {
    if (!listo) return
    if (pideConfirmar) return setConfirmado(true)
    setEnviando(true)
    setError(null)
    const checklist: Record<string, 'bien' | 'mal'> = {}
    for (const i of ITEMS[clase]) checklist[i.clave] = resp[i.clave] as 'bien' | 'mal'
    const r = await registrarVerificacionAction({
      activo: activo.id, lectura, checklist, observacion: obs.trim() || undefined, operador: operador || undefined,
    })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setHecho({ criticos: mal.criticos.map((i) => i.rotulo), otros: mal.otros.map((i) => i.rotulo) })
    router.refresh()
  }

  if (hecho) return <Resultado hecho={hecho} clase={clase} volverA={volverA} />

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '19px', fontWeight: 600 }}>{c.titulo}</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>{c.bajada}</div>
      </div>

      {activo.estado === 'fuera_servicio' && (
        <div style={{ fontSize: '13px', color: V.neg, lineHeight: 1.5, borderLeft: `2px solid ${V.neg}`, paddingLeft: 12 }} data-testid="aviso-fuera-servicio">
          Figura fuera de servicio desde el {diaMes(activo.estado_desde)}. Verificar no lo habilita: lo habilita el taller al marcarlo operativo.
        </div>
      )}

      {clase === 'equipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={eyebrow}>Quién la opera</div>
          <select value={operador} onChange={(e) => setOperador(e.target.value)} data-testid="operador"
            style={{ height: 52, padding: '0 14px', border: `1px solid ${V.grafito}`, borderRadius: 6, fontSize: '15px', background: '#FFFFFF', color: V.tinta }}>
            <option value="">{yo ? `Yo · ${yo}` : 'Yo'}</option>
            {operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(clase === 'equipo' ? { paddingTop: 14, borderTop: `1px solid ${V.linea}` } : {}) }}>
        <label htmlFor="lectura" style={eyebrow}>{c.rotuloLectura}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="lectura" inputMode="decimal" autoComplete="off" value={texto} data-testid="lectura"
            onChange={(e) => { setTexto(e.target.value); setConfirmado(false) }}
            placeholder={anterior ? numeroAr(anterior.valor) : unidad === 'km' ? 'km del tablero' : 'horas del horómetro'}
            style={{ height: 56, width: '100%', padding: '0 44px 0 14px', border: `1px solid ${chequeo.tipo === 'baja' || ilegible ? V.neg : V.grafito}`, borderRadius: 6, fontSize: '22px', fontWeight: 600, letterSpacing: '-.01em', color: V.tinta }}
          />
          <span style={{ position: 'absolute', right: 14, top: 0, height: 56, display: 'flex', alignItems: 'center', fontSize: '15px', color: V.apagado }}>{unidad}</span>
        </div>
        <div style={{ fontSize: '12.5px', color: V.apagado }} data-testid="ultima-lectura">
          {anterior ? `Última lectura ${numeroAr(anterior.valor)} el ${diaMes(anterior.fecha)}. Un salto raro se avisa.` : 'No hay una lectura anterior. Si no hay cómo leerlo, se deja vacío.'}
        </div>
        {ilegible && <div role="alert" style={{ fontSize: '13px', color: V.neg }}>Escribí sólo el número, por ejemplo 148.220{unidad === 'h' ? ' o 412,5' : ''}.</div>}
        {chequeo.tipo === 'baja' && (
          <div role="alert" style={{ fontSize: '13px', color: V.neg }} data-testid="lectura-baja">
            Es menos que la última lectura ({numeroAr(chequeo.anterior)} el {diaMes(chequeo.fecha)}). El {unidad === 'km' ? 'odómetro' : 'horómetro'} no vuelve atrás: revisá el número.
          </div>
        )}
        {chequeo.tipo === 'salto' && (
          <div role="alert" style={{ fontSize: '13px', color: V.warn, lineHeight: 1.5 }} data-testid="lectura-salto">
            Son {numeroAr(chequeo.diferencia)} {unidad} más que la última lectura en {chequeo.dias === 1 ? 'un día' : `${chequeo.dias} días`}. ¿Está bien el número?
            {confirmado ? ' Confirmado.' : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="checklist">
        {ITEMS[clase].map((it, i) => (
          <div key={it.clave} style={{ minHeight: clase === 'rodado' ? 64 : 62, display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < ITEMS[clase].length - 1 ? `1px solid ${V.linea}` : undefined }}>
            <div style={{ flex: 1, fontSize: '15px' }}>{it.rotulo}</div>
            <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label={it.rotulo}>
              <Opcion activa={resp[it.clave] === 'bien'} tono="bien" onClick={() => setResp({ ...resp, [it.clave]: 'bien' })} testid={`${it.clave}-bien`}>Bien</Opcion>
              <Opcion activa={resp[it.clave] === 'mal'} tono="mal" onClick={() => setResp({ ...resp, [it.clave]: 'mal' })} testid={`${it.clave}-mal`}>Mal</Opcion>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '13px', color: hayMal ? V.warn : V.apagado, lineHeight: 1.5 }} data-testid="regla">{c.regla}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="obs" style={eyebrow}>Observación · opcional</label>
        <textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={400} rows={2} data-testid="observacion"
          style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: 12, fontSize: '15px', minHeight: 64 }} />
      </div>

      {error && <div role="alert" style={{ fontSize: '13px', color: V.neg }} data-testid="error-verificacion">{error}</div>}

      <div style={{ position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" onClick={enviar} disabled={!listo || enviando} data-testid="listo"
          style={{ ...primarioTelefono, flex: '0 0 auto', width: '100%', opacity: listo ? 1 : 0.45 }}>
          {enviando ? 'Registrando…' : pideConfirmar ? 'Revisé el número' : 'Listo'}
        </button>
        <div style={{ fontSize: '12px', color: V.apagado, textAlign: 'center' }}>
          {ultima ? `Última verificación ${ultima}` : 'Nunca se verificó'}
        </div>
      </div>
    </>
  )
}

function Opcion({ activa, tono, onClick, testid, children }: {
  activa: boolean; tono: 'bien' | 'mal'; onClick: () => void; testid: string; children: ReactNode
}) {
  const estilo = !activa
    ? { border: `1px solid ${V.lineaFuerte}`, color: V.apagado, background: '#FFFFFF', fontWeight: 400 }
    : tono === 'bien'
      ? { border: `1px solid ${V.grafito}`, color: '#FFFFFF', background: V.grafito, fontWeight: 600 }
      : { border: `1px solid ${V.neg}`, color: V.neg, background: '#FFFFFF', fontWeight: 600 }
  return (
    <button type="button" role="radio" aria-checked={activa} onClick={onClick} data-testid={testid}
      style={{ width: 52, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13.5px', cursor: 'pointer', ...estilo }}>
      {children}
    </button>
  )
}

function Resultado({ hecho, clase, volverA }: { hecho: { criticos: string[]; otros: string[] }; clase: ClaseVerificable; volverA: string }) {
  const router = useRouter()
  const critico = hecho.criticos.length > 0
  const lista = (l: string[]) => l.map((x) => x.toLowerCase()).join(', ')
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="verificacion-hecha">
        <h1 style={{ fontSize: '19px', fontWeight: 600, color: critico ? V.neg : V.tinta }}>
          {critico ? (clase === 'rodado' ? 'No sale: quedó fuera de servicio' : 'Quedó fuera de servicio') : 'Verificación registrada'}
        </h1>
        <div style={{ fontSize: '14px', color: V.tintaSuave, lineHeight: 1.5 }}>
          {critico && <>Mal en {lista(hecho.criticos)}. Quedó reportado para el taller; vuelve a servicio cuando el taller lo marque operativo.</>}
          {!critico && hecho.otros.length > 0 && <>Quedó reportado: mal en {lista(hecho.otros)}. Sigue en servicio.</>}
          {!critico && hecho.otros.length === 0 && <>Todo bien. {clase === 'rodado' ? 'Buen viaje.' : 'Puede arrancar.'}</>}
        </div>
        {critico && hecho.otros.length > 0 && <div style={{ fontSize: '13px', color: V.apagado }}>También mal en {lista(hecho.otros)}.</div>}
      </div>
      <div style={{ position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex' }}>
        <button type="button" onClick={() => { router.push(volverA); router.refresh() }} style={primarioTelefono} data-testid="volver-ficha">Volver</button>
      </div>
    </>
  )
}
