// «COMPORTAMIENTO DE PAGO» (`28:611`–`28:641`).
//
//   fila    `padding:9px 0`, filo `#EFEEEA`, rótulo 11,5px de ancho fijo 132px
//   canal   `height:5px; borderRadius:3px; background:#EFEEEA`
//   valor   mono 11,5px, ancho 52px a la derecha, del color de la barra
//
// DOS DE LAS CUATRO FILAS SE DIBUJAN SIN BARRA, CON LA AUSENCIA ESCRITA. Se quedan en la pantalla
// porque sacarlas haría creer que el cliente no tiene esa conducta:
//
//   · «Paga el total» necesita el importe COBRADO de cada documento; `certificado_cliente` guarda
//     el emitido y el estado, no el pago parcial.
//   · «Paga a tiempo» compararía la fecha de cobro contra la de vencimiento, y en esta fuente son
//     LA MISMA CELDA: la columna Q guarda la promesa y se pisa con la fecha real al cobrarse. Se
//     publicaba un 100 % que se cumplía solo. En su lugar va lo que sí se observa: los días que
//     tarda en cobrarse un certificado desde que se emite, que la vista publica ya calculados.

import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque } from '../canon/Piezas'
import { comportamientoDePago } from '../../services/reglasCobranza'
import type { CertificadoCliente, CuentaCorriente } from '../../types/cobranzas'

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

/** Una conducta que la fuente no permite medir. Ocupa la fila, sin barra y sin número. */
function SinFuente({ rotulo, motivo }: { rotulo: string; motivo: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0',
      borderBottom: `1px solid ${C.bordeFila}`,
    }}>
      <span style={{ fontSize: '11.5px', color: C.tintaSuave, width: '132px', flexShrink: 0 }}>{rotulo}</span>
      <span style={{ flex: 1, fontSize: '11px', color: C.tenue }}>{motivo}</span>
    </div>
  )
}

export function Comportamiento({ documentos, cuenta }: {
  documentos: CertificadoCliente[]
  cuenta: CuentaCorriente | null
}) {
  const c = comportamientoDePago(documentos, cuenta)
  const dias = c.diasCobroPromedio
  const conclusion = dias == null
    ? 'Sin cobros en los últimos 90 días: no se puede afirmar cómo paga este cliente.'
    : c.cobraAntesDeFacturar
      // Un plazo de pago negativo no existe. Lo que existe es cobrar antes de facturar, y decirlo
      // así es un dato útil: ese cliente financia la obra, no al revés.
      ? `Paga antes de que se le facture: en promedio, ${Math.abs(dias)} días ANTES de la emisión del certificado.`
      : `Tarda ${dias} días en pagar un certificado desde que se emite, medido sobre lo cobrado en los últimos 90 días.`
  return (
    <div data-testid="comportamiento">
      <TituloBloque icono={<Ico d={P.barras2} s={15} />} titulo="Comportamiento de pago" conFilo />
      <SinFuente
        rotulo="Paga a tiempo"
        motivo="sin fuente: la fecha prometida se pisa con la real al cobrarse"
      />
      <Fila
        rotulo="Días en pagar"
        // 90 días llenan la barra: es la ventana sobre la que la vista mide el promedio, así que
        // es el único techo que no sale de una preferencia. Un promedio negativo NO dibuja barra:
        // no hay plazo que representar, y el renglón de abajo lo explica con todas las letras.
        ancho={dias == null || c.cobraAntesDeFacturar ? 0 : Math.min(100, Math.round((dias / 90) * 100))}
        valor={dias == null ? '—' : c.cobraAntesDeFacturar ? 'anticipa' : `${dias} d`}
        color={dias == null ? C.tenue : c.cobraAntesDeFacturar ? C.pos : dias > 60 ? C.warn : C.pos}
        testid="conducta-dias-cobro"
      />
      <SinFuente
        rotulo="Paga el total"
        motivo="sin fuente: no se guarda el importe cobrado de cada documento"
      />
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
