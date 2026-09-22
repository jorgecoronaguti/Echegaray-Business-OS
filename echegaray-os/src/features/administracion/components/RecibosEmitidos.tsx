'use client'

// LOS RECIBOS EMITIDOS, EN EL LEGAJO DE LA PERSONA — qué se le entregó, y el mismo papel de vuelta.
//
// Dueño, 22/09/2026: *«deben ir guardandose en los legajos correspondientes»*. Esto es ese lado: la lista de
// lo que se aceptó e imprimió —quincena, horas, banco, efectivo, total, quién lo emitió y cuándo— y el botón
// que vuelve a imprimirlo.
//
// ═══ LA REIMPRESIÓN SALE IGUAL PORQUE NO RECALCULA ═══
//
// Dibuja `HojaDelRecibo` con los renglones SELLADOS que trae la base, los mismos que salieron ese día. No
// mira la liquidación de la quincena: si las horas se corrigieron después, el papel que la persona firmó
// sigue diciendo lo que decía. La copia lleva al pie cuándo se emitió el original, para que dos papeles del
// mismo recibo no se lean como dos pagos.
//
// ═══ POR QUÉ ESTÁ EN «RETRIBUCIÓN» Y NO EN «DOCUMENTOS» ═══
//
// Un recibo dice cuánta plata cobró la persona. «Documentos» la abre el jefe de obra —es el legajo de
// papeles: DNI, alta temprana, EPP— y la Liquidación no es suya. «Retribución» ya tiene la puerta correcta
// (`liquidaSueldos`, la misma que cierra el módulo donde se emite), y es la cara de la plata del legajo.
// La tabla de la base lo cierra otra vez con `liquida_sueldos()`, que es la cerradura que vale.

import { useRef, useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import {
  dondeSeFirmo, estaFirmado, lecturaDelCiclo, momentoCorto, sePuedeArchivar, trazoDibujable,
} from '@/shared/recibo/ciclo'
import { archivarRecibo, enviarReciboAFirmar, observarRecibo } from '../services/cicloDelReciboActions'
import { pesos } from './liquidacion/formato'
import {
  HojaDelRecibo, fechaCorta, imprimirHoja, tituloDelRecibo,
} from './liquidacion/cuadro/HojaDelRecibo'
import type { ReciboEnElLegajo } from '../services/reciboEmitido'
import type { RecibosDelLegajo } from '../services/recibosEmitidosService'

const MONO = "'IBM Plex Mono', monospace"
const cifra = (n: number | null): string => (n == null ? '—' : pesos(n))
const horasDichas = (n: number | null): string => (n == null ? '—' : `${String(n).replace('.', ',')} h`)

/** «22/09/2026 14:05». El sello viaja en UTC y se escribe en la hora de San Juan, que es cuando se imprimió. */
function momento(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin fecha'
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function RecibosEmitidos({ datos }: { datos: RecibosDelLegajo }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!datos.puedeVer) return null
  return (
    <section data-testid="recibos-emitidos" style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, marginBottom: 2 }}>Recibos emitidos</h3>
      <p style={{ fontSize: '11.5px', color: V.apagado, marginBottom: 10, maxWidth: 720, lineHeight: 1.5 }}>
        Lo que se aceptó e imprimió desde Liquidación, con las cifras tal como salieron. La reimpresión no
        recalcula: sale el mismo papel. El PDF no queda guardado acá — queda en la máquina de quien imprimió.
      </p>
      {datos.error && (
        <p style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="recibos-emitidos-error">{datos.error}</p>
      )}
      {!datos.error && datos.recibos.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }}>Todavía no se le emitió ningún recibo desde el OS.</p>
      )}
      {datos.recibos.map((r) => (
        <Fila key={r.id} r={r} abierto={abierto === r.id} alternar={() => setAbierto(abierto === r.id ? null : r.id)} />
      ))}
    </section>
  )
}

