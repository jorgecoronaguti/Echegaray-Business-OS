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
// ═══ EL CHIP Y LOS PENDIENTES CUENTAN LO MISMO, Y LO DICEN ═══
//
// Antes el chip decía «Necesita tu atención · 26» y a su izquierda se leía «DEPENDE DE PENDIENTES:
// nada pendiente». Las dos cifras eran ciertas con SUS definiciones —una contaba la cola del motor,
// la otra las filas sin importe— y juntas se contradecían. Ahora las dos salen de `pendientesDe()`,
// el chip dice QUÉ cuenta, y el criterio viaja en el `title` de los dos.
//
// ═══ LA BARRA DE CERTEZA NO ES UN SEMÁFORO ═══
//
// Son tres tramos proporcionales a un conteo real —confirmadas, por confirmar, con problema— y el
// texto de abajo dice los tres números. Sin el texto sería una decoración; con él, la barra es sólo
// la forma rápida de leerlo.

import Link from 'next/link'
import { C } from '@/shared/components/canon'
import { plata } from '../services/formato'
import type { hrefEntorno } from '../services/rutas'
import type { Bloqueo, Certeza, Firmeza, Pendientes } from '../services/vivo'

const ROTULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.08em', color: C.tenue,
}
const CIFRA: React.CSSProperties = {
  fontSize: 12.5, fontFamily: 'var(--font-mono, ui-monospace), monospace', fontVariantNumeric: 'tabular-nums',
}

export function EncabezadoVivo({
  certeza, firmeza, precioFirme, bloqueos, porQueGate, pendientes, congelado, sello,
  href, accionCongelar, notaConvertir,
}: {
  certeza: Certeza
  firmeza: Firmeza
  /** El de la cascada. `null` = no hay una sola fila valorizada; no se dibuja un $0. */
  precioFirme: number | null
  bloqueos: Bloqueo[]
  /** El `porQue` del gate, tal como lo escribe el motor. No se reescribe acá. */
  porQueGate: string
  /** El chip y el bloque de pendientes, de una sola función. */
  pendientes: Pendientes
  congelado: boolean
  /** «v2 congelada · inmutable». Sólo cuando lo está. */
  sello: string | null
  /**
   * El armador de URLs de `services/rutas.ts`. NO se concatenan querystrings acá: este encabezado
   * las armaba a mano —`?vista=${vista}&insp=partida:${id}`— y un id con caracteres especiales
   * habría salido sin codificar, además de repetir una lógica que ya tiene test.
   */
  href: (cambios: Parameters<typeof hrefEntorno>[2]) => string
  /** El botón real de congelar, que vive en `AccionesPresupuesto` con su server action. */
  accionCongelar: React.ReactNode
  /** Por qué todavía no se puede convertir a obra. `null` = se puede, y el botón está en la barra. */
  notaConvertir: string | null
}) {
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

      <BloquePendientes p={pendientes} />

      <div style={{ flex: 1 }} />

      <Link
        href={href({ atencion: true })}
        data-testid="chip-atencion"
        title={pendientes.criterio}
        style={{
          fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '8px 12px', whiteSpace: 'nowrap',
          color: pendientes.total ? C.grafito : C.pos,
          background: pendientes.total ? '#FDF3D0' : C.superficieTenue,
          boxShadow: `inset 0 0 0 1px ${pendientes.total ? C.marca : C.linea}`,
        }}
      >
        {/* EL CHIP DICE QUÉ CUENTA, Y CUENTA LA UNIÓN. «Necesita tu atención · 26» no distingue 26
            planos por medir de 26 decisiones de alcance, que es la diferencia entre una semana y
            una llamada; y contar sólo la cola dejaba en cero filas con huecos que nadie levantó. */}
        {pendientes.resumen}
      </Link>

      <EstadoDeEnvio
        congelado={congelado} sello={sello} bloqueos={bloqueos} accion={accionCongelar} href={href}
        porQue={porQueGate} notaConvertir={notaConvertir}
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
        <span style={{ width: ancho(c.ambiguas), background: C.warn }} />
        <span style={{ width: ancho(c.faltantes), background: C.neg }} />
      </span>
      <span style={{ fontSize: 11.5, color: C.apagado }} data-testid="certeza-texto">
        {/* CADA PROBLEMA POR SU NOMBRE. «26 con problema» no dice si hay que medir un plano o
            llamar al cliente, y son las dos cosas más distintas que puede haber acá. */}
        {c.total} {c.total === 1 ? 'partida' : 'partidas'} · {c.confirmadas} confirmadas
        {' · '}{c.porConfirmar} por confirmar
        {c.ambiguas > 0 && ` · ${c.ambiguas} sin alcance declarado`}
        {c.faltantes > 0 && ` · ${c.faltantes} sin poder valorizar`}
        {c.excluidas > 0 && ` · ${c.excluidas} excluidas`}
      </span>
      {c.sinGenealogia > 0 && (
        // §16 y §21: el número existe pero no se puede recorrer hacia atrás. No impide cotizar y no
        // se cuenta como problema de precio — pero callarlo sería publicar un costo sin origen.
        <span style={{ fontSize: 10.5, color: C.warn }} data-testid="sin-genealogia">
          {c.sinGenealogia} sin análisis detrás: el costo no se puede explicar hacia atrás
        </span>
      )}
    </span>
  )
}

