// EL ENCABEZADO PERMANENTE DEL PRESUPUESTO VIVO — «Presupuestos v5 · entorno xsas», franja superior.
//
// ═══ LAS TRES COSAS QUE SE MIRAN SIN BAJAR ═══
//
// Cuánta certeza hay, qué precio está firme y qué depende de lo que falta. Los tres números salen de
// `services/vivo.ts`, que los cuenta de las mismas filas que la tabla dibuja abajo: no hay una
// segunda lectura que pueda decir otra cosa.
//
// ═══ NUNCA UN BOTÓN GRIS SIN EXPLICACIÓN ═══
//
// Cuando el gate no está listo, en el lugar del botón va la LISTA de bloqueos, y cada uno es un
// enlace a su partida. Un «Congelar» deshabilitado obliga a adivinar qué falta; esto contesta la
// pregunta en el mismo lugar donde aparece.
//
// ═══ LA BARRA DE CERTEZA NO ES UN SEMÁFORO ═══
//
// Son tres tramos proporcionales a un conteo real —confirmadas, por confirmar, con problema— y el
// texto de abajo dice los tres números. Sin el texto sería una decoración; con él, la barra es sólo
// la forma rápida de leerlo.

import Link from 'next/link'
import { C } from '@/shared/components/canon'
import { plata } from '../services/formato'
import type { Bloqueo, Certeza, Firmeza } from '../services/vivo'

const ROTULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.08em', color: C.tenue,
}
const CIFRA: React.CSSProperties = {
  fontSize: 12.5, fontFamily: 'var(--font-mono, ui-monospace), monospace', fontVariantNumeric: 'tabular-nums',
}

export function EncabezadoVivo({
  certeza, firmeza, precioFirme, bloqueos, porQueGate, nAtencion, congelado, sello,
  hrefBase, vista, accionCongelar,
}: {
  certeza: Certeza
  firmeza: Firmeza
  /** El de la cascada. `null` = no hay una sola fila valorizada; no se dibuja un $0. */
  precioFirme: number | null
  bloqueos: Bloqueo[]
  /** El `porQue` del gate, tal como lo escribe el motor. No se reescribe acá. */
  porQueGate: string
  nAtencion: number
  congelado: boolean
  /** «v2 congelada · inmutable». Sólo cuando lo está. */
  sello: string | null
  /** La URL de esta pantalla sin paneles, para armar los enlaces de estado. */
  hrefBase: string
  vista: 'oferta' | 'costos'
  /** El botón real de congelar, que vive en `AccionesPresupuesto` con su server action. */
  accionCongelar: React.ReactNode
}) {
  const q = (extra: string) => `${hrefBase}?vista=${vista}${extra}`
  return (
    <div
      data-testid="encabezado-vivo"
      style={{
        flex: 'none', background: C.superficie, borderBottom: `1px solid ${C.linea}`,
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap',
      }}
    >
      <BarraCerteza c={certeza} />

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={ROTULO}>PRECIO FIRME</span>
        <span style={CIFRA} data-testid="precio-firme">
          {/* `null` no se dibuja como $0: sin una fila valorizada no hay precio que publicar. */}
          {plata(precioFirme) ?? <span style={{ color: C.tenue }}>sin partidas valorizadas</span>}
        </span>
        <span style={{ fontSize: 10.5, color: C.tenue }}>
          {firmeza.firmes} {firmeza.firmes === 1 ? 'partida adentro' : 'partidas adentro'}
        </span>
      </span>

      <Pendientes f={firmeza} />

      <div style={{ flex: 1 }} />

      <Link
        href={q('&atencion=1')}
        data-testid="chip-atencion"
        style={{
          fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '8px 12px', whiteSpace: 'nowrap',
          color: nAtencion ? C.grafito : C.pos,
          background: nAtencion ? '#FDF3D0' : C.superficieTenue,
          boxShadow: `inset 0 0 0 1px ${nAtencion ? C.marca : C.linea}`,
        }}
      >
        {nAtencion > 0 ? `Necesita tu atención · ${nAtencion}` : 'Nada pendiente'}
      </Link>

      <EstadoDeEnvio
        congelado={congelado} sello={sello} bloqueos={bloqueos} accion={accionCongelar} q={q}
        porQue={porQueGate}
      />
    </div>
  )
}