function Fila({ r, abierto, alternar }: { r: ReciboEnElLegajo; abierto: boolean; alternar: () => void }) {
  const hoja = useRef<HTMLDivElement>(null)
  const [bloqueada, setBloqueada] = useState(false)
  return (
    <div data-testid="recibo-emitido" style={{ borderBottom: `1px solid ${V.lineaFila}`, padding: '10px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px', fontSize: '13px', color: V.tinta }}>
        <span style={{ minWidth: 170 }}>
          {`${fechaCorta(r.quincenaDesde)} al ${fechaCorta(r.quincenaHasta)}`}
          {/* EL ÚLTIMO DE LA QUINCENA. Los anteriores no se esconden: también se entregaron. */}
          {!r.esUltimo && <span style={{ fontSize: '11px', color: V.apagado }}> · anterior</span>}
        </span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{horasDichas(r.horas)}</span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{`banco ${cifra(r.banco)}`}</span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{`efectivo ${cifra(r.efectivo)}`}</span>
        <span style={{ fontFamily: MONO, fontWeight: 600, marginLeft: 'auto' }}>{cifra(r.total)}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 4 }}>
        <span style={{ fontSize: '11px', color: V.tenue }}>
          {`Emitido ${momento(r.emitidoEn)} por ${r.emitidoPor ?? 'sin identificar'}`}
        </span>
        <button type="button" onClick={alternar} data-testid="recibo-ver"
          style={{ border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta, textDecoration: 'underline', cursor: 'pointer' }}>
          {abierto ? 'Ocultar el papel' : 'Ver el papel'}
        </button>
        <button type="button" data-testid="recibo-reimprimir"
          onClick={() => setBloqueada(!imprimirHoja(hoja.current, tituloDelRecibo(r.nombre, r.quincenaDesde, r.quincenaHasta)))}
          style={{ border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta, textDecoration: 'underline', cursor: 'pointer' }}>
          Reimprimir
        </button>
        {bloqueada && (
          <span style={{ fontSize: '11.5px', color: V.warn }} data-testid="recibo-reimprimir-bloqueada">
            El navegador bloqueó la ventana. Permití las ventanas emergentes de app.ecsas.com.ar.
          </span>
        )}
      </div>
      <Ciclo r={r} />
      {/* EL PAPEL SIEMPRE EN EL ÁRBOL Y OCULTO CUANDO NO SE MIRA: `imprimirHoja` copia el HTML de este nodo,
          así que reimprimir sin abrirlo tiene que encontrarlo dibujado. `display: none` no lo quita del DOM. */}
      <div style={{ display: abierto ? 'block' : 'none', marginTop: 12, maxWidth: 640 }}>
        <HojaDelRecibo
          hoja={hoja} nombre={r.nombre} categoria={r.categoria}
          quincena={{ desde: r.quincenaDesde, hasta: r.quincenaHasta }}
          recibo={{ horas: r.renglones.horas, medios: r.renglones.medios, total: r.total }}
          pie={`Copia del recibo emitido el ${momento(r.emitidoEn)}${r.emitidoPor ? ` por ${r.emitidoPor}` : ''}.`}
        />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D13 · EL FIRMADO: VERIFICAR Y ARCHIVAR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Hasta hoy la empresa pagaba la quincena, imprimía un papel y no tenía NINGÚN rastro digital de que alguien
// lo hubiera firmado. Acá se ve quién firmó, cómo y cuándo, y se archiva.
//
// LAS DOS FORMAS CONVIVEN (dueño, 22/09): el trazo del teléfono y la foto del papel firmado entran al mismo
// recibo y ninguna reemplaza a la otra. Se dibujan las dos cuando están las dos.
//
// NADA SE BORRA: archivar no toca el recibo emitido —es la misma fila, con su sello— y una reemisión deja al
// anterior visible, marcado «anterior». Eso es «el emitido queda como versión anterior» del diseño.

/** Lo que se tilda antes de archivar. Es lo que queda guardado en `verificacion`, con estos mismos rótulos. */
const VERIFICACION = [
  'Es el recibo de esta quincena',
  'El importe coincide con el emitido',
  'La firma está en el lugar y se lee',
] as const

const enlace = {
  border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta,
  textDecoration: 'underline', cursor: 'pointer',
} as const

