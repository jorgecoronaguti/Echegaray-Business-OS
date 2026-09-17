'use client'

// LA SOLAPA «RETRIBUCIÓN» DE PERSONAL — el plantel entero en una tabla. Dueño, 17/09/2026.
//
// Una fila por persona: $/h negro y $/h recibo vigentes, una columna por quincena del año (el mensual ocupa
// las dos de su mes) y el total. Tocar el nombre abre el panel con la sección «Retribución» de su legajo
// —el MISMO componente, con los mismos datos— sin salir de la tabla: comparar dos personas es abrir y
// cerrar, no ir y volver.
//
// ═══ LA DENSIDAD ES LA DEL CUADRO DE LIQUIDACIÓN ═══
//
// Nombre fijo a la izquierda (`COLUMNA_FIJA`), scroll horizontal DENTRO del marco (`MARCO_SCROLL`), números
// monoespaciados a la derecha, rótulos de columna en versalita mono. Sin tarjetas: dieciocho quincenas por
// treinta personas son quinientos números y sólo una grilla los deja comparar en vertical.
//
// ═══ «PAGADO» Y «LIQUIDADO» NO SE MEZCLAN EN UNA CELDA ═══
//
// Mientras las quincenas viejas no tengan sus pagos cargados, lo pagado es mucho menos que lo liquidado. Una
// celda que mostrara uno u otro según haya dato diría dos cosas distintas con el mismo formato. Se elige la
// medida arriba y la tabla entera habla de esa.
//
// LA REGLA NO ESTÁ ACÁ: este archivo pinta lo que `retribucionDelPlantel.ts` ya armó.

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { RetribucionDelLegajo } from './RetribucionDelLegajo'
import { pesos } from './liquidacion/formato'
import { CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, MONO } from './liquidacion/solapas/tabla'
import type {
  CeldaDelPlantel, FilaDelPlantel, Medida, RetribucionDelPlantel as Datos,
} from '../services/retribucionDelPlantel'

const ROTULO: CSSProperties = {
  fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
  fontWeight: 400, whiteSpace: 'nowrap', padding: '0 10px 8px', textAlign: 'right', verticalAlign: 'bottom',
}

const CELDA: CSSProperties = {
  fontFamily: MONO, fontSize: '12px', fontVariantNumeric: 'tabular-nums', textAlign: 'right',
  whiteSpace: 'nowrap', padding: '0 10px', height: 44, borderBottom: `1px solid ${V.lineaFila}`, color: V.tintaSuave,
}

const MOTIVO: Record<NonNullable<CeldaDelPlantel['motivo']>, { texto: string; titulo: string }> = {
  fuera: { texto: '', titulo: 'No está en el plantel de esta quincena.' },
  'sin neto': { texto: 'sin neto', titulo: 'La Liquidación no pudo afirmar el neto: no hay recibo ni estimado.' },
  'sin total': { texto: '—', titulo: 'Sin banco o sin negro, la Liquidación no afirma el total.' },
}

function Celda({ c, medida }: { c: CeldaDelPlantel; medida: Medida }) {
  if (c.span === 0) return null
  const m = c.motivo ? MOTIVO[c.motivo] : null
  const titulo = m?.titulo ?? `${medida === 'pagado' ? 'consta pagado' : 'liquidado'}${c.mensual ? ' en el mes' : ''} · quincena ${c.estado}`
  return (
    <td colSpan={c.span > 1 ? c.span : undefined} title={titulo} data-desde={c.desde} style={{
      ...CELDA,
      color: m ? (c.motivo === 'sin neto' ? V.warn : V.tenue) : c.valor === 0 ? V.tenue : V.tintaSuave,
      textAlign: c.span > 1 ? 'center' : 'right',
    }}>
      {m ? m.texto : pesos(c.valor)}
    </td>
  )
}