/** Tres tramos proporcionales y el conteo escrito al lado. El criterio viaja en el `title`. */
function BarraCerteza({ c }: { c: Certeza }) {
  const ancho = (n: number) => (c.total === 0 ? '0%' : `${(n / c.total) * 100}%`)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 230 }} title={c.criterio}>
      <span style={{ height: 6, display: 'flex', borderRadius: 3, overflow: 'hidden', background: C.lineaFila }}>
        <span style={{ width: ancho(c.confirmadas), background: C.grafito }} />
        <span style={{ width: ancho(c.porConfirmar), background: '#B9B7B0' }} />
        <span style={{ width: ancho(c.conProblema), background: C.neg }} />
      </span>
      <span style={{ fontSize: 11.5, color: C.apagado }} data-testid="certeza-texto">
        {c.total} {c.total === 1 ? 'partida' : 'partidas'} · {c.confirmadas} confirmadas
        {' · '}{c.porConfirmar} por confirmar · {c.conProblema} con problema
        {c.excluidas > 0 && ` · ${c.excluidas} excluidas`}
      </span>
    </span>
  )
}

/** Lo que falta se CUENTA; su plata se suma sólo cuando existe, y lo que no se midió se declara. */
function Pendientes({ f }: { f: Firmeza }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={ROTULO}>DEPENDE DE PENDIENTES</span>
      <span style={{ ...CIFRA, color: f.pendientes ? C.neg : C.pos }} data-testid="pendientes">
        {f.pendientes === 0
          ? 'nada pendiente'
          : `${f.pendientes} ${f.pendientes === 1 ? 'partida sin importe' : 'partidas sin importe'}`}
      </span>
      {f.pendientes > 0 && (
        <span style={{ fontSize: 10.5, color: C.tenue }}>
          {f.montoPendienteConocido !== null && `${plata(f.montoPendienteConocido)} conocidos`}
          {f.montoPendienteConocido !== null && f.pendientesSinMonto > 0 && ' · '}
          {/* Un hueco sin medir no se puede llamar chico: se dice que no se sabe. */}
          {f.pendientesSinMonto > 0 && `${f.pendientesSinMonto} sin medir`}
        </span>
      )}
    </span>
  )
}

/**
 * EL ESTADO DE ENVÍO. Los `data-testid` del gate viven acá porque acá es donde el gate se lee:
 * `gate-freeze` / `gate-porque` son el mismo contrato que ya verificaba el recorrido de navegador,
 * y moverlos sin dejar rastro habría dejado esa prueba mirando un lugar vacío.
 */
function EstadoDeEnvio({
  congelado, sello, bloqueos, accion, q, porQue,
}: {
  congelado: boolean
  sello: string | null
  bloqueos: Bloqueo[]
  accion: React.ReactNode
  q: (extra: string) => string
  porQue: string
}) {
  if (congelado) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 300 }} data-testid="sello-congelada">
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.pos }}>{sello}</span>
        <span style={{ fontSize: 11.5, color: C.apagado, lineHeight: 1.5 }}>
          Inmutable. Un cambio de alcance abre una revisión.
        </span>
      </span>
    )
  }
  if (bloqueos.length === 0) {
    return (
      <span
        style={{ display: 'flex', alignItems: 'center', gap: 14 }}
        data-testid="gate-freeze" data-ready="1"
      >
        <span style={{ fontSize: 12, color: C.pos, whiteSpace: 'nowrap' }}>Listo para enviar</span>
        {accion}
      </span>
    )
  }
  return (
    <span
      style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}
      data-testid="gate-freeze" data-ready="0"
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.neg }}>Todavía no se puede enviar</span>
      {/* El motivo EN LAS PALABRAS DEL MOTOR, chico y debajo. Reescribirlo acá abriría la puerta a
          que la pantalla diga una cosa y el gate de la base decida otra. */}
      <span style={{ fontSize: 10.5, color: C.tenue, lineHeight: 1.4 }} data-testid="gate-porque">
        {porQue}
      </span>
      {bloqueos.map((b, i) => (
        <Link
          key={`${b.tipo}-${b.partidaId ?? b.entidad}-${i}`}
          href={b.partidaId ? q(`&insp=partida:${b.partidaId}`) : q('&atencion=1')}
          data-testid="bloqueo-envio"
          style={{
            fontSize: 11.5, color: C.tintaSuave, lineHeight: 1.5,
            paddingLeft: 11, boxShadow: `inset 2px 0 0 ${C.linea}`,
          }}
        >
          {b.entidad}{b.detalle ? ` — ${b.detalle}` : ''}
        </Link>
      ))}
    </span>
  )
}
