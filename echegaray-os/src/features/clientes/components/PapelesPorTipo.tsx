// LOS PAPELES DEL CLIENTE, AGRUPADOS POR TIPO — «Órdenes de compra · 12», «Órdenes de pago · 12»…
//
// ═══ EL DEFECTO QUE VIENE A CERRAR (dueño, 10/09/2026) ═══
//
// «En Documentos tienen que estar claras las OC y las OP correspondientes». Estaban en una lista
// plana donde un comprobante de retención se anunciaba «Documento N° 0000000005146 · sin importe»
// JUSTO DEBAJO de «Orden de pago N° 0000000005146»: dos renglones con el mismo número que parecían
// el mismo papel duplicado. Son dos papeles distintos y uno explica al otro.
//
// ═══ POR QUÉ NO ES UNA `<table>` NI UNA CAJA ═══
//
// Es la misma grilla del v2 que ya usan Obras y Documentos en esta ficha: filos, tipografía y
// números tabulares, sin encabezado gris ni tarjeta. Cada grupo dice su cuenta en el rótulo y su
// total al pie — un total al pie es lo que permite comparar contra lo contratado sin sumar a mano.
//
// SE USA DESDE DOS LADOS: la solapa Documentos del cliente (componente de servidor) y la solapa
// Documentos de la obra (componente de cliente). Por eso no tiene estado ni hooks: dos listas
// parecidas se separan en cuanto una aprende algo, y ésa es la trampa que este repo ya pagó.

import { pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import type { Orden, Papel, PapelesDelCliente } from '../services/papelesCliente'
import { VARIAS_OBRAS } from '../services/papelesCliente'

/** El archivo se abre por la ruta que ya sirve el bucket privado con la credencial del OS. */
const HREF = (id: string) => `/api/clientes/orden/${id}`

const COLS = 'grid-cols-[110px_minmax(0,90px)_minmax(0,1.4fr)_minmax(0,150px)_minmax(0,1.2fr)]'
  + ' max-[767px]:grid-cols-[100px_minmax(0,1fr)_minmax(0,120px)]'
/** Lo que se suelta en el teléfono: la fecha y el vínculo. Nunca el número ni el importe. */
const SOLO_ANCHO = 'max-[767px]:hidden'

/** `2026-08-11` → `11/08/26`. La fecha completa no aporta: todas son del ejercicio en curso. */
function dia(f: string | null): string {
  const m = String(f ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : 'sin fecha'
}

function importe(v: number | null, moneda: string | null, veEconomia: boolean): string {
  if (!veEconomia) return ''
  if (v === null) return 'sin importe'
  return `${moneda === 'USD' ? 'U$S ' : ''}${pesos(v)}`
}

/** El nombre de la obra, o por qué no lo hay. `VARIAS_OBRAS` es un hecho, no un hueco. */
function obraTexto(obraId: string | null, nombreDe: (id: string) => string): string {
  if (obraId === VARIAS_OBRAS) return 'varias obras'
  if (!obraId) return 'sin obra atribuida'
  return nombreDe(obraId)
}

function Fila({ clave, numero, fecha, obra, monto, vinculo, href, tono = V.tinta }: {
  clave: string; numero: string; fecha: string; obra: string; monto: string; vinculo: string
  href: string; tono?: string
}) {
  return (
    <a
      key={clave} href={href} target="_blank" rel="noreferrer"
      data-testid="papel-fila"
      className={`grid items-center gap-[14px] ${COLS} hover:bg-[#F2F1ED]`}
      style={{ height: ALTO_V2.hija, borderBottom: `1px solid ${V.lineaFila}`, paddingLeft: 2 }}
    >
      <span className="font-mono tabular-nums truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: tono }}>
        {numero}
      </span>
      <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: V.tenue }}>
        {fecha}
      </span>
      <span className="truncate" style={{ fontSize: '12px', color: V.apagado }}>{obra}</span>
      <span className="font-mono tabular-nums truncate" style={{ fontSize: '12px', color: V.tinta, textAlign: 'right' }}>
        {monto}
      </span>
      <span className={`truncate ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: V.tenue }}>{vinculo}</span>
    </a>
  )
}

function Grupo({ titulo, n, ayuda, total, veEconomia, children }: {
  titulo: string; n: number; ayuda: string; total?: number | null; veEconomia: boolean
  children: React.ReactNode
}) {
  if (!n) return null
  return (
    <section data-testid="grupo-papeles" data-grupo={titulo} style={{ marginBottom: 18 }}>
      <p style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, padding: '0 0 4px' }} title={ayuda}>
        {titulo} · {n}
      </p>
      <div className={`grid items-center gap-[14px] ${COLS}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: 2 }}>
        <RotuloCol>Número</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Fecha</RotuloCol></span>
        <RotuloCol>Obra</RotuloCol>
        <RotuloCol derecha>{veEconomia ? 'Importe' : ''}</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Vínculo</RotuloCol></span>
      </div>
      {children}
      {/* EL TOTAL AL PIE. Sin él, comparar las OC contra lo contratado obliga a sumar a mano doce
          renglones — y ésa es la comparación por la que se abre esta cara. */}
      {veEconomia && total !== undefined && (
        <div className={`grid items-center gap-[14px] ${COLS}`} style={{ height: ALTO_V2.hija, paddingLeft: 2 }}>
          <span />
          <span className={SOLO_ANCHO} />
          <span style={{ fontSize: '11.5px', color: V.tenue }}>total</span>
          <span className="font-mono tabular-nums" data-testid="total-grupo" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, textAlign: 'right' }}>
            {total === null ? 'sin importes' : pesos(total)}
          </span>
          <span className={SOLO_ANCHO} />
        </div>
      )}
    </section>
  )
}

