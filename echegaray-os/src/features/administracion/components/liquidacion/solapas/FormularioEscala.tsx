'use client'

// EL FORMULARIO MÍNIMO PARA CARGAR UN PISO DE ESCALA. Cinco campos y nada más.
//
// Es lo que destraba la pantalla 8 para los convenios sin escala. Existe acá —y no en una migración
// con datos sembrados— porque un piso decide si la empresa le debe plata a alguien: lo carga una
// persona, con la fuente de la que salió, y queda con su fecha de vigencia.
//
// ═══ LA SUGERENCIA SE OFRECE, NO SE APLICA ═══
//
// El OS ya tiene la escala del CCT 76/75 cargada (`uocra_escala`). El botón «usar» la copia a los
// campos CON SU FUENTE, y el que la manda decide a qué rótulo de convenio corresponde. Aplicarla
// sola sería suponer que dos rótulos del legajo son el mismo convenio, que es una afirmación laboral
// que nadie firmó.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { cargarEscalaDeConvenio } from '../../../services/liquidacionConvenioActions'

export interface Sugerencia {
  categoria: string; valorHora: number; desde: string; fuente: string
}

const CAMPO: React.CSSProperties = {
  height: 26, border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '0 8px',
  fontSize: '12px', background: '#FFFFFF', color: V.tinta, width: '100%',
}

export function FormularioEscala({ convenios, categorias, sugerencia, desdePorDefecto }: {
  convenios: string[]; categorias: string[]; sugerencia: Sugerencia[]; desdePorDefecto: string
}) {
  const [convenio, setConvenio] = useState(convenios[0] ?? '')
  const [categoria, setCategoria] = useState(categorias[0] ?? '')
  const [valorHora, setValorHora] = useState('')
  const [desde, setDesde] = useState(desdePorDefecto)
  const [fuente, setFuente] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, iniciar] = useTransition()

  const usar = (s: Sugerencia) => {
    setCategoria(s.categoria)
    setValorHora(String(s.valorHora))
    setDesde(s.desde)
    setFuente(s.fuente)
    setAviso(null)
  }

  const enviar = () => iniciar(async () => {
    const r = await cargarEscalaDeConvenio({ convenio, categoria, valor_hora: valorHora, desde, fuente })
    setAviso({ ok: r.ok, texto: r.ok ? r.mensaje : r.error })
    if (r.ok) { setValorHora(''); setFuente('') }
  })

  return (
    <div data-testid="formulario-escala" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '82px 1fr', rowGap: 9, columnGap: 10,
        fontSize: '12px', alignItems: 'center',
      }}>
        <label style={{ color: V.apagado }} htmlFor="esc-convenio">Convenio</label>
        <select id="esc-convenio" style={CAMPO} value={convenio} onChange={(e) => setConvenio(e.target.value)}>
          {convenios.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={{ color: V.apagado }} htmlFor="esc-categoria">Categoría</label>
        <input id="esc-categoria" list="esc-categorias" style={CAMPO} value={categoria}
          onChange={(e) => setCategoria(e.target.value)} />
        <datalist id="esc-categorias">
          {categorias.map((c) => <option key={c} value={c} />)}
        </datalist>

        <label style={{ color: V.apagado }} htmlFor="esc-valor">Valor hora</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input id="esc-valor" inputMode="decimal" style={{ ...CAMPO, width: 100, fontVariantNumeric: 'tabular-nums' }}
            value={valorHora} onChange={(e) => setValorHora(e.target.value)} />
          <span style={{ fontSize: '11px', color: V.apagado }}>$/h</span>
        </div>

        <label style={{ color: V.apagado }} htmlFor="esc-desde">Desde</label>
        <input id="esc-desde" type="date" style={{ ...CAMPO, width: 150 }} value={desde}
          onChange={(e) => setDesde(e.target.value)} />

        <label style={{ color: V.apagado }} htmlFor="esc-fuente">Fuente</label>
        <input id="esc-fuente" style={CAMPO} value={fuente} placeholder="acuerdo, escala publicada, réplica…"
          onChange={(e) => setFuente(e.target.value)} />
      </div>

      {sugerencia.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: '11px', color: V.tenue }}>El OS ya tiene:</span>
          {sugerencia.map((s) => (
            <button key={s.categoria} type="button" onClick={() => usar(s)}
              data-testid={`sugerencia-${s.categoria}`}
              style={{
                height: 24, padding: '0 8px', border: `1px solid ${V.linea}`, borderRadius: 6,
                background: '#FFFFFF', color: V.apagado, fontSize: '11px', cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}>
              {s.categoria} {s.valorHora.toLocaleString('es-AR')}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={enviar} disabled={enviando || !convenio || !categoria}
        data-testid="guardar-escala"
        style={{
          alignSelf: 'flex-start', height: 30, padding: '0 12px', border: 0, borderRadius: 6,
          background: enviando ? V.linea : V.marca, color: V.grafito,
          fontSize: '11.5px', fontWeight: 600, cursor: enviando ? 'default' : 'pointer',
        }}>
        {enviando ? 'Cargando…' : 'Cargar el piso'}
      </button>

      {aviso && (
        <p data-testid="aviso-escala" style={{
          margin: 0, fontSize: '11.5px', color: aviso.ok ? '#067647' : V.neg,
        }}>
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