function Fila({ f, medida, onAbrir }: { f: FilaDelPlantel; medida: Medida; onAbrir: () => void }) {
  return (
    <tr data-testid="retribucion-plantel-fila" data-persona={f.personaId}>
      <th scope="row" style={{ ...COLUMNA_FIJA, ...CELDA, fontFamily: 'inherit', textAlign: 'left', fontWeight: 400, maxWidth: 220 }}>
        <button type="button" onClick={onAbrir} data-testid="retribucion-plantel-abrir" style={{
          background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: '12.5px', fontWeight: 600,
          color: V.tinta, cursor: 'pointer', textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.nombre}</button>
      </th>
      <td style={CELDA} title={f.rotulo.pactado.titulo ?? undefined}>{f.rotulo.pactado.valor ?? <span style={{ color: V.tenue }}>{f.rotulo.pactado.falta}</span>}</td>
      <td style={CELDA} title={f.rotulo.recibo.titulo ?? undefined}>{f.rotulo.recibo.valor ?? <span style={{ color: V.tenue }}>{f.rotulo.recibo.falta}</span>}</td>
      {f.celdas.map((c) => <Celda key={c.desde} c={c} medida={medida} />)}
      <td data-testid="retribucion-plantel-total" style={{ ...CELDA, color: V.tinta, fontWeight: 600, borderLeft: `1px solid ${V.linea}` }}>
        {f.total == null ? <span style={{ color: V.tenue, fontWeight: 400 }}>sin liquidaciones</span> : pesos(f.total)}
      </td>
    </tr>
  )
}

function Opcion({ href, activa, children, testid }: { href: string; activa: boolean; children: string; testid: string }) {
  return (
    <Link href={href} prefetch={false} data-testid={testid} aria-current={activa ? 'true' : undefined} style={{
      fontSize: '12.5px', padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
      color: activa ? V.tinta : V.apagado, fontWeight: activa ? 600 : 400,
      background: activa ? V.fondo : 'transparent', border: `1px solid ${activa ? V.linea : 'transparent'}`,
    }}>{children}</Link>
  )
}

export function RetribucionDelPlantel({ d, hrefMedida, hrefAnios }: {
  d: Datos
  hrefMedida: Record<Medida, string>
  /** Un enlace por año elegible. Con uno solo no se dibuja el filtro. */
  hrefAnios: readonly { anio: number; href: string }[]
}) {
  const [buscar, setBuscar] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const filas = useMemo(() => {
    const t = buscar.trim().toLocaleLowerCase('es')
    return t === '' ? d.filas : d.filas.filter((f) => f.nombre.toLocaleLowerCase('es').includes(t))
  }, [buscar, d.filas])
  const persona = d.filas.find((f) => f.personaId === abierta) ?? null
  const quincenas = d.meses.flatMap((m) => m.quincenas)

  return (
    <div data-testid="retribucion-plantel" style={{
      display: 'flex', flexDirection: 'column', gap: 12, background: '#FFFFFF',
      border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, padding: '16px 0',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: `0 ${CANAL_SCROLL}px` }}>
        <input
          type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona"
          aria-label="Buscar persona" data-testid="retribucion-plantel-buscar"
          // CON CLASES Y NO CON `style`: el estilo en línea de este campo no hidrataba (medido en `next dev`).
          className="min-w-[200px] rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
        />
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Qué se muestra">
          <Opcion href={hrefMedida.pagado} activa={d.medida === 'pagado'} testid="retribucion-medida-pagado">Pagado</Opcion>
          <Opcion href={hrefMedida.liquidado} activa={d.medida === 'liquidado'} testid="retribucion-medida-liquidado">Liquidado</Opcion>
        </div>
        {hrefAnios.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Año">
            {hrefAnios.map((a) => (
              <Opcion key={a.anio} href={a.href} activa={a.anio === d.anio} testid={`retribucion-anio-${a.anio}`}>{String(a.anio)}</Opcion>
            ))}
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: V.tenue }}>{filas.length} de {d.filas.length}</span>
      </div>

      {d.errores.length > 0 && (
        <p data-testid="retribucion-plantel-error" style={{ margin: 0, padding: `0 ${CANAL_SCROLL}px`, fontSize: '11px', color: V.warn }}>
          No pude leer {d.errores.join(' · ')}
        </p>
      )}

      {d.filas.length === 0
        ? <p data-testid="retribucion-plantel-vacia" style={{ margin: 0, padding: `0 ${CANAL_SCROLL}px`, fontSize: '12.5px', color: V.tenue }}>Sin plantel activo en la Liquidación de esta quincena.</p>
        : (
          <div style={{ ...MARCO_SCROLL, padding: `0 ${CANAL_SCROLL}px` }}>
            <table data-testid="retribucion-plantel-tabla" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...COLUMNA_FIJA, ...ROTULO, textAlign: 'left', borderBottom: `1px solid ${V.linea}` }}>Persona</th>
                  <th rowSpan={2} style={{ ...ROTULO, borderBottom: `1px solid ${V.linea}` }} title="El $/h pactado que rige hoy (negro).">$/h negro</th>
                  <th rowSpan={2} style={{ ...ROTULO, borderBottom: `1px solid ${V.linea}` }} title="El $/h del último recibo real.">$/h recibo</th>
                  {d.meses.map((m) => (
                    <th key={m.mes} colSpan={m.quincenas.length} style={{ ...ROTULO, textAlign: 'center', paddingBottom: 2 }}>{m.rotulo}</th>
                  ))}
                  <th rowSpan={2} style={{ ...ROTULO, borderBottom: `1px solid ${V.linea}`, borderLeft: `1px solid ${V.linea}` }}
                    title={d.medida === 'pagado' ? '«Consta pagado» del año, igual que en el legajo.' : '«Liquidado» del año, igual que en el legajo.'}>
                    Total {d.anio}
                  </th>
                </tr>
                <tr>
                  {quincenas.map((q) => (
                    <th key={q.desde} style={{ ...ROTULO, borderBottom: `1px solid ${V.linea}` }}>{q.desde.slice(8, 10) === '01' ? '1ª' : '2ª'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => <Fila key={f.personaId} f={f} medida={d.medida} onAbrir={() => setAbierta(f.personaId)} />)}
              </tbody>
            </table>
          </div>
        )}

      {persona && (
        <Drawer
          titulo={persona.nombre}
          subtitulo={`Retribución ${d.anio}`}
          onCerrar={() => setAbierta(null)}
          ancho={760}
          testid="panel-retribucion-persona"
          pie={<Link href={`/administracion/personas/${persona.personaId}?v=retribucion`} prefetch={false} style={{ fontSize: '12.5px', color: V.tinta }}>Ver el legajo completo</Link>}
        >
          <RetribucionDelLegajo
            r={persona.retribucion} rotulo={persona.rotulo}
            hrefLiquidacion="/administracion/personas?vista=liquidacion&quincena="
          />
        </Drawer>
      )}
    </div>
  )
}
