// D04 · REVISAR UN TICKET — la foto a la izquierda, lo que quedó en Compras a la derecha.
//
// ═══ POR QUÉ NO SE LLAMA «IMPUTAR» ACÁ (dueño, 22/09/2026) ═══
// El diseño dibuja un formulario que al confirmar escribe la fila de Compras. El dueño decidió que el bot
// carga sin preguntar: el worker de la VM lee el ticket y escribe la fila con Tipo pago «A rendir» y la obra
// de la entrega. Entonces esta pantalla REVISA: muestra lo que leyó y lo que quedó, y ofrece pedir el dato
// que falta o descartar. No hay un botón que escriba Compras desde la web; corregir una fila ya cargada se
// hace en la pantalla de Compras, que es la verdad del gasto.

import Link from 'next/link'
import type { Comprobante, Entrega, FilaDeCompras } from '../types'
import { ddmm, ddmmHora, esperando, leidoDe, numero, pesos, ROTULO_COMPROBANTE, totalLeido } from '../logica/entregas'
import { urlEfectivo, urlFilaDeCompras } from '../logica/url'
import { DescartarComprobante, FotoDelTicket, ObservarComprobante } from './AccionesComprobante'
import { COLOR_TONO, MONO, SUPERFICIE, V, botonOscuroGrande, cajaConfirmar, eyebrow, punto } from './estilo'