/** Qué dice la columna «Vínculo» de una orden de compra: qué facturas la respaldan y quién la pagó. */
function vinculoDeOC(o: Orden): string {
  const f = o.facturas.map((x) => x.numeroCorto ?? 's/n')
  const partes: string[] = []
  if (f.length) partes.push(`fact. ${f.join(', ')}`)
  if (o.pagadaPor.length) partes.push(`OP ${o.pagadaPor.join(', ')}`)
  // «no consta» y no «—»: las 12 OP de hoy no dicen qué facturas pagan (su `cita` está vacía), y
  // eso es un dato que falta, no un vínculo que no exista.
  return partes.length ? partes.join(' · ') : 'no consta'
}

function vinculoDeOP(o: Orden): string {
  const partes: string[] = []
  if (o.facturas.length) partes.push(`paga fact. ${o.facturas.map((x) => x.numeroCorto ?? 's/n').join(', ')}`)
  if (o.retenciones.length) partes.push(`con retención`)
  return partes.length ? partes.join(' · ') : 'no consta'
}

export function PapelesPorTipo({ papeles, nombreDeObra, veEconomia, mostrarObra = true }: {
  /** `null` = la lectura falló. «No pude leerlos» no se dibuja como «no hay ninguno». */
  papeles: PapelesDelCliente | null
  /** El nombre de la obra para su `obra_id`. Sin él la columna diría una clave de URL. */
  nombreDeObra: (id: string) => string
  veEconomia: boolean
  /** MIRADO DESDE LA OBRA la columna sobra: repetiría el mismo nombre en cada renglón. */
  mostrarObra?: boolean
}) {
  if (papeles === null) {
    return (
      <p data-testid="papeles-no-leidos" style={{ fontSize: '12.5px', color: V.warn, padding: '4px 0' }}>
        No pude leer los papeles del cliente. Esta pantalla no puede afirmar que no haya ninguno.
      </p>
    )
  }
  const { oc, op, retenciones, facturas, otros } = papeles
  const suma = (xs: { importe: number | null }[]): number | null => {
    const con = xs.map((x) => x.importe).filter((v): v is number => v != null)
    return con.length ? con.reduce((a, b) => a + b, 0) : null
  }
  const obraDe = (id: string | null) => (mostrarObra ? obraTexto(id, nombreDeObra) : '')

  if (!oc.length && !op.length && !retenciones.length && !facturas.length) {
    return (
      <p data-testid="papeles-vacio" style={{ fontSize: '12.5px', color: V.apagado, padding: '4px 0' }}>
        Ninguna orden bajada del mail{mostrarObra ? '' : ' para esta obra'}.
      </p>
    )
  }

  return (
    <div data-testid="papeles-por-tipo">
      <Grupo titulo="Órdenes de compra" n={oc.length} total={suma(oc)} veEconomia={veEconomia}
        ayuda="Las emite el cliente y encargan el trabajo. Se identifican por su número: la misma OC puede haber llegado en dos mails.">
        {oc.map((o) => (
          <Fila
            key={o.clave} clave={o.clave} numero={`OC ${o.numeroCorto ?? 's/n'}`} fecha={dia(o.fecha)}
            obra={obraDe(o.obraId)} monto={importe(o.importe, o.moneda, veEconomia)}
            vinculo={vinculoDeOC(o)} href={HREF(o.archivoId)}
          />
        ))}
      </Grupo>

      <Grupo titulo="Órdenes de pago" n={op.length} total={suma(op)} veEconomia={veEconomia}
        ayuda="Las emite el cliente y ordenan pagar facturas nuestras. Una OP no prueba el cobro: eso lo prueba el extracto del banco.">
        {op.map((o) => (
          <Fila
            key={o.clave} clave={o.clave} numero={`OP ${o.numeroCorto ?? 's/n'}`} fecha={dia(o.fecha)}
            obra={obraDe(o.obraId)} monto={importe(o.importe, o.moneda, veEconomia)}
            vinculo={vinculoDeOP(o)} href={HREF(o.archivoId)}
          />
        ))}
      </Grupo>

      {/* EL CERTIFICADO SE ROTULA CON SU ORDEN DE PAGO, no como «Documento N° …». Y no se le pone
          el nombre de un impuesto: el PDF dice «Comprobante de Retención», «O/P» y «Código de
          Régimen: 78», pero no nombra el tributo (verificado abriendo el archivo el 10/09/2026).
          Escribir «Ganancias» sería fabricar un dato fiscal. */}
      <Grupo titulo="Certificados de retención" n={retenciones.length} veEconomia={veEconomia}
        ayuda="El comprobante de retención que acompaña a una orden de pago. Lleva el número de ESA orden: nunca es una orden de pago más.">
        {retenciones.map((r) => (
          <Fila
            key={r.id} clave={r.id} numero={`Retención · OP ${r.numeroCorto ?? 's/n'}`} fecha={dia(r.fecha)}
            obra={obraDe(r.obra_id)} monto={importe(r.importe, r.moneda, veEconomia)}
            vinculo="del cliente" href={HREF(r.id)} tono={V.apagado}
          />
        ))}
      </Grupo>

      <Grupo titulo="Facturas emitidas" n={facturas.length} total={suma(facturas)} veEconomia={veEconomia}
        ayuda="Las emitimos NOSOTROS y citan la OC que facturan. No son órdenes del cliente: contarlas como OC duplicaba lo vendido.">
        {facturas.map((f) => (
          <Fila
            key={f.id} clave={f.id} numero={`Factura ${f.numeroCorto ?? 's/n'}`} fecha={dia(f.fecha)}
            obra={obraDe(f.obra_id)} monto={importe(f.importe, f.moneda, veEconomia)}
            vinculo={f.cita ? `cita OC ${String(f.cita).split('-').pop()}` : 'sin cita'} href={HREF(f.id)}
          />
        ))}
      </Grupo>

      <Grupo titulo="Otros papeles del mail" n={otros.length} veEconomia={veEconomia}
        ayuda="Bajados del mail y todavía sin clasificar. No se cuentan como órdenes.">
        {otros.map((x: Papel) => (
          <Fila
            key={x.id} clave={x.id} numero={x.numeroCorto ?? 's/n'} fecha={dia(x.fecha)}
            obra={obraDe(x.obra_id)} monto={importe(x.importe, x.moneda, veEconomia)}
            vinculo={x.nombre_archivo ?? ''} href={HREF(x.id)} tono={V.apagado}
          />
        ))}
      </Grupo>
    </div>
  )
}
