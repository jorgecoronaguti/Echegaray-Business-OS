// «MÁS → RECIBOS» — el recibo de sueldo de cada persona en la quincena elegida, y el banco del cuadro.
//
// Dueño, 14/09/2026: *«la sección recibos de liquidación de hs no está mejorada, rota»*. Lo que pide:
// ver y abrir el recibo de sueldo de cada persona. Estaba roto de tres maneras, medidas en la base:
//
//   · buscaba el giro con el concepto «sueldo», que no existe: todo el plantel «sin movimiento»
//     mientras el cuadro lo daba por pagado;
//   · decía que no había recibos (botón apagado, «sin infraestructura») cuando hay cientos de PDF en
//     `documentacion_legajo`;
//   · cortaba cada lista en 8 o 6 personas.
//
// ═══ UN SOLO «BANCO» ═══
//
// La plata sale de `getLiquidacionDeLaQuincena`, la misma lectura del cuadro: recibo del estudio,
// banco, giro y 50/50 acordado. El pie por banco es el mismo número que el pie del cuadro, con el
// mismo recorte «Cobra» y el mismo buscador (`recorteDeLiquidacion.ts`).
//
// ═══ TODOS LOS RECIBOS SE ABREN ═══
//
// Los recibos de personas que no tienen línea en el cuadro de la quincena (bajas, finales) van en su
// propia sección: la captura del 14/09 mostraba 14 enlaces de 19 PDF.
//
// ═══ NO SE QUITA NADA (dueño) ═══
//
// Retribución y Ausencias siguen, completas, debajo de la tabla. La retribución se edita en el cuadro
// de la quincena ($/h en la celda).

import type { ReactNode } from 'react'
import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { getAusenciasDeLaQuincena, getEslabonesDeLaQuincena } from '../../../services/eslabonesLegajoService'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { getRecibosDeSueldoDelAnio } from '../../../services/recibosDeSueldoService'
import {
  archivosDeLaQuincena, avisoDeRecibos, filasDeRecibos, recibosFueraDelCuadro, totalesDeRecibos,
  type EstadoDeRecibo, type FilaDeRecibo,
} from '../../../services/recibosDeLaQuincena'
import { RECORTES, recortar, recortePedido } from '../../../services/recorteDeLiquidacion'
import { motivoDe as motivoDelCatalogo } from '../../../../../../orquestador/lib/asistencia-motivos.mjs'
import { PAGA_POR_MOTIVO } from '../../../services/liquidacionDeAusencias'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { FiltrosDelEspejo } from '../cuadro/FiltrosDelEspejo'
import { pesos } from '../formato'
import { ALTO_LIQ, Cuadro, Cuerpo, Encabezado, Fila, Hueco, MARCO_SCROLL, MONO, Total } from './tabla'
import type { PropsDeSolapa } from './index'

const etiquetaDeMotivo = (clave: string | null | undefined): string => {
  const m = motivoDelCatalogo(clave) as { etiqueta?: unknown } | null
  return typeof m?.etiqueta === 'string' ? m.etiqueta : (clave?.trim() ?? '')
}

const COLS = 'minmax(230px,1fr) 128px 128px 112px 128px 150px 112px'
const COLS_FUERA = 'minmax(230px,1fr) 112px'
const COLS_RET = 'minmax(230px,1fr) 140px minmax(160px,1fr)'
const COLS_AUS = '86px minmax(200px,1fr) 200px'

const ESTADO: Record<EstadoDeRecibo, { texto: string; color: string }> = {
  'girado': { texto: 'girado', color: '#067647' },
  'recibo-sin-giro': { texto: 'recibo sin giro', color: V.warn },
  'sin-importe': { texto: '—', color: V.tenue },
  'sin-recibo': { texto: '—', color: V.tenue },
  'sin-extracto': { texto: 'sin extracto', color: V.tenue },
}

const urlDelPdf = (id: string): string => `https://drive.google.com/file/d/${id}/view`

