// «COMPORTAMIENTO DE PAGO» (`28:611`–`28:641`).
//
//   fila    `padding:9px 0`, filo `#EFEEEA`, rótulo 11,5px de ancho fijo 132px
//   canal   `height:5px; borderRadius:3px; background:#EFEEEA`
//   valor   mono 11,5px, ancho 52px a la derecha, del color de la barra
//
// «PAGA EL TOTAL» NO ESTÁ y no es un olvido de porte: ese 96 % necesita el importe COBRADO de cada
// documento y `certificado_cliente` guarda el emitido y el estado, no el pago parcial. La fila se
// dibuja igual, con la ausencia escrita: sacarla haría creer que el cliente no tiene esa conducta.

import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque } from '../canon/Piezas'
import { anchoDeAtraso, comportamientoDePago } from '../../services/reglasCobranza'
import type { CertificadoCliente } from '../../types/cobranzas'

function Fila({ rotulo, ancho, valor, color, testid }: {
  rotulo: string
  /** 0–100. Sin dato, la barra queda vacía y el valor lo dice. */
  ancho: number
  valor: string
  color: string
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0',
        borderBottom: `1px solid ${C.bordeFila}`,
      }}
    >
      <span style={{ fontSize: '11.5px', color: C.tintaSuave, width: '132px', flexShrink: 0 }}>{rotulo}</span>
      <div style={{ flex: 1, height: '5px', background: C.canal, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${ancho}%`, background: color }} />
      </div>
      <span style={{
        fontFamily: MONO, fontSize: '11.5px', color, width: '52px', textAlign: 'right', flexShrink: 0,
      }}>{valor}</span>
    </div>
  )
}

export function Comportamiento({ documentos }: { documentos: CertificadoCliente[] }) {
  const c = comportamientoDePago(documentos)
  const conclusion = c.pagaATiempoPct == null
    ? 'Sin cobros registrados todavía: no se puede afirmar cómo paga este cliente.'
    : `Paga a tiempo ${c.pagaATiempoPct} % de las veces, con ${c.atrasoPromedioDias} días de atraso promedio.`
  return (
    <div data-testid="comportamiento">
      <TituloBloque icono={<Ico d={P.barras2} s={15} />} titulo="Comportamiento de pago" conFilo />
      <Fila
        rotulo="Paga a tiempo"
        ancho={c.pagaATiempoPct ?? 0}
        valor={c.pagaATiempoPct == null ? '—' : `${c.pagaATiempoPct} %`}
        color={c.pagaATiempoPct == null ? C.tenue : c.pagaATiempoPct >= 70 ? C.pos : C.warn}
        testid="conducta-a-tiempo"
      />
      <Fila
        rotulo="Atraso promedio"
        ancho={anchoDeAtraso(c.atrasoPromedioDias)}
        valor={c.atrasoPromedioDias == null ? '—' : `${c.atrasoPromedioDias} d`}
        color={c.atrasoPromedioDias == null ? C.tenue : c.atrasoPromedioDias > 0 ? C.warn : C.pos}
        testid="conducta-atraso"
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0',
        borderBottom: `1px solid ${C.bordeFila}`,
      }}>
        <span style={{ fontSize: '11.5px', color: C.tintaSuave, width: '132px', flexShrink: 0 }}>Paga el total</span>
        <span style={{ flex: 1, fontSize: '11px', color: C.tenue }}>
          sin fuente: no se guarda el importe cobrado de cada documento
        </span>
      </div>
      <Fila
        rotulo="Observa certificados"
        ancho={c.emitidos ? Math.round((c.observados / c.emitidos) * 100) : 0}
        valor={c.emitidos ? `${c.observados} de ${c.emitidos}` : '—'}
        color={C.tintaSuave}
        testid="conducta-observa"
      />
      <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '11px', lineHeight: 1.5 }}>
        {conclusion}
      </div>
    </div>
  )
}
