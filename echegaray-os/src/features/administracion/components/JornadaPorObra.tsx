// 19b v2 · EL TITULAR Y LOS GRUPOS DE LA JORNADA — `19b · En obra ahora.dc.html` (56-155).
//
// ═══ POR QUÉ ACÁ SÍ HAY TARJETAS ═══
//
// El criterio 3 del patrón —«sin cajas»— gobierna las TABLAS: una lista de filas comparables no
// necesita marco. Esto no es una tabla: son fichas de persona en una grilla que se lee de un
// vistazo desde el teléfono del jefe, y el mockup las dibuja con borde de 1px y radio 8 (`19b:96`).
// Manda el artboard, y la razón se sostiene: sin marco, dos nombres seguidos en una grilla de
// cuatro columnas no se distinguen como dos personas.
//
// ═══ EL COLOR NUNCA VA SOLO ═══
//
// El punto dice el estado y al lado siempre está la hora o la palabra. Un punto ámbar sin texto es
// exactamente lo que la regla de estados prohíbe.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { PuntoActivo, RelojDeJornada } from './RelojDeJornada'
import { lecturaDePunto, mapa } from '../services/presencia'
import type { GenteEnObra } from '../services/presenciaPorObra'

/** Verde jornada abierta · ámbar entró y no cerró · gris ya cerró o no hay marca. `19b:184`. */
const PUNTO: Record<GenteEnObra['estado'], string> = {
  activo: '#067647',
  falta_salida: '#B54708',
  cerrada: '#C4C2BB',
  sin_registrar: '#C4C2BB',
}

const PALABRA: Record<GenteEnObra['estado'], string> = {
  activo: 'en obra',
  falta_salida: 'sin cerrar',
  cerrada: 'cerró',
  sin_registrar: 'sin marca',
}

export function GrupoDeLaJornada({
  titulo, nota, gente, conteo, fraccion, completo, tono, apagado, verbo, testid,
}: {
  titulo: string
  nota?: string
  gente: GenteEnObra[]
  conteo: string
  /** 0–1. Sólo con denominador real: sin él no se dibuja barra. */
  fraccion?: number
  completo?: boolean
  tono?: 'warn'
  /** El grupo que informa y no reclama: fondo y texto más apagados. */
  apagado?: boolean
  /** El verbo de cada tarjeta cuando el grupo reclama algo (`19b:126`). */
  verbo?: { texto: string; href: string }
  testid?: string
}) {
  const color = tono === 'warn' ? V.warn : V.tinta
  return (
    <section style={{ marginBottom: 20 }} data-testid={testid}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, paddingLeft: 13, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color }}>{titulo}</h2>
        {nota && <span style={{ fontSize: '11.5px', color: V.tenue }}>{nota}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
          {fraccion != null && (
            <span
              aria-hidden
              style={{ display: 'flex', height: 5, width: 110, borderRadius: 3, background: V.lineaFila, overflow: 'hidden' }}
            >
              <span style={{ width: `${Math.round(Math.max(0, Math.min(1, fraccion)) * 100)}%`, background: '#067647', borderRadius: 3 }} />
            </span>
          )}
          <span
            className="font-mono tabular-nums"
            style={{ fontSize: '12px', fontWeight: 600, color: completo ? '#067647' : color }}
          >
            {conteo}
          </span>
        </span>
      </div>

      {gente.length === 0
        ? (
            <p style={{ fontSize: '12px', color: V.tenue, paddingLeft: 13 }} data-testid="grupo-vacio">
              Nadie de esta obra fichó todavía.
            </p>
          )
        : (
            <div className="grid gap-[10px] grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {gente.map((g) => {
                const punto = g.marca ? lecturaDePunto(g.marca) : null
                const enlace = g.marca ? mapa(g.marca.lat, g.marca.lon) : null
                const cuerpo = (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {verbo
                        ? null
                        : g.estado === 'activo'
                          ? <PuntoActivo />
                          : (
                              <span
                                aria-hidden
                                style={{ width: 7, height: 7, borderRadius: 4, background: PUNTO[g.estado], flexShrink: 0 }}
                              />
                            )}
                      <span style={{ flex: 1, minWidth: 0, paddingLeft: verbo ? 4 : 0 }}>
                        <Link
                          href={`/administracion/personas/${g.personaId}`} prefetch={false}
                          className="block truncate hover:underline"
                          style={{ fontSize: '12.5px', fontWeight: apagado ? 400 : 500, color: apagado ? V.apagado : V.tinta }}
                        >
                          {g.nombre}
                        </Link>
                        <span className="block truncate" style={{ fontSize: '11px', color: apagado ? V.lupa : V.tenue, marginTop: 1 }}>
                          {g.rol ?? 'sin categoría'}
                        </span>
                      </span>
                      {/* LA HORA O LA PALABRA, NUNCA EL PUNTO SOLO. Sin marca no se escribe una hora
                          inventada: se dice que no la hay. */}
                      {verbo
                        ? (
                            <Link
                              href={verbo.href} prefetch={false} className="shrink-0"
                              style={{ fontSize: '11.5px', fontWeight: 600, color: V.tinta }}
                            >
                              {verbo.texto} →
                            </Link>
                          )
                        : (
                            <span
                              className={g.entrada ? 'font-mono tabular-nums shrink-0' : 'shrink-0'}
                              style={{ fontSize: '11.5px', color: g.entrada ? V.apagado : V.tenue }}
                            >
                              {g.entrada ?? PALABRA[g.estado]}
                            </span>
                          )}
                    </span>

                    {/* EL RELOJ DE LA JORNADA ABIERTA y DÓNDE ARRANCÓ. El artboard no los dibuja y
                        acá se conservan: el primero es la única forma de ver una jornada de doce
                        horas antes de que se liquide, y el segundo decide discusiones sobre si
                        alguien estaba donde dijo. Un dato inventado se ve igual que uno real. */}
                    {g.marca && (
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '11px', minWidth: 0 }}>
                        {!g.marca.salida && <RelojDeJornada entrada={g.marca.entrada} />}
                        {enlace
                          ? (
                              <a
                                href={enlace} target="_blank" rel="noopener noreferrer"
                                data-testid="ubicacion-marca"
                                className="truncate underline"
                                style={{ color: punto?.fiable ? V.tenue : V.warn }}
                              >
                                Dónde arrancó <span style={{ color: V.lupa }}>· {punto?.texto}</span>
                              </a>
                            )
                          : (
                              <span className="truncate" data-testid="sin-ubicacion" style={{ color: V.lupa }}>
                                {punto?.texto}
                              </span>
                            )}
                      </span>
                    )}
                  </>
                )
                const estilo: React.CSSProperties = {
                  display: 'flex', flexDirection: 'column', gap: 5, borderRadius: 8, padding: '9px 11px',
                  minWidth: 0,
                  border: `1px solid ${tono === 'warn' ? '#F0E1CD' : V.linea}`,
                  background: tono === 'warn' ? '#FDF9F3' : (apagado ? '#FAFAF8' : '#FFFFFF'),
                  boxShadow: tono === 'warn' ? `inset 2px 0 0 ${V.warn}` : undefined,
                }
                return (
                  <div
                    key={g.personaId} data-testid="fila-presencia" data-estado={g.estado}
                    data-persona={g.personaId} style={estilo}
                    className={tono === 'warn' ? 'hover:border-[#E3C99F]' : 'hover:border-[#D7D5CF]'}
                  >
                    {cuerpo}
                  </div>
                )
              })}
            </div>
          )}
    </section>
  )
}