/** Las quincenas del año hasta la mirada (o hasta hoy), para el selector. */
function quincenasDelAnio(q: Quincena, hoy: string): Quincena[] {
  const hasta = quincenaDe(hoy).desde > q.desde ? quincenaDe(hoy) : q
  const out: Quincena[] = []
  for (let x = quincenaDe(`${q.desde.slice(0, 4)}-01-01`); x.desde <= hasta.desde; x = correrQuincena(x, 1)) out.push(x)
  return out.reverse()
}

/** Una tabla que se recorre en horizontal DENTRO de su cuadro: a 390 px la página no se desborda. */
const ConScroll = ({ ancho, children }: { ancho: number; children: ReactNode }) => (
  <div style={{ ...MARCO_SCROLL, maxWidth: '100%' }}>
    <div style={{ minWidth: ancho }}>{children}</div>
  </div>
)

export async function SolapaRecibos({ quincenaPedida, hoy, parametros = {}, hrefDe }: Partial<PropsDeSolapa> & { hoy: string }) {
  const q = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  const supabase = await createClient()
  const [liquidacion, eslabones, recibos] = await Promise.all([
    getLiquidacionDeLaQuincena(supabase, q),
    getEslabonesDeLaQuincena(supabase, q),
    getRecibosDeSueldoDelAnio(supabase, q.desde.slice(0, 4)),
  ])
  const ausencias = await getAusenciasDeLaQuincena(
    supabase, q, new Map(eslabones.personas.map((p) => [p.personaId, p.nombre])),
  )

  const grupo = recortePedido(parametros.grupo)
  const lineas = liquidacion.cuadros.flatMap((c) => c.lineas.map((linea) => ({ grupo: c.grupo, nombre: linea.nombre, linea })))
  const visibles = recortar(lineas, grupo, parametros.buscar)
  const filas = filasDeRecibos(visibles, { hayExtracto: eslabones.hayExtracto, archivos: archivosDeLaQuincena(recibos.docs, q) })
  // FUERA DEL CUADRO SE CALCULA CONTRA TODAS LAS LÍNEAS, no las recortadas: quien está en el cuadro pero
  // no pasa el filtro no es «fuera del cuadro».
  const fuera = recibosFueraDelCuadro(recibos.docs, q, new Set(lineas.map((l) => l.linea.personaId)))
  const totales = totalesDeRecibos(filas)
  const aviso = fuera.length === 0 ? avisoDeRecibos(filas, rotuloQuincena(q)) : null
  const errores = [
    ...liquidacion.errores, ...eslabones.errores,
    ...(recibos.error ? [{ que: 'los recibos de sueldo del legajo', error: recibos.error }] : []),
  ]
  const enlace = (cambios: Record<string, string | undefined>) => (hrefDe ? hrefDe(cambios) : '#')

  return (
    <section data-testid="pantalla-recibos">
      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 8 }}>
          <Aviso tono="neg" testid="recibos-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingBottom: 8 }}>
        <form method="get" data-testid="recibos-quincena" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="hidden" name="vista" value="liquidacion" />
          <input type="hidden" name="solapa" value="recibos" />
          {grupo !== 'todos' && <input type="hidden" name="grupo" value={grupo} />}
          <span style={{ fontSize: '12px', fontWeight: 600, color: V.tintaSuave }}>Quincena</span>
          <select name="quincena" defaultValue={q.desde} aria-label="Quincena"
            style={{ height: 32, maxWidth: '100%', padding: '0 8px', borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, fontSize: '12.5px', background: '#FFFFFF' }}>
            {quincenasDelAnio(q, hoy).map((x) => (
              <option key={x.desde} value={x.desde}>
                {`${rotuloQuincena(x)} · ${archivosDeLaQuincena(recibos.docs, x).size} recibos`}
              </option>
            ))}
          </select>
          <button type="submit" style={{
            height: 32, padding: '0 12px', borderRadius: 6, border: 0, background: V.grafito, color: '#FFFFFF',
            fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
          }}>Ver</button>
        </form>
        <FiltrosDelEspejo
          periodos={[]}
          grupos={RECORTES.map((r) => ({
            texto: r.texto, activo: grupo === r.clave,
            href: enlace({ grupo: r.clave === 'todos' ? undefined : r.clave }),
          }))}
          busqueda={{
            valor: parametros.buscar ?? '',
            ocultos: { vista: 'liquidacion', solapa: 'recibos', quincena: q.desde, ...(grupo === 'todos' ? {} : { grupo }) },
            limpiar: parametros.buscar ? enlace({ buscar: undefined }) : null,
          }}
        />
      </div>

      {aviso && (
        <div style={{ paddingBottom: 12 }}>
          <Aviso tono="warn" testid="recibos-aviso" titulo={aviso}>{null}</Aviso>
        </div>
      )}

      <Cuadro testid="cuadro-recibos">
        <ConScroll ancho={1100}>
          <Cuerpo>
            <Encabezado columnas={COLS} celdas={['Persona', 'Recibo del estudio', 'Banco (cuadro)', 'Diferencia', 'Extracto', '50/50 acordado', 'PDF']} />
            {filas.map((f) => <FilaDeRecibos key={f.personaId} f={f} />)}
            <Total columnas={COLS} testid="recibos-total" celdas={[
              `${totales.personas} persona${totales.personas === 1 ? '' : 's'} · ${totales.conRecibo} con recibo`,
              pesos(totales.recibos),
              <span key="b" data-testid="recibos-total-banco">{pesos(totales.porBanco)}</span>,
              '',
              eslabones.hayExtracto
                ? <span key="s" style={{ color: totales.sinGiro > 0 ? V.warn : V.tinta }}>{totales.sinGiro > 0 ? `sin giro ${pesos(totales.sinGiro)}` : 'todo girado'}</span>
                : <Hueco key="s">sin extracto</Hueco>,
              '',
              `${totales.conPdf + fuera.length} PDF`,
            ]} />
          </Cuerpo>
        </ConScroll>
      </Cuadro>

      {fuera.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Cuadro testid="cuadro-recibos-fuera">
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{`Con recibo, fuera del cuadro de esta quincena · ${fuera.length}`}</span>
            <ConScroll ancho={360}>
              <Cuerpo>
                <Encabezado columnas={COLS_FUERA} celdas={['Persona (según el archivo)', 'PDF']} />
                {fuera.map((r) => (
                  <Fila key={r.personaId} columnas={COLS_FUERA} alto={ALTO_LIQ.filaAngosta} testid={`recibo-fuera-${r.personaId}`} celdas={[
                    <Nombre key="n">{r.nombre}</Nombre>,
                    <a key="p" href={urlDelPdf(r.driveFileId)} target="_blank" rel="noreferrer"
                      data-testid={`ver-recibo-${r.personaId}`} style={{ fontSize: '12px', color: V.tinta }}>Ver recibo ↗</a>,
                  ]} />
                ))}
              </Cuerpo>
            </ConScroll>
          </Cuadro>
        </div>
      )}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: V.tinta, padding: '8px 0' }}>
          {`Retribución · ${eslabones.personas.length} personas · se edita en el cuadro de la quincena`}
        </summary>
        <Cuadro testid="cuadro-retribucion">
          <ConScroll ancho={560}>
            <Cuerpo>
              <Encabezado columnas={COLS_RET} celdas={['Persona', 'Retribución', 'Origen']} />
              {eslabones.personas.map((p) => (
                <Fila key={p.personaId} columnas={COLS_RET} alto={ALTO_LIQ.filaAngosta} testid={`retribucion-${p.personaId}`} celdas={[
                  <Nombre key="n">{p.nombre}</Nombre>,
                  p.valorHora != null ? `${pesos(p.valorHora)}/h`
                    : p.netoMensual != null ? `${pesos(p.netoMensual)} /mes` : <Hueco key="r">sin retribución</Hueco>,
                  <Hueco key="o"><span style={{ fontSize: '10.5px' }}>{p.origenTarifa ?? 'sin origen'}</span></Hueco>,
                ]} />
              ))}
            </Cuerpo>
          </ConScroll>
        </Cuadro>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: V.tinta, padding: '8px 0' }}>
          {`Ausencias de la quincena · ${ausencias.length}`}
        </summary>
        <Cuadro testid="cuadro-ausencias">
          <ConScroll ancho={520}>
            <Cuerpo>
              <Encabezado columnas={COLS_AUS} celdas={['Día', 'Persona', 'Motivo']} />
              {ausencias.length === 0 && (
                <Fila columnas={COLS_AUS} alto={ALTO_LIQ.renglon} tenue celdas={[`Sin ausencias declaradas en ${rotuloQuincena(q)}.`, '', '']} />
              )}
              {ausencias.map((a) => {
                const paga = a.motivo ? PAGA_POR_MOTIVO[a.motivo.trim()]?.paga === true : false
                return (
                  <Fila key={`${a.personaId}-${a.fecha}`} columnas={COLS_AUS} alto={ALTO_LIQ.filaAngosta}
                    testid={`ausencia-${a.personaId}-${a.fecha}`} celdas={[
                      <span key="f" style={{ fontFamily: MONO, fontSize: '11.5px' }}>{a.fecha.slice(8, 10)}/{a.fecha.slice(5, 7)}</span>,
                      <Nombre key="n">{a.nombre}</Nombre>,
                      <span key="m" style={{ color: paga ? V.apagado : V.neg, fontSize: '11.5px' }}>
                        {a.motivo?.trim() ? etiquetaDeMotivo(a.motivo) : 'sin motivo'} · {paga ? 'paga' : '0 h'}
                      </span>,
                    ]} />
                )
              })}
            </Cuerpo>
          </ConScroll>
          <TablaDeMotivos />
        </Cuadro>
      </details>
    </section>
  )
}