export function RevisarComprobante({ e, c, cola, fotoUrl, fila, destino }: {
  e: Entrega
  c: Comprobante
  /** Los tickets de la entrega que todavía esperan, en el orden en que llegaron. */
  cola: Comprobante[]
  fotoUrl: string | null
  fila: FilaDeCompras | null
  destino: string
}) {
  const l = leidoDe(c)
  const total = fila?.total ?? totalLeido(c)
  const pos = cola.findIndex((x) => x.id === c.id)
  const siguiente = pos >= 0 ? cola[pos + 1] ?? null : cola[0] ?? null
  const sumaCola = cola.reduce((s, x) => s + (totalLeido(x) ?? 0), 0)
  const estado = ROTULO_COMPROBANTE[c.estado]
  const volver = urlEfectivo({ entrega: e.codigo })
  const nombreCorto = e.persona.split(/\s+/).slice(-1)[0] ?? e.persona
  const caja = { height: 34, padding: '0 11px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, display: 'flex', alignItems: 'center', fontSize: '13.5px', background: SUPERFICIE, minWidth: 0 } as const
  const dato = (rotulo: string, valor: React.ReactNode, nota?: React.ReactNode, mono = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...caja, fontFamily: mono ? MONO : undefined }} className="truncate">{valor}</div>
      {nota}
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="revisar-comprobante" data-estado={c.estado}>
      <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', background: SUPERFICIE, borderBottom: `1px solid ${V.linea}`, fontSize: '13px', flexWrap: 'wrap' }}>
        <Link href={volver} prefetch={false} style={{ fontWeight: 500 }}>{e.codigo} · {e.persona} · {destino}</Link>
        <span style={{ color: V.apagado }}>
          {cola.length} {cola.length === 1 ? 'comprobante' : 'comprobantes'} por imputar · {pesos(sumaCola)}
        </span>
        <span style={{ marginLeft: 'auto', color: V.apagado }}>{pos >= 0 ? `${pos + 1} de ${cola.length}` : estado.texto}</span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch" style={{ minHeight: 600 }}>
        <div className="lg:w-[520px]" style={{ flexShrink: 0, background: '#1F1F1E', padding: 24, display: 'flex', flexDirection: 'column' }}>
          <FotoDelTicket
            url={fotoUrl}
            esPdf={c.media_type === 'application/pdf'}
            rotulo={`Foto del comprobante · ${ddmmHora(c.enviado_en)}`}
            pie={c.canal === 'mattermost' ? 'llegó por el canal' : 'llegó por la app'}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 22, background: '#FFFFFF' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', color: COLOR_TONO[estado.tono], fontWeight: 500 }}>
              {estado.tono !== 'apagado' && <span style={punto(estado.tono)} />}{estado.texto}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>Lo que leyó el sistema</div>
            <div style={{ fontSize: '12.5px', color: V.apagado }}>
              El sistema lo carga solo a Compras. Si algo quedó mal, se corrige en la fila de Compras; si falta un dato, se le pide a {nombreCorto}.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '18px 26px' }}>
            {dato('Proveedor', fila?.proveedor ?? l?.proveedor ?? <span style={{ color: V.tenue }}>no se leyó</span>,
              l?.cuit
                ? <div style={{ fontSize: '12px', color: V.pos }}>CUIT leído · {l.cuit}</div>
                : <div style={{ fontSize: '12px', color: V.warn }}>sin CUIT · clave débil</div>)}
            {dato('Comprobante',
              fila?.comprobante ? `${fila.tipo ? `${fila.tipo} ` : ''}${fila.comprobante}` : l?.numero ? `${l.tipo ? `${l.tipo} ` : ''}${l.numero}` : <span style={{ color: V.tenue }}>no se leyó</span>,
              c.estado === 'duplicado' ? <div style={{ fontSize: '12px', color: V.warn }}>Ya estaba cargado en otra fila: no se duplicó</div> : undefined, true)}
            {dato('Importe total', total != null ? pesos(total) : <span style={{ color: V.tenue }}>no se leyó</span>, undefined, true)}
            {dato('Fecha', fila?.fecha ? ddmm(fila.fecha) : l?.fecha ? ddmm(l.fecha) : <span style={{ color: V.tenue }}>no se leyó</span>, undefined, true)}
            {dato('Obra', destino, <div style={{ fontSize: '12px', color: V.apagado }}>Viene de la entrega.</div>)}
            {dato('Rubro', fila?.concepto ?? <span style={{ color: V.tenue }}>lo pone la fila de Compras</span>)}
          </div>

          <Estado c={c} e={e} fila={fila} total={total} destino={destino} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
            <Link href={siguiente ? urlEfectivo({ entrega: e.codigo, comprobante: siguiente.id }) : volver} prefetch={false} style={botonOscuroGrande} data-testid="revisar-seguir">
              {siguiente ? 'Seguir' : 'Volver a la entrega'}
            </Link>
            {esperando(c) && c.estado !== 'respondido' && <ObservarComprobante id={c.id} persona={nombreCorto} />}
            {esperando(c) && <DescartarComprobante id={c.id} alTerminar={volver} />}
            {siguiente && (
              <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: V.apagado }}>
                Sigue: {leidoDe(siguiente)?.proveedor ?? 'ticket sin proveedor legible'}
                {totalLeido(siguiente) != null && <> · <span style={{ fontFamily: MONO }}>$ {numero(totalLeido(siguiente) as number)}</span></>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Lo que ya pasó con el ticket, en el lugar donde el diseño decía «Al confirmar». */
function Estado({ c, e, fila, total, destino }: { c: Comprobante; e: Entrega; fila: FilaDeCompras | null; total: number | null; destino: string }) {
  const titulo = { fontSize: '12.5px', fontWeight: 600 } as const
  const cuerpo = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 } as const
  if (c.estado === 'en_compras') {
    return (
      <div style={cajaConfirmar} data-testid="revisar-estado">
        <div style={{ ...titulo, color: V.pos }}>Ya está en Compras</div>
        <div style={cuerpo}>
          <div>
            Fila{fila ? ` ${fila.fila}` : ''}: {fila?.proveedor ?? leidoDe(c)?.proveedor ?? 'sin proveedor'} · {destino}
            {total != null ? ` · ${pesos(total)}` : ''} · medio de pago <b>{fila?.tipo_pago ?? 'A rendir'} {e.codigo}</b>.
          </div>
          <div>Es gasto de {destino} y ya bajó el saldo de {e.persona}.</div>
          {fila && (
            <Link href={urlFilaDeCompras(fila.fila)} prefetch={false} style={{ color: V.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }} data-testid="abrir-fila-compras">
              Abrir la fila en Compras para corregirla
            </Link>
          )}
        </div>
      </div>
    )
  }
  if (c.estado === 'descartado') {
    return (
      <div style={cajaConfirmar} data-testid="revisar-estado">
        <div style={titulo}>Descartado</div>
        <div style={cuerpo}>{c.descartado_motivo ?? 'sin motivo'} · no rinde la entrega.</div>
      </div>
    )
  }
  const motivo = c.observacion ?? c.motivo
  return (
    <div style={cajaConfirmar} data-testid="revisar-estado">
      <div style={titulo}>{c.estado === 'leyendo' ? 'Se está cargando' : c.estado === 'respondido' ? 'Contestó · falta cargar' : 'Todavía no está en Compras'}</div>
      <div style={cuerpo}>
        {c.estado === 'leyendo' && (
          <div>El sistema lo escribe en Compras con Tipo pago «A rendir» y la obra de la entrega. Cuando la fila exista, el saldo de {e.persona} baja.</div>
        )}
        {motivo && <div>{c.observacion ? 'Se pidió: ' : 'Motivo: '}{motivo}</div>}
        {c.respuesta && <div>Contestó: {c.respuesta}</div>}
        <div>Hasta que la fila exista, sigue contando como no rendido.</div>
      </div>
    </div>
  )
}
