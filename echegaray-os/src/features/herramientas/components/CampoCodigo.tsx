'use client'

// EL CÓDIGO, GUIADO — tres letras que salen del nombre, el número lo pone la base.
//
// Dueño, 22/09: «se pueda editar pero q te vaya guiando en esto no este abierto a poner cualquier
// cosa». Por eso acá no hay un campo de texto libre: se editan sólo las tres letras, el campo no deja
// escribir otra cosa (`limpiarPrefijo`), y debajo se ve cómo va a quedar el código y cuántos activos
// ya usan ese prefijo. Mientras nadie toca las letras, siguen al nombre; en cuanto alguien las cambia,
// quedan fijas y aparece «volver a <sugerido>».
//
// La vista previa es una lectura (`sugerir_codigo_activo`): no reserva el número. El alta o el cambio
// lo vuelven a calcular en la base bajo candado, así que dos personas a la vez nunca chocan.

import { useEffect, useState } from 'react'
import { limpiarPrefijo, prefijoDeNombre, problemaDelPrefijo } from '../logica/codigo'
import { sugerirCodigoAction, type SugerenciaCodigo } from '../services/acciones'
import { campo, eyebrow, MONO, V } from './estilo'

export function CampoCodigo({
  nombre, prefijo, onPrefijo, actual, alto = 38,
}: {
  nombre: string
  prefijo: string
  onPrefijo: (p: string, aMano: boolean) => void
  /** Al editar un activo: su código de hoy (con ese mismo prefijo no cambia nada). */
  actual?: string
  alto?: number
}) {
  const sugerido = prefijoDeNombre(nombre)
  const problema = problemaDelPrefijo(prefijo)
  const mismo = !!actual && actual.startsWith(`${prefijo}-`)
  // La respuesta se guarda con la pregunta que la produjo: si el nombre o las letras cambiaron desde
  // entonces, es vieja y no se muestra (se ve «calculando» hasta que llegue la nueva).
  const clave = `${prefijo}|${nombre}`
  const [respuesta, setRespuesta] = useState<{ clave: string; dato: SugerenciaCodigo | null } | null>(null)
  const vista = respuesta?.clave === clave ? respuesta.dato : null
  const cargando = !problema && !mismo && respuesta?.clave !== clave

  useEffect(() => {
    if (problema || mismo) return
    let vigente = true
    const t = setTimeout(async () => {
      const r = await sugerirCodigoAction(nombre, prefijo)
      if (vigente) setRespuesta({ clave, dato: r.ok ? r.dato : null })
    }, 250)
    return () => { vigente = false; clearTimeout(t) }
  }, [clave, nombre, prefijo, problema, mismo])

  let pie: React.ReactNode
  if (problema) pie = <span style={{ color: V.warn }}>{problema}</span>
  else if (mismo) pie = <>Sigue siendo <b style={{ fontFamily: MONO }}>{actual}</b>.</>
  else if (cargando || !vista) pie = 'Calculando el número…'
  else if (!vista.valido) pie = <span style={{ color: V.warn }}>{vista.motivo}</span>
  else pie = (
    <>
      Va a quedar <b style={{ fontFamily: MONO, color: V.tinta }} data-testid="codigo-vista">{vista.codigo}</b>
      {vista.usados_con_ese_prefijo > 0 ? ` · ya hay ${vista.usados_con_ese_prefijo} con ${vista.prefijo}` : ' · primero con ese prefijo'}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={eyebrow}>Código</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          aria-label="Tres letras del código" data-testid="codigo-prefijo"
          value={prefijo} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={(e) => onPrefijo(limpiarPrefijo(e.target.value), true)}
          style={{ ...campo, height: alto, width: 84, fontFamily: MONO, fontSize: '15px', letterSpacing: '.12em', textAlign: 'center', borderColor: problema ? V.warn : V.grafito }}
        />
        <span style={{ fontFamily: MONO, fontSize: '15px', color: V.apagado }}>-</span>
        <span style={{ fontFamily: MONO, fontSize: '15px', color: V.apagado }} aria-hidden>
          {mismo ? actual!.slice(4) : vista?.valido ? vista.codigo.slice(4) : '###'}
        </span>
        {prefijo !== sugerido && (
          <button type="button" onClick={() => onPrefijo(sugerido, false)} style={{ marginLeft: 'auto', fontSize: '12.5px', color: V.apagado, textDecoration: 'underline' }}>
            volver a {sugerido}
          </button>
        )}
      </div>
      <span style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.45 }}>{pie}</span>
      <span style={{ fontSize: '12px', color: V.tenue, lineHeight: 1.45 }}>
        Tres letras, sin acentos ni números: salen solas del nombre y se pueden cambiar. El número lo pone el sistema.
      </span>
    </div>
  )
}
