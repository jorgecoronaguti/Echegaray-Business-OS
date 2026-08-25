'use client'

import { useState, useTransition } from 'react'
import { diaMes } from '@/shared/components/canon'
import type { ConsultaPortal } from '../types'
import { P } from '../estilos'
import { TituloBloque, VacioPortal } from './piezas'
import { IcoConsulta, IcoMas, IcoOk, IcoReloj } from './iconos'
import { crearConsulta } from '../services/portalActions'

// «CONSULTAS» — `29`, líneas 631–669. La lista con su estado y el «+» que abre una nueva.
//
// ═══ EL ALTA SE ABRE ACÁ MISMO ═══
//
// El «+» del mockup despliega el formulario ARRIBA de la lista, en la misma columna. No navega: una
// consulta se escribe mirando la obra y los certificados que la motivaron.
//
// ═══ QUÉ DICE EL ICONO ═══
//
// Reloj ámbar = abierta, esperando respuesta nuestra. Tilde verde = respondida. La respuesta se
// muestra debajo del título, con la sangría de 22px del mockup: es el dato que el cliente vino a
// buscar, no un detalle.

export function Consultas({ consultas, obraId }: {
  consultas: ConsultaPortal[]
  obraId: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, iniciar] = useTransition()

  function enviar() {
    setAviso(null)
    iniciar(async () => {
      const r = await crearConsulta({ titulo, cuerpo, obra_id: obraId })
      if (r.ok) {
        setAviso({ ok: true, texto: r.mensaje ?? 'Recibimos su consulta. Le respondemos por acá.' })
        setTitulo(''); setCuerpo(''); setAbierto(false)
      } else {
        setAviso({ ok: false, texto: r.error })
      }
    })
  }

  return (
    <div>
      <TituloBloque
        icono={<IcoConsulta />}
        titulo="Consultas"
        accion={(
          <button
            type="button"
            title="Nueva consulta"
            onClick={() => { setAbierto((v) => !v); setAviso(null) }}
            style={{
              width: 26, height: 26, borderRadius: 6, border: `1px solid ${P.linea}`,
              background: P.superficie, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: P.apagado, cursor: 'pointer',
            }}
          >
            <IcoMas />
          </button>
        )}
      />

      {abierto && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!enviando) enviar() }}
          style={{ padding: '12px 0', borderBottom: `1px solid ${P.lineaBloque}` }}
        >
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="¿Sobre qué es?"
            required
            maxLength={160}
            style={{
              width: '100%', border: `1px solid ${P.lineaFuerte}`, borderRadius: 6,
              padding: '8px 10px', fontFamily: 'inherit', fontSize: '12.5px', color: P.tinta,
            }}
          />
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            rows={3}
            placeholder="Contanos un poco más"
            required
            style={{
              width: '100%', marginTop: 6, border: `1px solid ${P.lineaFuerte}`, borderRadius: 6,
              padding: '8px 10px', fontFamily: 'inherit', fontSize: '12.5px', color: P.tinta,
              resize: 'vertical',
            }}
          />
          <button
            type="submit"
            disabled={enviando}
            style={{
              marginTop: 6, background: P.marca, color: P.tinta, fontSize: '12px', fontWeight: 600,
              borderRadius: 6, padding: '8px 12px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {enviando ? 'Enviando…' : 'Enviar la consulta'}
          </button>
        </form>
      )}

      {aviso && (
        <p role="status" style={{
          fontSize: '11.5px', lineHeight: 1.5, color: aviso.ok ? P.pos : P.neg, padding: '10px 0 0',
          margin: 0,
        }}>
          {aviso.texto}
        </p>
      )}

      {consultas.length === 0 && !abierto ? (
        <VacioPortal texto="No hay consultas abiertas. El «+» abre una." />
      ) : (
        consultas.map((c, i) => {
          const abiertaAun = c.estado === 'abierta'
          return (
            <div key={c.id} style={{
              padding: '12px 0',
              borderBottom: i === consultas.length - 1 ? undefined : `1px solid ${P.lineaBloque}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', color: abiertaAun ? P.warn : P.pos, flexShrink: 0 }}>
                  {abiertaAun ? <IcoReloj /> : <IcoOk />}
                </span>
                <span style={{
                  fontSize: '12px', fontWeight: abiertaAun ? 500 : 400,
                  color: abiertaAun ? P.tinta : P.tintaSuave, minWidth: 0,
                }}>
                  {c.titulo}
                </span>
                <span style={{
                  marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontSize: '10.5px',
                  color: P.tenue, flexShrink: 0,
                }}>
                  {diaMes(c.at)}
                </span>
              </div>
              {c.respuesta && (
                <div style={{
                  fontSize: '11.5px', color: P.apagado, marginTop: 4, lineHeight: 1.45,
                  paddingLeft: 22,
                }}>
                  {c.respuesta}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
