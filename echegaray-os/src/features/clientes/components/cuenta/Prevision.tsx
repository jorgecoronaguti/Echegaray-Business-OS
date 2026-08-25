// «PREVISIÓN DE COBRO · 8 SEMANAS» (`28:335`–`28:390`).
//
//   franja  `height:82px`, columnas `flex:1` alineadas abajo, `gap:12px`
//   barra   `maxWidth:50px`, fondo claro + `borderTop:2px` del color del estado, radio `2px 2px 0 0`
//   vacía   `height:3px` en `#F2F1ED` con el rótulo «—» en `#C9C7C1`
//   eje     filo `#EFEEEA` arriba, rótulos 10,5px `#6B6B67` centrados
//
// LA ESCALA ES RELATIVA A LA SEMANA MÁS ALTA: 62px para la mayor, que es lo que mide la barra de
// $ 6,20 M del mockup, y con esa regla las otras cuatro dan 58, 31, 16 y 10 — los mismos píxeles
// que el `.dc.html`. Una escala absoluta («10px por millón») se sale de la franja el día que un
// certificado sea grande, y esta pantalla es de un cliente cualquiera, no del ejemplo.

import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque } from '../canon/Piezas'
import { pintarEstado } from './estados'
import { diaMes, enMillones, montoM } from '../../services/cobranzaFormato'
import { previsionSemanal } from '../../services/reglasCobranza'
import type { CertificadoCliente } from '../../types/cobranzas'

const ALTO_MAXIMO = 62
const ALTO_MINIMO = 10

export function Prevision({ documentos, hoy }: { documentos: CertificadoCliente[]; hoy: string }) {
  const { semanas, vencidoSinFecha } = previsionSemanal(documentos, hoy)
  const mayor = Math.max(...semanas.map((s) => s.monto), 0)
  return (
    <div data-testid="prevision">
      <TituloBloque
        icono={<Ico d={P.calendario} s={15} />}
        titulo="Previsión de cobro"
        derecha={<span style={{ fontSize: '11.5px', color: C.tenue }}>8 semanas</span>}
      />

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '14px', height: '82px',
      }}>
        {semanas.map((s) => {
          // El color lo pone el documento más grande de la semana: es el que manda en la altura y
          // el que va a decidir si esa semana entra plata o hay que ir a buscarla.
          const principal = [...s.documentos].sort((a, b) => b.monto - a.monto)[0]
          const pinta = principal ? pintarEstado(principal.estado) : null
          const alto = mayor > 0 && s.monto > 0
            ? Math.max(ALTO_MINIMO, Math.round((s.monto / mayor) * ALTO_MAXIMO))
            : 3
          return (
            <div key={s.desde} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              justifyContent: 'flex-end', height: '100%',
            }}>
              {s.monto > 0
                ? <span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tintaMedia }}>{enMillones(s.monto)}</span>
                : <span style={{ fontSize: '10.5px', color: C.fantasma }}>—</span>}
              <div
                title={s.monto > 0
                  ? s.documentos.map((d) => `${d.numero} · ${montoM(d.monto)}`).join('\n')
                  : 'Sin vencimientos'}
                style={{
                  width: '100%', maxWidth: '50px', height: `${alto}px`, borderRadius: '2px 2px 0 0',
                  background: s.monto > 0 ? (pinta?.color === C.curso ? C.cursoFondo : C.tenueFondo) : '#F2F1ED',
                  borderTop: s.monto > 0 ? `2px solid ${pinta?.color ?? C.tenue}` : undefined,
                }}
              />
            </div>
          )
        })}
      </div>

      <div style={{
        display: 'flex', gap: '12px', marginTop: '7px', borderTop: `1px solid ${C.bordeFila}`,
        paddingTop: '7px',
      }}>
        {semanas.map((s) => (
          <div key={s.desde} style={{ flex: 1, textAlign: 'center', fontSize: '10.5px', color: C.tintaSuave }}>
            {diaMes(s.desde)}
          </div>
        ))}
      </div>

      {vencidoSinFecha > 0 && (
        // LO VENCIDO NO ENTRA AL GRÁFICO y hay que decirlo acá, pegado a él: si no, ocho semanas
        // casi vacías se leen como «este cliente no debe nada» sobre una mora de millones.
        <div
          data-testid="prevision-vencido"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '11px', fontSize: '11.5px', color: C.neg }}
        >
          <Ico d={P.alerta} s={14} w={2} />
          {montoM(vencidoSinFecha)} ya vencido, sin fecha nueva pactada: no se dibuja en ninguna semana.
        </div>
      )}
    </div>
  )
}
