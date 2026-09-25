// D03 · FICHA DE LA ENTREGA — identidad, cuenta, comprobantes, actividad y papeles.
//
// La cuenta sale entera de `efectivo_entrega_saldo` (entregado − rendido − devuelto): la ficha no suma nada
// por su cuenta. «Por imputar» es lo único derivado acá, y es lo que los tickets que todavía no son fila de
// Compras dicen que valen — un observado sigue contando como no rendido hasta que su fila existe.

import Link from 'next/link'
import type { Comprobante, Devolucion, Entrega, Rendicion } from '../types'
import {
  actividadDe, ddmm, ddmmHora, destinoDe, esperando, filasDeLaFicha, numero, pesos, ROTULO_COMPROBANTE, totalLeido,
} from '../logica/entregas'
import { urlEfectivo, urlFilaDeCompras } from '../logica/url'
import type { ExtraDeFicha } from '../services/datos'
import type { EdicionDeFicha } from '../services/edicionDatos'
import { fraseDelCambio, type Nombres } from '../logica/edicion'
import { QuitarAdelanto, ReclamarRendicion, SubirPapel } from './Botones'
import { AvisosDeLaEntrega } from './Edicion'
import { Firma } from './Firma'
import { ALTO_V2, HOVER_FILA } from '@/shared/components/v2/patron'
import { COLOR_TONO, FONDO_OBSERVADO, MONO, V, botonClaro, botonOscuro, cifraFicha, eyebrow, punto } from './estilo'

/**
 * QUÉ PASÓ CON EL ÚLTIMO RECLAMO — dicho por su evidencia, no por la intención.
 *
 * `enviadoEn` viene de `efectivo_aviso_enviado`, que sólo se escribe con el id del post releído de
 * Mattermost. Sin eso el pedido está EN COLA: decir «reclamado» sería afirmar un efecto que no ocurrió.
 */
/** QUÉ LE FALTA AL COMPROBANTE DE DEVOLUCIÓN, dicho en una frase (D06). */
export const ROTULO_FIRMAS: Record<Devolucion['comprobante'], string> = {
  completo: 'comprobante con las dos firmas',
  falta_quien_devolvio: 'falta la firma de quien devolvió',
  falta_quien_recibio: 'falta la firma de quien recibió',
  sin_firmas: 'sin firmar',
}

export function textoDelReclamo(r: { pedidoEn: string; enviadoEn: string | null } | null): string | null {
  if (!r) return null
  return r.enviadoEn ? `Reclamado por el canal el ${ddmmHora(r.enviadoEn)}` : 'Reclamo en cola: todavía no salió al canal'
}

