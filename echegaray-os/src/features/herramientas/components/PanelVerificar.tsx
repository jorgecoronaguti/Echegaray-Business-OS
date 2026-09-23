'use client'

// VERIFICAR UN RODADO O UNA MÁQUINA DESDE LA COMPUTADORA — el mismo M10/M13 del teléfono, en el
// panel al costado. La ficha de escritorio sólo enlazaba a «la pantalla de teléfono»; lo que se hace en
// obra tiene que poder hacerse desde la oficina (paridad funcional, dueño 23/09). Una sola
// implementación (`VerificarTelefono`): el km que baja, el salto raro y el «Mal» crítico se juzgan igual.
//
// Los datos previos (última lectura, última verificación) salen del mismo parque que mira la ficha; los
// operadores de una máquina se piden al abrir el panel, no al abrir la pantalla.

import { useEffect, useState } from 'react'
import { operadorDe } from '../logica/historial'
import { seVerifica, textoVerificacion, ultimaLectura, ultimaVerificacion, verificacionDe } from '../logica/verificacion'
import { leerOperadoresAction } from '../services/acciones'
import { VerificarTelefono } from './campo/VerificarTelefono'
import { useHerramientas } from './Espacio'
import { PanelLateral } from './PanelLateral'
import { V } from './estilo'

export function PanelVerificar({ id, onHecho }: { id: string; onHecho: (t: string) => void }) {
  const { parque, yo, cerrar } = useHerramientas()
  const a = parque.activoPorId.get(id)
  const esEquipo = a?.clase === 'equipo'
  const [operadores, setOperadores] = useState<{ id: string; nombre: string }[] | null>(esEquipo ? null : [])
  useEffect(() => {
    if (!esEquipo) return
    let vivo = true
    leerOperadoresAction().then((ops) => { if (vivo) setOperadores(ops) }).catch(() => { if (vivo) setOperadores([]) })
    return () => { vivo = false }
  }, [esEquipo])
  if (!a) return null
  const titulo = a.patente && !a.nombre.includes(a.patente) ? `${a.nombre} ${a.patente}` : a.nombre

  const aviso = (texto: string) => (
    <PanelLateral testid="panel-verificar" titulo={titulo} subtitulo={a.codigo} onCerrar={cerrar}>
      <div style={{ fontSize: '13.5px', lineHeight: 1.5 }} data-testid="no-se-verifica">{texto}</div>
    </PanelLateral>
  )
  if (a.estado === 'baja') return aviso(`${a.nombre} está dado de baja: no se verifica.`)
  if (!seVerifica(a)) return aviso('La verificación de uso es para rodados y equipos que se operan con gente, no para herramientas.')
  if (!parque.lecturas) return aviso('Falta aplicar la migración 20260922T1200 de la verificación de uso: todavía no se puede registrar.')

  const ult = ultimaVerificacion(parque, a.id)
  const quien = ult ? operadorDe(parque, ult) : null
  return (
    <PanelLateral testid="panel-verificar" titulo={titulo} subtitulo={a.codigo} onCerrar={cerrar}>
      {operadores === null ? (
        <div style={{ fontSize: '12.5px', color: V.apagado }}>Buscando quiénes pueden operarla…</div>
      ) : (
        <VerificarTelefono
          activo={{ id: a.id, clase: a.clase, estado: a.estado, estado_desde: a.estado_desde }}
          anterior={ultimaLectura(parque, a.id)}
          ultima={ult ? `${textoVerificacion(verificacionDe(parque, a.id))}${quien ? ` · ${quien}` : ''}` : null}
          operadores={operadores}
          yo={yo.nombre}
          volverA={`/herramientas/inventario?activo=${encodeURIComponent(a.codigo)}`}
          onVolver={() => onHecho(`${a.nombre}: verificación registrada.`)}
        />
      )}
    </PanelLateral>
  )
}