function Ciclo({ r }: { r: ReciboEnElLegajo }) {
  const [tildes, setTildes] = useState<Record<string, boolean>>({})
  const [motivo, setMotivo] = useState('')
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'mal'; texto: string } | null>(null)
  const [pendiente, empezar] = useTransition()
  const lectura = lecturaDelCiclo(r)
  const firma = trazoDibujable(r.trazo)
  const donde = dondeSeFirmo(r)
  const todoTildado = VERIFICACION.every((v) => tildes[v])

  const correr = (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => {
    setAviso(null)
    empezar(async () => {
      const x = await accion()
      setAviso(x.ok
        ? { tono: 'ok', texto: x.mensaje ?? 'Listo.' }
        : { tono: 'mal', texto: x.error ?? 'No se pudo.' })
    })
  }

  return (
    <div data-testid="recibo-ciclo" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '6px 14px', marginTop: 6 }}>
      <span data-testid="recibo-estado" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '12px', color: tono(lectura.tono) }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono(lectura.tono), flexShrink: 0 }} />
        {lectura.rotulo}
        {r.codigo && <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue }}>{r.codigo}</span>}
      </span>

      {/* LA FIRMA, DIBUJADA. Sin verla no se puede verificar que «está en el lugar y se lee»: un control que
          no puede decir que no, no es un control. El SVG NO se inyecta; se dibuja el path (ver `ciclo.ts`). */}
      {firma && (
        <span data-testid="recibo-firma" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox={`0 0 ${firma.ancho} ${firma.alto}`} width={120} height={Math.round(120 * firma.alto / firma.ancho)}
            fill="none" stroke={V.tinta} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
            style={{ display: 'block', background: V.fondo, borderRadius: 4 }} role="img" aria-label="Firma de la persona">
            <path d={firma.d} />
          </svg>
          {donde && <span style={{ fontSize: '11px', color: V.tenue }}>{donde}</span>}
        </span>
      )}

      {r.papelSubidoEn && (
        <span style={{ fontSize: '11px', color: V.tenue }} data-testid="recibo-papel">
          {`Papel firmado ${momentoCorto(r.papelSubidoEn) ?? ''} · `}
          {r.papelUrl
            ? <a href={r.papelUrl} target="_blank" rel="noreferrer" style={{ color: V.tinta, textDecoration: 'underline' }}>ver la foto</a>
            // EL ENLACE NO SALIÓ: se dice. «No hay papel» y «no pude abrirlo» no se dibujan iguales.
            : <span style={{ color: V.warn }}>no pude abrir la foto</span>}
        </span>
      )}

      {r.observacion && (
        <span style={{ fontSize: '11px', color: V.warn }} data-testid="recibo-observacion">{`Observado: ${r.observacion}`}</span>
      )}

      {/* ENVIAR A FIRMAR TAMBIÉN DESDE ACÁ: un recibo emitido a la mañana con «Aceptar e imprimir» no tiene
          por qué volver al cuadro de Liquidación para llegar al teléfono. */}
      {!estaFirmado(r) && r.estado !== 'archivado' && (
        <button type="button" data-testid="recibo-enviar" disabled={pendiente} style={enlace}
          onClick={() => correr(() => enviarReciboAFirmar(r.id))}>
          {r.estado === 'enviado' ? 'Volver a enviarlo a firmar' : 'Enviar a firmar'}
        </button>
      )}

      {sePuedeArchivar(r) && (
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', width: '100%' }}>
          {VERIFICACION.map((v) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11.5px', color: V.tinta, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!tildes[v]} data-testid="recibo-verificar"
                onChange={(e) => setTildes({ ...tildes, [v]: e.target.checked })} style={{ width: 14, height: 14 }} />
              {v}
            </label>
          ))}
          {/* SIN LOS TRES TILDES NO SE ARCHIVA: lo que se archiva se verificó, y lo verificado queda guardado
              con el documento. Un botón que archiva igual convierte la lista en decoración. */}
          <button type="button" data-testid="recibo-archivar" disabled={!todoTildado || pendiente}
            style={{ ...enlace, color: todoTildado ? V.tinta : V.tenue, cursor: todoTildado ? 'pointer' : 'default' }}
            onClick={() => correr(() => archivarRecibo(r.id, tildes))}>
            Archivar firmado
          </button>
        </span>
      )}

      {r.estado !== 'archivado' && (
        pidiendoMotivo ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="recibo-motivo"
              placeholder="Qué no coincide" style={{ fontSize: '12px', padding: '4px 8px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 4, flex: 1, maxWidth: 360 }} />
            <button type="button" data-testid="recibo-observar-confirmar" disabled={!motivo.trim() || pendiente}
              style={{ ...enlace, color: V.warn }} onClick={() => correr(() => observarRecibo(r.id, motivo))}>
              Observar y pedir de nuevo
            </button>
          </span>
        ) : (
          <button type="button" data-testid="recibo-observar" style={{ ...enlace, color: V.warn }}
            onClick={() => setPidiendoMotivo(true)}>
            Observar y pedir de nuevo
          </button>
        )
      )}

      {aviso && (
        <span data-testid={aviso.tono === 'ok' ? 'recibo-ciclo-ok' : 'recibo-ciclo-mal'}
          style={{ width: '100%', fontSize: '11.5px', color: aviso.tono === 'ok' ? V.tinta : V.warn }}>
          {aviso.texto}
        </span>
      )}
    </div>
  )
}

/** El color del punto y del rótulo, por tono. El verde y el rojo son los del sistema, no dos nuevos. */
const tono = (t: 'pos' | 'warn' | 'neg' | 'nulo'): string =>
  t === 'pos' ? V.pos : t === 'neg' ? V.neg : t === 'warn' ? V.warn : V.apagado
