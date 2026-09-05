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

// LA TABLA DE CERTIFICADOS DEL HANDOFF v4 — «D1 · Panel del certificado» del README, dibujada en
// `CRM · Lo que faltaba (cobranza, esquema, contacto).dc.html:51` y `:513`.
//
//   grilla   `minmax(190px,1.5fr) 96px 108px 116px 132px`, `gap:14px`
//   columnas DOCUMENTO (número + obra · factura) · EMITIDO · VENCE · MONTO · ESTADO
//   cabecera 10px, `letterSpacing:.06em`, `#91918B`, filo inferior `#D7D5CF`
//   filas    `minHeight:54px`, separador `#F1F0EC` (el `hairline-soft` del handoff)
//   elegida  `boxShadow: inset 2px 0 0 #FDC900`, SIN padding compensatorio
//
// ═══ POR QUÉ SE FUERON DOS COLUMNAS Y ENTRÓ UNA ═══
//
// La tanda anterior dibujaba seis columnas: `minmax(0,1.7fr) 96px 104px 78px 116px 92px` con
// REPARO y GESTIÓN, y sin EMITIDO. Las tres decisiones, medidas contra las 48 filas reales de
// `certificado_cliente` el 05/09/2026:
//
//   · REPARO se fue. `reparo` está en NULL en las 48 filas: la columna era un guión de 78px de
//     ancho en todas. El dato no se pierde —el panel lo dice con su palabra, «sin retención
//     cargada», que es lo que una columna de guiones no puede decir—.
//   · GESTIÓN se fue. Sus tres marcas ya están dichas en otro lado y mejor: la factura, en el
//     segundo renglón del DOCUMENTO; la observación, en su banda del panel; el cobro, en ESTADO.
//   · EMITIDO entró. `emitido_at` está cargado en las 48 filas, y sin él la única fecha visible
//     era el vencimiento: no se podía leer el plazo que el contrato le da al cliente.
//
// ═══ EL FILO DE LA FILA ELEGIDA NO CORRE EL TEXTO ═══
//
// El `.dc.html` le suma `padding-left:11px` a la fila elegida y el README lo prohíbe con todas las
// letras: «sin padding compensatorio (la fila no se desalinea de su cabecera)». Gana el README —se
// ve en la captura del propio handoff que el número de la fila elegida queda corrido respecto de
// su encabezado, que es exactamente el defecto que la regla nombra—.

import type { CSSProperties } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque, Vacio } from '../canon/Piezas'
import { COLOR_ESTADO, ROTULO_ESTADO } from '../../services/propiedadesCertificado'
import { diaMes, diasEntre, montoM } from '../../services/cobranzaFormato'
import type { CertificadoCliente } from '../../types/cobranzas'

const COLS = 'minmax(190px,1.5fr) 96px 108px 116px 132px'

/** 190+96+108+116+132 y cuatro `gap:14px`. Debajo de esto la tabla scrollea por dentro. */
const MIN_TABLA = 698

/** El rótulo de columna de esta tanda: 10px `.06em` (`:51`), no el 9,5px de la tanda anterior. */
const ROTULO: CSSProperties = { fontSize: '10px', color: C.tenue, letterSpacing: '.06em' }

/** El segundo renglón del DOCUMENTO: `obra · factura`, y cada ausencia con su palabra. */
const subtitulo = (d: CertificadoCliente): string =>
  `${d.obra_nombre ?? 'sin obra asociada'} · ${d.factura ?? 'sin factura'}`

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

      {/* ═══ LA TABLA SCROLLEA POR DENTRO; A 390 px NADA SE MONTA SOBRE LA COLUMNA VECINA ═══

          La grilla del handoff son 698px de mínimo (la primera columna arranca en 190px y las
          otras cuatro son fijas). Sin este envoltorio, a 390px las celdas se encimarían —el mismo
          defecto que el 05/09 tapó el avance con el importe en la lista de obras—. `overflowX` no
          dibuja nada mientras el contenido entra: en escritorio es un `div` de más. */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: `${MIN_TABLA}px` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: '14px', padding: '0 0 8px',
            borderBottom: `1px solid ${C.bordeFuerte}`,
          }}>
            <span style={ROTULO}>DOCUMENTO</span>
            <span style={ROTULO}>EMITIDO</span>
            <span style={ROTULO}>VENCE</span>
            <span style={{ ...ROTULO, textAlign: 'right' }}>MONTO</span>
            <span style={ROTULO}>ESTADO</span>
          </div>

          {documentos.map((d) => {
            const sel = elegido === d.id
            // El atraso pinta la fecha de rojo aunque el estado guardado no diga «vencido»: la
            // fecha ya pasó, y esperar a que el sync mueva el estado es dejar de mostrar el atraso
            // justo mientras dura.
            const atraso = d.estado === 'cobrado' ? null : diasEntre(d.vence, hoy)
            const vencido = atraso != null && atraso > 0
            return (
              <div
                key={d.id} role="button" tabIndex={0} onClick={() => onElegir(d.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(d.id) } }}
                data-testid={`fila-doc-${d.id}`} aria-current={sel ? 'true' : undefined}
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: '14px', alignItems: 'center',
                  minHeight: '54px', borderBottom: `1px solid ${C.bordeCelda}`, cursor: 'pointer',
                  boxShadow: sel ? `inset 2px 0 0 ${C.marca}` : undefined,
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 500, color: C.tinta,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{d.numero}</span>
                  <span style={{
                    fontSize: '11.5px', color: C.tenue,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{subtitulo(d)}</span>
                </div>

                <span style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave }}>
                  {diaMes(d.emitido_at) ?? 'sin fecha'}
                </span>

                {/* Sin vencimiento no hay plazo que reclamar, y eso bloquea la cobranza: ámbar. */}
                <span style={{
                  fontFamily: MONO, fontSize: '12.5px',
                  color: d.vence == null ? C.warn : vencido ? C.neg : C.tintaSuave,
                }}>{diaMes(d.vence) ?? 'sin vencer'}</span>

                <span style={{ fontFamily: MONO, fontSize: '13px', textAlign: 'right', color: C.tinta }}>
                  {montoM(d.monto)}
                </span>

                {/* EL RÓTULO Y EL COLOR DE LOS SIETE ESTADOS SALEN DEL SERVICIO, que es donde se
                    prueban con `node --test`: la tabla, el panel y el calendario no discrepan. */}
                <span
                  data-testid={`estado-${d.id}`}
                  style={{ fontSize: '12.5px', color: COLOR_ESTADO[d.estado], whiteSpace: 'nowrap' }}
                >
                  {ROTULO_ESTADO[d.estado]}{d.estado === 'vencido' && vencido ? ` · ${atraso} d` : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>

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
