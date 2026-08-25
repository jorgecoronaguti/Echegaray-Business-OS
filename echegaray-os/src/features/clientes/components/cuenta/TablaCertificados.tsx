
//
// ═══ NO HAY `cobrado_at`: LA FECHA DE COBRO ES `vence` ═══
//
// La columna Q de Cobranzas —de donde sale `vence`— guarda la fecha ESPERADA mientras el cobro
// está pendiente y se PISA con la fecha REAL al cobrarse. Para un certificado `cobrado`, `vence`
// ya ES el día en que entró la plata. Un segundo campo sería la misma fecha con otro nombre.
//
// Consecuencia que se declara en vez de disimularse: el ATRASO de un certificado ya cobrado no es
// medible con esta fuente (restar la fecha contra sí misma da cero siempre, y publicaría una
// puntualidad perfecta para cualquier cliente). Se muestra «—», no un 0.
'use client'

// «CERTIFICADOS Y FACTURAS» (`28:172`–`28:332`).
//
//   grilla   `minmax(0,1.7fr) 96px 104px 78px 116px 92px`, `gap:12px`
//   filas    `minHeight:50px`, filo `#EFEEEA`, hover `background:#FFFFFF`
//   elegida  `background:#FFFFFF` + `boxShadow:inset 3px 0 0 #FDC900`, y su primera celda corre 11px
//   apagada  lo cobrado va en `#6B6B67`: sigue en la lista porque es la historia del cliente
//
// ═══ LA COLUMNA GESTIÓN DICE LO QUE PASÓ, NO LO QUE PARECE ═══
//
// El mockup dibuja ahí tres o cuatro íconos con `title` de gestión: «2 recordatorios y 1 llamada»,
// «promesa de pago para el 28/08», «aviso previo leído por J. Sosa hoy». Ese historial de contacto
// NO existe todavía como fuente en el OS —no hay tabla de recordatorios, promesas ni lecturas—, y
// dibujar los íconos igual sería inventar una gestión que nadie hizo.
//
// Se dibuja lo que SÍ es un hecho guardado: que hay factura emitida, que el cliente observó (con
// su texto en el `title`) y que se cobró. El resto de los íconos aparece el día que su fuente
// exista, no antes.

import { C, MONO, ROTULO_COL } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque, Vacio } from '../canon/Piezas'
import { CeldaEstado } from './estados'
import { diaMes, diasEntre, enMillones, montoM } from '../../services/cobranzaFormato'
import type { CertificadoCliente } from '../../types/cobranzas'

const COLS = 'minmax(0,1.7fr) 96px 104px 78px 116px 92px'

/** El segundo renglón de la columna VENCE: «en 24 d», «20 d» en rojo, «cobrado a 34 d». */
function plazo(d: CertificadoCliente, hoy: string): { texto: string; color: string } | null {
  if (d.estado === 'cobrado') {
    const tardanza = diasEntre(d.emitido_at, d.vence)
    return tardanza == null ? null : { texto: `cobrado a ${tardanza} d`, color: C.tenue }
  }
  const dias = diasEntre(d.vence, hoy)
  if (dias == null) return { texto: 'sin vencimiento', color: C.warn }
  return dias > 0
    ? { texto: `${dias} d`, color: C.neg }
    : { texto: `en ${-dias} d`, color: C.tenue }
}

function Gestion({ d }: { d: CertificadoCliente }) {
  const marcas: { titulo: string; color: string; icono: React.ReactNode }[] = []
  if (d.factura) marcas.push({ titulo: `Facturado · ${d.factura}`, color: C.tintaSuave, icono: <Ico d={P.documento} s={15} /> })
  if (d.observacion) marcas.push({ titulo: `Observado: ${d.observacion}`, color: C.warn, icono: <Ico d={P.chat} s={15} /> })
  if (d.estado === 'cobrado') marcas.push({ titulo: `Cobrado el ${diaMes(d.vence)}`, color: C.pos, icono: <Ico d={P.ok} s={15} /> })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', justifyContent: 'flex-end' }}>
      {marcas.map((m) => (
        <span key={m.titulo} title={m.titulo} style={{ display: 'flex', color: m.color }}>{m.icono}</span>
      ))}
    </div>
  )
}

