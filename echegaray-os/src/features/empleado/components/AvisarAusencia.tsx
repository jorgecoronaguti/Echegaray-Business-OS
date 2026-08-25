'use client'

import { useActionState, useState } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { mono } from '@/shared/components/movil/Piezas'
import { registrarIncidencia } from '../services/acciones'

// M05 · «AVISAR UNA AUSENCIA» — la fila del mockup, y la escritura que hay detrás.
//
// ═══ QUÉ ESCRIBE, Y QUÉ NO ═══
//
// Escribe una INCIDENCIA (`asistencia_marca` con `tipo='incidencia'` y su motivo). No abre ni cierra
// el día y NO declara una falta: la falta es una novedad de liquidación y la declara una persona, en
// Administración. Lo que esta fila hace es dejar dicho, a nombre de quien lo escribe y con fecha,
// que hoy pasó algo —enfermedad, trámite, licencia— para que Administración lo vea cuando arma la
// quincena.
//
// ═══ POR QUÉ SE ABRE Y NO NAVEGA ═══
//
// El dueño fue explícito: «si quiero editar, edito ahí mismo, no me sirve que me lleve a otro lado».
// La fila se despliega con un motivo de tres renglones y su primaria, en la misma pantalla. Cerrada
// no ocupa más que el renglón que el mockup dibuja.
//
// ═══ EL BOTÓN APAGADO DICE QUÉ FALTA ═══
//
// Sin motivo escrito la base rechaza (`min(3)` del esquema). El botón se apaga con el texto
// «Contá qué pasa» en vez de «Enviar» en gris, que se lee como un sistema roto.

type Estado = { ok: boolean; mensaje: string } | null

export function AvisarAusencia({ obraId }: { obraId: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [estado, enviar, enviando] = useActionState(
    async (_prev: Estado, form: FormData): Promise<Estado> => {
      const r = await registrarIncidencia(form)
      return r.ok ? { ok: true, mensaje: r.mensaje ?? 'Anotada.' } : { ok: false, mensaje: r.error }
    },
    null,
  )

  // TRAS UN ENVÍO EXITOSO LA FILA SE CIERRA Y EL TEXTO SE VACÍA. Dejarla abierta con el motivo
  // escrito invita a un segundo toque, y una segunda incidencia idéntica del mismo día es ruido en
  // la bandeja de Administración. Estado DERIVADO en render, no en un efecto.
  const [ultimoOk, setUltimoOk] = useState<Estado>(null)
  if (estado?.ok && estado !== ultimoOk) {
    setUltimoOk(estado)
    setMotivo('')
    setAbierto(false)
  }

  const listo = motivo.trim().length >= 3

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        data-testid="avisar-ausencia"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: C.surface,
          border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: '13px 14px',
          minHeight: 52, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', color: C.warn, flexShrink: 0 }}><Icono nombre="alerta" tamano={20} /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: C.ink }}>
            Avisar una ausencia
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 1 }}>
            enfermedad, trámite, licencia
          </span>
        </span>
        <span style={{
          display: 'flex', color: C.tenue, flexShrink: 0,
          transform: abierto ? 'rotate(90deg)' : undefined,
        }}>
          <Icono nombre="siguiente" tamano={18} />
        </span>
      </button>

      {estado && (
        <p
          data-testid="resultado-ausencia"
          style={{ marginTop: 8, fontSize: 12, color: estado.ok ? C.pos : C.neg }}
        >
          {estado.mensaje}
        </p>
      )}

      {abierto && (
        <form action={enviar} style={{ marginTop: 10 }}>
          <input type="hidden" name="obra_id" value={obraId ?? ''} />
          <div style={{
            background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta, padding: 12,
          }}>
            <textarea
              name="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              data-testid="motivo-ausencia"
              placeholder="Contá corto qué pasa"
              style={{
                border: 'none', background: 'transparent', fontSize: 14, color: C.ink, width: '100%',
                padding: 0, resize: 'none', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!listo || enviando}
            data-testid="enviar-ausencia"
            style={{
              marginTop: 10, width: '100%', minHeight: 52, borderRadius: R.control,
              background: listo && !enviando ? C.marca : C.inerte,
              color: listo && !enviando ? C.ink : C.faint,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              fontSize: 16, fontWeight: 600, border: 'none', fontFamily: 'inherit',
              cursor: listo && !enviando ? 'pointer' : 'not-allowed',
            }}
          >
            <Icono nombre="enviar" tamano={20} />
            {enviando ? 'Enviando…' : listo ? 'Avisar a la oficina' : 'Contá qué pasa'}
          </button>
          <p style={{ ...mono, marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
            No cierra ni abre tu día: queda anotado para Administración.
          </p>
        </form>
      )}
    </div>
  )
}
