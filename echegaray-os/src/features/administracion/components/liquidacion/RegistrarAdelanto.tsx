'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { registrarAdelanto } from '../../services/liquidacionAdelantoActions'

// REGISTRAR UN ADELANTO — la columna ADELANTO deja de ser papel (handoff §7, R5).
//
// ═══ LA CLASE NO SE PREGUNTA ═══
//
// El formulario pide importe, fecha, canal y nota. Que el movimiento sea «adelanto» o «ya
// transferido» lo DEDUCE `claseDelMovimiento` de la fecha y el canal (R5: «un giro hecho antes de
// armar el lote no es un adelanto»). Ofrecerlo como desplegable convertiría la conciliación del
// lote de haberes en criterio personal. El acuse dice a qué columna fue.
//
// EL AUTOR NO ES UN CAMPO: lo pone el servidor desde la sesión. Un campo editable permitiría
// firmar una entrega de plata con el nombre de otro.

export function RegistrarAdelanto({ personaId, quincena, cerrada }: {
  personaId: string
  quincena: { desde: string; hasta: string }
  cerrada: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  // LA QUINCENA CERRADA NO RECIBE ADELANTOS: se restarían de un total ya sellado y pagado.
  if (cerrada) return null

  const guardar = (form: FormData) => empezar(async () => {
    form.set('persona_id', personaId)
    form.set('desde', quincena.desde)
    form.set('hasta', quincena.hasta)
    const r = await registrarAdelanto(form)
    setAviso(r.ok ? r.mensaje : r.error)
    if (r.ok) setAbierto(false)
  })

  return (
    <div data-testid="registrar-adelanto" style={{ maxWidth: 460 }}>
      <button type="button" onClick={() => setAbierto((v) => !v)} data-testid="registrar-adelanto-boton"
        style={{
          height: 26, padding: '0 10px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6,
          background: '#FFFFFF', fontSize: '11.5px', cursor: 'pointer', color: V.tinta,
        }}>
        {abierto ? 'Cancelar' : 'Registrar un adelanto'}
      </button>
      {abierto && (
        <form action={guardar} data-testid="adelanto-form"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
          <Campo rotulo="Importe">
            <input name="importe" inputMode="decimal" required data-testid="adelanto-importe"
              style={{ ...control, width: 110, textAlign: 'right' }} />
          </Campo>
          <Campo rotulo="Fecha">
            <input name="fecha" type="date" required defaultValue={quincena.hasta}
              min={quincena.desde} data-testid="adelanto-fecha" style={control} />
          </Campo>
          <Campo rotulo="Canal">
            <select name="canal" defaultValue="efectivo" data-testid="adelanto-canal" style={control}>
              <option value="efectivo">efectivo</option>
              <option value="banco">banco</option>
            </select>
          </Campo>
          <Campo rotulo="Nota">
            <input name="nota" maxLength={300} placeholder="para qué se lo pidió"
              data-testid="adelanto-nota" style={{ ...control, width: 200 }} />
          </Campo>
          <button type="submit" disabled={guardando} data-testid="adelanto-guardar"
            style={{
              height: 30, padding: '0 14px', borderRadius: 6, border: 'none', background: V.marca,
              color: V.grafito, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </form>
      )}
      {aviso && <div data-testid="adelanto-aviso" style={{ marginTop: 8, fontSize: '11.5px', color: V.apagado }}>{aviso}</div>}
    </div>
  )
}

const control = {
  height: 26, borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF',
  padding: '0 8px', fontSize: '12.5px', color: V.tinta, fontFamily: 'inherit',
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>{rotulo}</span>
      {children}
    </label>
  )
}