/**
 * LO QUE TODAVÍA PUEDE MOVER EL PRECIO — y en qué dirección.
 *
 * Las dos direcciones se dicen porque no son lo mismo: lo que está adentro sin decidir puede RESTAR
 * cuando alguien decida, y lo que no se puede valorizar puede SUMAR cuando se pueda. Un solo número
 * las taparía, y el que cotiza necesita saber para qué lado se mueve.
 */
function BloquePendientes({ p }: { p: Pendientes }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 280 }} title={p.criterio}>
      <span style={ROTULO}>DEPENDE DE PENDIENTES</span>
      <span style={{ ...CIFRA, color: p.total ? C.warn : C.pos }} data-testid="pendientes">
        {p.total === 0 ? 'nada pendiente' : `${p.total} ${p.total === 1 ? 'pendiente' : 'pendientes'}`}
      </span>
      {p.total > 0 && (
        <span style={{ fontSize: 10.5, color: C.tenue, lineHeight: 1.45 }} data-testid="pendientes-detalle">
          {[
            // Cada dirección con su monto AL COSTO: es lo que entraría o saldría del costo directo.
            p.puedenRestar > 0 && `${p.puedenRestar} adentro del precio sin decidir${p.montoQuePuedeSalir !== null ? ` (${plata(p.montoQuePuedeSalir)} podrían salir)` : ''}`,
            p.puedenSumar > 0 && `${p.puedenSumar} sin valorizar${p.montoQuePuedeEntrar !== null ? ` (${plata(p.montoQuePuedeEntrar)} conocidos por entrar)` : ''}`,
            p.inciertos > 0 && `${p.inciertos} con el dato en duda`,
            // Un hueco sin medir no se puede llamar chico: se dice que no se sabe.
            p.sinMedir > 0 && `${p.sinMedir} sin medir`,
          ].filter(Boolean).join(' · ')}
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
  congelado, sello, bloqueos, accion, href, porQue, notaConvertir,
}: {
  congelado: boolean
  sello: string | null
  bloqueos: Bloqueo[]
  accion: React.ReactNode
  href: (cambios: Parameters<typeof hrefEntorno>[2]) => string
  porQue: string
  notaConvertir: string | null
}) {
  if (congelado) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 320 }} data-testid="sello-congelada">
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.pos }}>{sello}</span>
        <span style={{ fontSize: 11.5, color: C.apagado, lineHeight: 1.5 }}>
          Inmutable. Un cambio de alcance abre una revisión.
        </span>
        <NotaConvertir texto={notaConvertir} />
      </span>
    )
  }
  if (bloqueos.length === 0) {
    return (
      <span
        style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 340 }}
        data-testid="gate-freeze" data-ready="1"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: C.pos, whiteSpace: 'nowrap' }}>Listo para enviar</span>
          {accion}
        </span>
        <NotaConvertir texto={notaConvertir} />
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
          href={b.partidaId ? href({ insp: `partida:${b.partidaId}` }) : href({ atencion: true })}
          data-testid="bloqueo-envio"
          style={{
            fontSize: 11.5, color: C.tintaSuave, lineHeight: 1.5,
            paddingLeft: 11, boxShadow: `inset 2px 0 0 ${C.linea}`,
          }}
        >
          {b.entidad}{b.detalle ? ` — ${b.detalle}` : ''}
        </Link>
      ))}
      <NotaConvertir texto={notaConvertir} />
    </span>
  )
}

/**
 * POR QUÉ TODAVÍA NO SE CONVIERTE A OBRA — texto, no un botón gris.
 *
 * «Convertir a obra» se dibujaba apagado con el motivo escondido en el `title`: había que pasar por
 * encima de un control muerto para enterarse de qué faltaba. El contrato lo prohíbe, y el motivo ya
 * existía —`puedeConvertir()` lo devuelve—; lo único que faltaba era escribirlo donde se lee.
 */
function NotaConvertir({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <span
      data-testid="nota-convertir"
      style={{ fontSize: 11, color: C.tenue, lineHeight: 1.45 }}
    >
      Convertir a obra — {texto}
    </span>
  )
}