export function TablaCertificados({ documentos, hoy, elegido, onElegir, filtrado }: {
  documentos: CertificadoCliente[]
  hoy: string
  elegido: string | null
  onElegir: (id: string) => void
  /** `true` cuando la lista viene recortada por la banda de antigüedad. */
  filtrado: boolean
}) {
  const facturado = documentos.reduce((s, d) => s + d.monto, 0)
  return (
    <div data-testid="certificados">
      <TituloBloque
        icono={<Ico d={P.documento} s={15} />}
        titulo="Certificados y facturas"
        derecha={
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>
            {documentos.length} {documentos.length === 1 ? 'documento' : 'documentos'}
            {documentos.length > 0 && ` · ${montoM(facturado)} facturado`}
          </span>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'end', height: '30px',
        borderBottom: `1px solid ${C.borde}`,
      }}>
        <span style={ROTULO_COL}>DOCUMENTO</span>
        <span style={ROTULO_COL}>VENCE</span>
        <span style={{ ...ROTULO_COL, textAlign: 'right' }}>MONTO</span>
        <span style={{ ...ROTULO_COL, textAlign: 'right' }}>REPARO</span>
        <span style={ROTULO_COL}>ESTADO</span>
        <span style={{ ...ROTULO_COL, textAlign: 'right' }}>GESTIÓN</span>
      </div>

      {documentos.map((d) => {
        const sel = elegido === d.id
        const apagado = d.estado === 'cobrado'
        const pl = plazo(d, hoy)
        return (
          <div
            key={d.id} role="button" tabIndex={0} onClick={() => onElegir(d.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(d.id) } }}
            data-testid={`fila-doc-${d.id}`} aria-current={sel ? 'true' : undefined}
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'center',
              minHeight: '50px', borderBottom: `1px solid ${C.bordeFila}`, cursor: 'pointer',
              background: sel ? C.superficie : undefined,
              boxShadow: sel ? `inset 3px 0 0 ${C.marca}` : undefined,
            }}
          >
            <div style={{ minWidth: 0, paddingLeft: sel ? '11px' : undefined }}>
              <div style={{
                fontSize: '12.5px', fontWeight: sel ? 500 : 400,
                color: apagado ? C.tintaSuave : C.tinta,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {d.numero}{d.factura ? ` · ${d.factura}` : ''}
              </div>
              <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>
                {d.obra_nombre ?? 'sin obra asociada'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: MONO, fontSize: '12px', color: apagado ? C.tintaSuave : C.tinta }}>
                {diaMes(d.vence) ?? '—'}
              </div>
              {pl && (
                <div style={{ fontFamily: MONO, fontSize: '11px', color: pl.color, marginTop: '1px' }}>
                  {pl.texto}
                </div>
              )}
            </div>

            <span style={{
              fontFamily: MONO, fontSize: '12.5px', textAlign: 'right',
              color: apagado ? C.tintaSuave : C.tinta,
            }}>{montoM(d.monto)}</span>

            {d.reparo == null
              ? <span style={{ fontSize: '11.5px', color: C.fantasma, textAlign: 'right' }}>—</span>
              : <span style={{
                  fontFamily: MONO, fontSize: '11.5px', textAlign: 'right',
                  color: apagado ? C.tenue : C.tintaSuave,
                }}>{enMillones(d.reparo)}</span>}

            <CeldaEstado estado={d.estado} />
            <Gestion d={d} />
          </div>
        )
      })}

      {documentos.length === 0 && (
        <Vacio testid="certificados-vacio">
          {filtrado
            ? 'Ningún documento cae en el tramo elegido. Tocá la banda de nuevo para ver todos.'
            : 'Todavía no hay certificados ni facturas de este cliente en el OS. Se pueblan desde la pestaña Cobranzas del Flujo de Caja.'}
        </Vacio>
      )}
    </div>
  )
}
