// LA OFERTA — el documento tal como lo recibe el cliente.
//
// ═══ NO ES UN PRESUPUESTO PARALELO EDITABLE ═══
//
// Es la SALIDA de esta versión: cada línea tiene su partida atrás y el total es el de la cascada. Un
// formato especial de cliente (ARCOR, un pliego público) sería un adaptador sobre esta misma
// versión, nunca otro motor de cálculo ni otra tabla de partidas.
//
// ═══ LO QUE ESTE ARCHIVO NO PUEDE DIBUJAR ═══
//
// Cómputo, unidades, HH, costo, margen y composición. La garantía no es la disciplina de quien
// edita: `LineaOferta` no tiene esos campos, así que no hay de dónde sacarlos (REGLAS-DATOS §17).

import { C } from '@/shared/components/canon'
import { fecha, plata } from '../services/formato'
import type { Oferta } from '../services/oferta'
import type { PresupuestoCascada } from '../types'

const ROTULO: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 600, letterSpacing: '.08em', color: C.tenue,
}

export function VistaOferta({ oferta, p, congelado }: {
  oferta: Oferta
  p: PresupuestoCascada
  congelado: boolean
}) {
  return (
    <div
      data-testid="vista-oferta"
      style={{
        width: '100%', maxWidth: 620, background: C.superficie, border: `1px solid ${C.linea}`,
        borderRadius: 8, padding: '36px 38px 32px', height: 'fit-content',
      }}
    >
      <Membrete p={p} congelado={congelado} />
      <Encabezado p={p} />

      <div style={{
        marginTop: 30, display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) 130px', gap: 16,
        height: 30, alignItems: 'center', ...ROTULO, borderBottom: `1px solid ${C.tinta}`,
      }}>
        <span />
        <span>DESCRIPCIÓN DE LOS TRABAJOS</span>
        <span style={{ textAlign: 'right' }}>IMPORTE</span>
      </div>

      {oferta.lineas.map((l, i) => (
        <div
          key={l.rubro}
          data-testid="linea-oferta"
          style={{
            display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) 130px', gap: 16,
            padding: '14px 0', borderBottom: `1px solid ${C.lineaFila}`, alignItems: 'start',
          }}
        >
          <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: C.tenue, paddingTop: 2 }}>
            {i + 1}
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{l.rubro}</span>
            <span style={{ fontSize: 11.5, color: C.apagado, lineHeight: 1.6 }}>{l.detalle}</span>
          </span>
          <span style={{
            textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
            color: l.importe === null ? C.neg : C.tinta,
          }}>
            {/* Un rubro sin precio no vale $0: le falta el precio, y así se dice. */}
            {plata(l.importe) ?? `sin precio · ${l.sinPrecio}`}
          </span>
        </div>
      ))}

      <Totales oferta={oferta} p={p} />
      <Condiciones />
      <Pie oferta={oferta} />
    </div>
  )
}

function Membrete({ p, congelado }: { p: PresupuestoCascada; congelado: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em' }}>
          ECHEGARAY CONSTRUCCIONES
        </span>
        <span style={{ fontSize: 10.5, color: C.tenue }}>
          Construcción industrial y comercial · San Juan
        </span>
      </span>
      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={ROTULO}>PRESUPUESTO</span>
        <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace' }}>
          {p.numero ?? 'sin número'} · v{p.version}
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: congelado ? C.pos : C.tenue }}>
          {congelado
            ? `v${p.version} congelada · inmutable`
            : 'borrador · deriva de esta versión al congelar'}
        </span>
      </span>
    </div>
  )
}

function Encabezado({ p }: { p: PresupuestoCascada }) {
  const campos: [string, string][] = [
    ['CLIENTE', p.cliente ?? 'sin cliente'],
    ['OBRA', p.obra_nombre ?? 'sin objeto'],
    ['FECHA', fecha(p.fecha_cotizacion) ?? 'sin fecha'],
    ['VALIDEZ', 'A confirmar con Dirección'],
  ]
  return (
    <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
      {campos.map(([k, v]) => (
        <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={ROTULO}>{k}</span>
          <span style={{ fontSize: 13 }}>{v}</span>
        </span>
      ))}
    </div>
  )
}

/** El IVA sale de la cascada; el total del documento también. Acá no se suma nada. */
function Totales({ oferta, p }: { oferta: Oferta; p: PresupuestoCascada }) {
  const filas: [string, number | null, boolean][] = [
    ['Total sin IVA', oferta.total, false],
    ['IVA', p.iva, false],
    ['Total', p.venta_final, true],
  ]
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
      {filas.map(([k, v, fuerte]) => (
        <div
          key={k}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '9px 0', borderTop: fuerte ? `1px solid ${C.tinta}` : `1px solid ${C.lineaFila}`,
          }}
        >
          <span style={{ fontSize: fuerte ? 13 : 12, fontWeight: fuerte ? 600 : 400, color: C.tintaSuave }}>
            {k}
          </span>
          <span style={{
            fontSize: fuerte ? 17 : 13, fontWeight: fuerte ? 600 : 400, fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums', color: v === null ? C.tenue : C.tinta,
          }}>
            {plata(v) ?? 'sin calcular'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Las condiciones son CONTRACTUALES y todavía no viven en el modelo: no hay tabla que las guarde.
 * Se dice que faltan en vez de escribir un plazo de pago inventado, que es lo que después firma.
 */
function Condiciones() {
  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={ROTULO}>CONDICIONES</span>
      <span style={{ fontSize: 11.5, color: C.warn, lineHeight: 1.7 }} data-testid="condiciones-faltan">
        Las condiciones comerciales —anticipo, plazo de pago, redeterminación, plazo de obra— todavía
        no se guardan en el presupuesto. Se cargan a mano en el documento que sale al cliente.
      </span>
    </div>
  )
}

function Pie({ oferta }: { oferta: Oferta }) {
  return (
    <div style={{
      marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.lineaFila}`,
      fontSize: 10.5, color: C.tenue, lineHeight: 1.75,
    }} data-testid="pie-oferta">
      Los importes por rubro se derivan del precio de venta repartiéndolo en proporción al costo de
      cada uno{oferta.coeficiente !== null && `, con el coeficiente ${oferta.coeficiente.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} que sale de la cascada`}.
      El modelo no guarda un precio por partida: el precio existe una sola vez, al final.
      {oferta.sinPrecio > 0 && ` Quedan ${oferta.sinPrecio} partida(s) sin precio, que todavía no entran en este total.`}
    </div>
  )
}