const COLUMNAS = '72px minmax(0,1.4fr) minmax(0,1fr) 120px 140px'
/** La columna del «Editar» de cada fila (25/09/2026): la acción al lado del objeto. */
const ANCHO_EDITAR = 52
/** El círculo con las iniciales de la ficha (`D03`): un tamaño de ícono, no un alto de fila. */
const AVATAR = 44

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export function FichaEntrega({ e, comprobantes, rendiciones, devoluciones, extra, cliente, puedeImputar = false, edicion, nombres }: {
  e: Entrega
  comprobantes: Comprobante[]
  rendiciones: Rendicion[]
  devoluciones: Devolucion[]
  extra: ExtraDeFicha
  cliente: string | null
  /** Dirección o Administración: ven «Imputar un comprobante ya cargado» (24/09/2026). */
  puedeImputar?: boolean
  /** Avisos y bitácora (migración 20260925T1200). */
  edicion: EdicionDeFicha
  /** Para decir la bitácora con nombres: id → nombre de persona, de obra y código de entrega. */
  nombres: { personas: Record<string, string>; obras: Record<string, string>; entregas: Record<string, string> }
}) {
  const destino = destinoDe(e, cliente)
  const nombreDestino = e.estructura ? 'Estructura' : destino.linea
  const pendientes = comprobantes.filter(esperando)
  const porImputar = pendientes.reduce((s, c) => s + (totalLeido(c) ?? 0), 0)
  const filas = filasDeLaFicha(comprobantes, rendiciones, extra.compras)
  const abierta = e.estado === 'abierta'
  const esPrueba = e.es_prueba === true
  const primero = pendientes.at(-1) ?? null
  // DESDE EL 25/09/2026 ANULAR, REABRIR, CERRAR Y BORRAR VIVEN EN «EDITAR» (dueño: «todo editable»): un
  // solo lugar para cambiar la entrega, en cualquier estado, con su bitácora.
  const n: Nombres = {
    persona: (id) => nombres.personas[id] ?? null,
    obra: (id) => nombres.obras[id] ?? null,
    entrega: (id) => nombres.entregas[id] ?? null,
  }
  const cambios = edicion.cambios
    .map((c) => ({ c, frase: fraseDelCambio(c, n) }))
    .filter((x): x is { c: typeof x.c; frase: string } => x.frase != null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }} data-testid="ficha-entrega" data-codigo={e.codigo}>
      {/* LO PRIMERO QUE SE LEE. Una prueba que se confunde con una entrega real ensucia el número de
          plata en la calle que alguien va a mirar para decidir. */}
      {esPrueba && (
        <div
          data-testid="ficha-es-prueba"
          style={{
            border: `1px solid ${V.warn}`, borderRadius: 10, padding: '10px 14px', background: '#FDF6EE',
            fontSize: '12.5px', color: V.warn, lineHeight: 1.45,
          }}
        >
          <strong>Esta entrega es una prueba.</strong> No sale de la CAJA, sus tickets no se cargan en
          Compras, y se puede borrar entera.
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" style={{ columnGap: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div style={{
            width: AVATAR, height: AVATAR, borderRadius: '50%', background: '#EFEEEA', color: V.tintaSuave, fontSize: '14px',
            fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {iniciales(e.persona)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontSize: '21px', fontWeight: 600, letterSpacing: '-.015em' }}>{e.codigo} · {e.persona}</div>
            <div style={{ fontSize: '13px', color: V.apagado }}>
              {pesos(e.entregado)} entregados el {ddmm(e.fecha)}{extra.entregadaPor ? ` por ${extra.entregadaPor}` : ''}
              {' · '}{nombreDestino}{destino.bajada ? ` · ${destino.bajada}` : ''}
              {' · '}
              {e.conformidad_en
                ? <span style={{ color: V.pos }}>conformidad firmada {ddmmHora(e.conformidad_en)}</span>
                : e.conformidad
                  ? <span style={{ color: V.pos }}>conformidad en papel</span>
                  : <span style={{ color: V.warn }}>sin conformidad</span>}
              {e.estado !== 'abierta' && <span> · {e.estado === 'cerrada' ? `cerrada ${ddmm(e.cerrada_en)}` : 'anulada'}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link href={urlEfectivo({ entrega: e.codigo, panel: 'editar' })} prefetch={false} scroll={false} style={botonClaro} data-testid="abrir-editar">
            Editar
          </Link>
          {abierta && <>
            <ReclamarRendicion entrega={e.id} ultimo={textoDelReclamo(extra.reclamo)} />
            {/* EL TICKET QUE ENTRÓ COMO COMPRA COMÚN (24/09/2026): pagado con esta plata pero cargado en
                «Efectivo» por #comprobantes-gastos. Se corrige desde acá, no a mano en el Sheet. */}
            {puedeImputar && (
              <Link href={urlEfectivo({ entrega: e.codigo, panel: 'imputar' })} prefetch={false} scroll={false} style={botonClaro} data-testid="abrir-imputar">
                Imputar un comprobante ya cargado
              </Link>
            )}
            <Link href={urlEfectivo({ entrega: e.codigo, panel: 'devolucion' })} prefetch={false} scroll={false} style={botonClaro} data-testid="abrir-devolucion">
              Registrar devolución
            </Link>
            {primero && (
              <Link href={urlEfectivo({ entrega: e.codigo, comprobante: primero.id })} prefetch={false} style={botonOscuro} data-testid="revisar-comprobantes">
                Revisar comprobantes
                <span style={{ fontFamily: MONO, fontSize: '11px', color: V.marca }}>{pendientes.length}</span>
              </Link>
            )}
          </>}
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-5 md:grid-cols-5"
        style={{ columnGap: 30, padding: '18px 0', borderTop: `1px solid ${V.linea}`, borderBottom: `1px solid ${V.linea}` }}
        data-testid="ficha-cuenta"
      >
        <Cifra rotulo="Entregado" valor={pesos(e.entregado)} />
        <Cifra rotulo="Rendido" valor={pesos(e.rendido)} color={V.tintaSuave} bajada={`${e.filas_rendidas} ${e.filas_rendidas === 1 ? 'fila' : 'filas'} de Compras`} />
        <Cifra rotulo="Devuelto" valor={e.devuelto > 0 ? pesos(e.devuelto) : 'sin devoluciones'} color={e.devuelto > 0 ? V.tinta : V.tenue} />
        <Cifra rotulo="En su poder" valor={pesos(e.en_su_poder)} color={e.en_su_poder < 0 ? V.warn : V.tinta} />
        <Cifra
          rotulo="Por imputar" valor={pendientes.length ? pesos(porImputar) : 'nada'} color={pendientes.length ? V.warn : V.tenue}
          bajada={pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? 'comprobante' : 'comprobantes'}` : undefined} bajadaColor={V.warn}
        />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" style={{ columnGap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Comprobantes de esta entrega</div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: 560 + ANCHO_EDITAR }}>
              <div style={{ display: 'grid', gridTemplateColumns: `${COLUMNAS} ${ANCHO_EDITAR}px`, gap: 16, height: 32, alignItems: 'center', borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow }}>
                <div>Fecha</div><div>Proveedor</div><div>Rubro</div><div style={{ textAlign: 'right' }}>Importe</div><div>Estado</div><div />
              </div>
              {filas.map((f, i) => {
                const r = ROTULO_COMPROBANTE[f.estado]
                const href = f.comprobante ? urlEfectivo({ entrega: e.codigo, comprobante: f.comprobante.id }) : f.fila ? urlFilaDeCompras(f.fila) : null
                const contenido = (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{ddmm(f.fecha)}</div>
                    <div className="truncate" style={{ color: f.proveedor ? V.tinta : V.warn }}>{f.proveedor ?? 'ticket sin proveedor legible'}</div>
                    <div className="truncate" style={{ color: f.rubro ? V.apagado : V.tenue }}>{f.rubro ?? 'sin rubro'}</div>
                    <div style={{ textAlign: 'right', fontFamily: MONO }}>{f.importe != null ? numero(f.importe) : '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: COLOR_TONO[r.tono] }}>
                      {r.tono !== 'apagado' && <span style={punto(r.tono)} />}{r.texto}
                    </div>
                  </>
                )
                const estilo = {
                  display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, minHeight: ALTO_V2.cara, alignItems: 'center', fontSize: '13.5px',
                } as const
                const item = f.comprobante?.id ?? f.rendicion?.id ?? null
                return (
                  <div
                    key={f.comprobante?.id ?? f.rendicion?.id ?? `r${i}`}
                    style={{
                      display: 'grid', gridTemplateColumns: `minmax(0,1fr) ${ANCHO_EDITAR}px`, gap: 16, alignItems: 'center',
                      borderBottom: i < filas.length - 1 ? `1px solid ${V.lineaFila}` : undefined,
                      background: f.estado === 'observado' ? FONDO_OBSERVADO : undefined,
                    }}
                  >
                    {href
                      ? <Link href={href} prefetch={false} className={HOVER_FILA} style={estilo} data-testid="fila-comprobante" data-estado={f.estado}>{contenido}</Link>
                      // EL ADELANTO DE SUELDO (20260925T1100) se quita de Liquidación desde su fila, con motivo.
                      : <div style={f.adelanto && abierta ? { ...estilo, gridTemplateRows: 'auto auto', paddingBottom: 6 } : estilo} data-testid="fila-comprobante" data-estado={f.estado}>
                          {contenido}
                          {f.adelanto && abierta && <div style={{ gridColumn: '2 / -1' }}><QuitarAdelanto rendicion={f.adelanto} /></div>}
                        </div>}
                    {item && (
                      <Link
                        href={urlEfectivo({ entrega: e.codigo, panel: 'editar-comprobante', item })} prefetch={false} scroll={false}
                        style={{ fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2 }} data-testid="editar-fila"
                      >
                        Editar
                      </Link>
                    )}
                  </div>
                )
              })}
              {!filas.length && (
                <div style={{ padding: '18px 0', fontSize: '12.5px', color: V.apagado }}>Todavía no mandó ningún comprobante.</div>
              )}
            </div>
          </div>
          {filas.length > 0 && (
            <div style={{ fontSize: '12.5px', color: V.apagado }}>
              {filas.length} {filas.length === 1 ? 'comprobante' : 'comprobantes'} · lo que está «En Compras» ya es gasto de {nombreDestino} y se lee en su economía.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Actividad</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: '12.5px' }} data-testid="ficha-actividad">
              {actividadDe({ entrega: e, creadaEn: extra.creadaEn, entregadaPor: extra.entregadaPor, comprobantes, rendiciones, devoluciones })
                .map((ev, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '82px minmax(0,1fr)', gap: 14 }}>
                    <div style={{ color: V.tenue, fontFamily: MONO, fontSize: '11.5px' }}>{ddmmHora(ev.en)}</div>
                    <div style={{ color: V.tintaSuave }}>{ev.texto}</div>
                  </div>
                ))}
            </div>
          </div>
          <Papeles
            e={e} papelUrl={extra.papelUrl} trazo={extra.trazo} firmas={extra.firmas} fotos={comprobantes.filter((c) => c.storage_path).length}
            destino={nombreDestino} devoluciones={devoluciones}
          />
          <AvisosDeLaEntrega avisos={edicion.avisos} />
          {cambios.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-cambios">
              <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Cambios</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: '12.5px' }}>
                {cambios.slice(0, 30).map(({ c, frase }) => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '82px minmax(0,1fr)', gap: 14 }}>
                    <div style={{ color: V.tenue, fontFamily: MONO, fontSize: '11.5px' }}>{ddmmHora(c.en)}</div>
                    <div style={{ color: V.tintaSuave }}>{c.autorNombre ?? 'el sistema'} {frase}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {edicion.error && <div style={{ fontSize: '12px', color: V.warn }}>No pude leer los avisos o los cambios: {edicion.error}</div>}
          {e.estado === 'anulada' && e.anulada_motivo && (
            <div style={{ fontSize: '12.5px', color: V.apagado }}>Anulada: {e.anulada_motivo}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cifra({ rotulo, valor, bajada, color, bajadaColor }: { rotulo: string; valor: string; bajada?: string; color?: string; bajadaColor?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...cifraFicha, color: color ?? V.tinta }}>{valor}</div>
      {bajada && <div style={{ fontSize: '12px', color: bajadaColor ?? V.apagado }}>{bajada}</div>}
    </div>
  )
}

/**
 * PAPELES (D03) — la conformidad, las fotos, la rendición cerrada y DÓNDE cuelgan.
 *
 * ═══ POR QUÉ LA ETIQUETA NO DICE «DRIVE» ═══
 *
 * El diseño rotula las dos primeras filas con «Drive». Hoy esos archivos viven en el bucket privado
 * `comprobantes` de Supabase, no en Drive: escribir «Drive» al lado de un archivo que no está en Drive
 * sería afirmar un hecho falso sobre dónde buscarlo, que es exactamente para lo que sirve esa columna.
 * Se rotula la fuente REAL y la ruta de la obra se dice como la dice el diseño. El archivado en la
 * carpeta de la obra lo tiene que hacer el orquestador (la web no tiene credenciales de Google).
 */
function Papeles({ e, papelUrl, trazo, firmas, fotos, destino, devoluciones }: {
  e: Entrega; papelUrl: string | null; trazo: string | null; firmas: ExtraDeFicha['firmas']; fotos: number; destino: string; devoluciones: Devolucion[]
}) {
  // Ritmo de panel: «Papeles» es la columna lateral de la ficha, no una tabla de datos; el diseño (D03) la
  // dibuja a 42 y crece con el botón de subir el papel.
  const fila = { minHeight: 42, display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px' } as const
  const fuente = { marginLeft: 'auto', fontSize: '11.5px', color: V.tenue, whiteSpace: 'nowrap' } as const
  const cerrada = e.estado === 'cerrada'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-papeles">
      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Papeles</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...fila, borderBottom: `1px solid ${V.lineaFila}` }}>
          {e.conformidad ? (
            <>
              <span>Conformidad {e.codigo} firmada{e.conformidad_en ? ' en el teléfono' : ' en papel'}</span>
              {papelUrl
                ? <a href={papelUrl} target="_blank" rel="noreferrer" style={{ ...fuente, textDecoration: 'underline' }}>ver el papel</a>
                : <span style={fuente}>firma en la app</span>}
            </>
          ) : (
            <>
              <span style={{ color: V.warn }}>Conformidad sin firmar</span>
              {e.estado !== 'anulada' && <span style={{ marginLeft: 'auto' }}><SubirPapel entrega={e.id} /></span>}
            </>
          )}
        </div>
        {/* LA FIRMA SE VE (dueño, 23/09/2026): el trazo que dibujó en el teléfono, con fecha y hora. */}
        {trazo && (
          <div style={{ padding: '8px 0 10px', borderBottom: `1px solid ${V.lineaFila}` }}>
            <Firma svg={trazo} rotulo={`Conformidad · ${e.persona}${e.conformidad_en ? ` · ${ddmmHora(e.conformidad_en)}` : ''}`} testid="firma-conformidad" />
          </div>
        )}
        <div style={{ ...fila, borderBottom: `1px solid ${V.lineaFila}`, color: fotos ? V.tinta : V.tenue }}>
          <span>{fotos} {fotos === 1 ? 'foto' : 'fotos'} de comprobantes</span>
          {fotos > 0 && <span style={fuente}>bucket comprobantes</span>}
        </div>
        {/* EL COMPROBANTE DE DEVOLUCIÓN Y SUS DOS FIRMAS (D06). Lo que falta lo dice la base
            (`efectivo_devolucion_estado.comprobante`), no una suma de booleanos hecha acá. */}
        {devoluciones.map((d) => (
          <div key={d.id} style={{ ...fila, borderBottom: `1px solid ${V.lineaFila}` }} data-testid="papel-devolucion" data-estado={d.comprobante}>
            <span style={{ color: d.comprobante === 'completo' ? V.tinta : V.warn }}>
              Devolución {pesos(d.monto)} del {ddmm(d.fecha)} · {ROTULO_FIRMAS[d.comprobante]}
            </span>
            <span style={fuente}>{d.recibe ?? 'sin quien la recibió'}</span>
            <Link
              href={urlEfectivo({ entrega: e.codigo, panel: 'editar-devolucion', item: d.id })} prefetch={false} scroll={false}
              style={{ fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2, flexShrink: 0 }} data-testid="editar-devolucion"
            >
              Editar
            </Link>
          </div>
        ))}
        {devoluciones.map((d) => {
          const f = firmas.get(d.id)
          if (!f?.entrega && !f?.recibe) return null
          return (
            <div key={`firmas-${d.id}`} style={{ display: 'flex', gap: 16, padding: '8px 0 10px', borderBottom: `1px solid ${V.lineaFila}` }}>
              <Firma svg={f.entrega} rotulo={`Devolvió · ${e.persona}`} testid="firma-devolvio" />
              <Firma svg={f.recibe} rotulo={`Recibió · ${d.recibe ?? 'Administración'}`} testid="firma-recibio" />
            </div>
          )
        })}
        {/* LA RENDICIÓN CERRADA: el diseño la dibuja apagada hasta que existe. Mientras la entrega está
            abierta no hay nada que cerrar, y una vez cerrada el papel todavía no lo genera nadie: se
            dice así, no se dibuja un enlace que no lleva a ningún lado. */}
        <div style={{ ...fila, color: V.tenue }} data-testid="papel-rendicion-cerrada">
          <span>Rendición cerrada — {cerrada ? 'sin generar' : 'la entrega sigue abierta'}</span>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }} data-testid="papeles-ruta">
        Cuelgan de la obra, como el resto:{' '}
        <span style={{ fontFamily: MONO, fontSize: '11.5px' }}>{destino} / Rendiciones / {e.codigo}</span>
      </div>
    </div>
  )
}