/** Una persona: su recibo, el banco del cuadro, la diferencia, el giro, lo acordado y el PDF. Nunca $0. */
function FilaDeRecibos({ f }: { f: FilaDeRecibo }) {
  const estado = ESTADO[f.estado]
  return (
    <Fila columnas={COLS} alto={ALTO_LIQ.filaAngosta} testid={`recibo-${f.personaId}`} celdas={[
      <Nombre key="n">{f.nombre}</Nombre>,
      f.reciboNeto != null ? pesos(f.reciboNeto)
        : <Hueco key="r">{f.driveFileId ? 'sin importe publicado' : 'sin recibo del estudio'}</Hueco>,
      pesos(f.porBanco),
      f.diferencia == null ? <Hueco key="d" />
        : <span key="d" style={{ color: Math.abs(f.diferencia) > 1 ? V.neg : V.apagado }}>{Math.abs(f.diferencia) > 1 ? pesos(f.diferencia) : '0'}</span>,
      <span key="e" style={{ fontSize: '11.5px', color: estado.color }}>{estado.texto}</span>,
      f.blancoAcuerdo != null ? <span key="a" style={{ color: V.apagado }}>{pesos(f.blancoAcuerdo)}</span> : <Hueco key="a" />,
      f.driveFileId
        ? <a key="p" href={urlDelPdf(f.driveFileId)} target="_blank" rel="noreferrer"
          data-testid={`ver-recibo-${f.personaId}`} style={{ fontSize: '12px', color: V.tinta }}>Ver recibo ↗</a>
        : <Hueco key="p"><span style={{ fontSize: '11.5px' }}>sin PDF</span></Hueco>,
    ]} />
  )
}

/** La tabla literal de `PAGA_POR_MOTIVO`, generada de la constante y no tipeada. */
function TablaDeMotivos() {
  const pagan = Object.entries(PAGA_POR_MOTIVO).filter(([, r]) => r.paga).map(([m]) => etiquetaDeMotivo(m).toLowerCase())
  const noPagan = Object.entries(PAGA_POR_MOTIVO).filter(([, r]) => !r.paga).map(([m]) => etiquetaDeMotivo(m).toLowerCase())
  return (
    <p data-testid="tabla-motivos" style={{ margin: 0, fontSize: '11px', color: V.apagado, lineHeight: 1.55 }}>
      <strong style={{ color: '#067647', fontWeight: 600 }}>Pagan</strong> {pagan.join(', ')}.{' '}
      <strong style={{ color: V.neg, fontWeight: 600 }}>No pagan</strong> {noPagan.join(', ')} y{' '}
      <strong style={{ color: V.neg, fontWeight: 600 }}>sin motivo</strong>.
    </p>
  )
}

/** El nombre, recortado con «…» y entero en el `title`. */
const Nombre = ({ children }: { children: ReactNode }) => (
  <span title={typeof children === 'string' ? children : undefined}
    style={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {children}
  </span>
)
