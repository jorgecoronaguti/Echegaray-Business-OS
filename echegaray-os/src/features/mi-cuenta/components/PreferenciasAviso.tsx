'use client'

// LOS INTERRUPTORES DE AVISO — uno por tipo, para el canal que hoy existe (mensaje directo del bot).
//
// Cada interruptor escribe en la base al tocarlo y se queda como la base contestó: si falla, vuelve
// a como estaba y dice por qué. No hay «Guardar»: el estado es una fila y el hecho es el clic.
//
// El correo no tiene interruptor porque el OS no manda correos de aviso: dibujar uno que no hace nada
// es exactamente lo que la pantalla decía que no iba a hacer.

import { useState, useTransition } from 'react'
import { estaActivo, type CanalAviso, type DefTipo, type Preferencia, type TipoAviso } from '../services/notificaciones'
import { guardarPreferencia } from '../services/notificacionesActions'

const CANAL: CanalAviso = 'mattermost_dm'

export function PreferenciasAviso({ tipos, iniciales }: { tipos: readonly DefTipo[]; iniciales: Preferencia[] }) {
  const [prefs, setPrefs] = useState<Preferencia[]>(iniciales)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const cambiar = (tipo: TipoAviso, activo: boolean) => {
    const antes = prefs
    setError(null)
    setPrefs([...prefs.filter((p) => !(p.tipo === tipo && p.canal === CANAL)), { tipo, canal: CANAL, activo }])
    empezar(async () => {
      const r = await guardarPreferencia(tipo, CANAL, activo)
      if (!r.ok) { setPrefs(antes); setError(r.error) }
    })
  }

  return (
    <div data-testid="preferencias-aviso">
      <div className="border-t border-line">
        {tipos.map((t) => {
          const activo = estaActivo(prefs, t.clave, CANAL)
          return (
            <div key={t.clave} className="flex items-start gap-4 border-b border-surface-sunken py-2.5" data-testid={`aviso-${t.clave}`}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">{t.titulo}</div>
                <div className="text-[11.5px] text-muted">{t.detalle}</div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-muted">
                <span className="hidden sm:inline">{activo ? 'Avisar' : 'No avisar'}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={activo}
                  checked={activo}
                  disabled={pendiente}
                  onChange={(e) => cambiar(t.clave, e.target.checked)}
                  data-testid={`interruptor-${t.clave}`}
                  className="peer sr-only"
                />
                <span aria-hidden className="relative inline-block h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-marca after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-neg" data-testid="error-preferencias">{error}</p>}
    </div>
  )
}
