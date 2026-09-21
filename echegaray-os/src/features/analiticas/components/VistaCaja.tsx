// CAJA — la pestaña CAJA del Flujo de Caja, tal cual, más lo que se está gastando por fecha de pago.
//
// El dueño (18/09/2026): «reflejo fiel de lo que muestra la pestaña caja». Por eso cada número de
// arriba es el TEXTO de la celda del Sheet leído de su espejo (`caja_sheet_vigente`): no se formatea,
// no se convierte, no se suma. Las cinco tarjetas, las cuentas en dos monedas, la escalera de
// vencimientos, las alertas, las acciones y los cuatro gráficos son los de la pestaña, con sus
// rótulos. La posición es A LA FECHA que la pestaña declara; el filtro de fechas no la mueve.
//
// Lo que sí gobierna el filtro es la parte de abajo —«me gusta lo de marcar lo que se está gastando,
// pero quiero filtro de fechas»—: lo salido por FECHA DE CAJA (percibido), marcado a obra / estructura
// / sin destino, mes a mes y por área.
//
// Diseño: las piezas de Analíticas v6 (Cabecera, Seccion, Columnas) y los tokens; sin cards, sin
// sombras. Los gráficos COMBO de la pestaña tienen dos ejes; acá las mismas series van en dos paneles
// apilados con el mismo eje de días (barras arriba, saldo abajo): dos escalas en un plano alinean lo
// que no se alinea.
import { millones } from '../services/formato'
import { caja, type Caja } from '../services/empresa'
import type { TotalesDeuda } from '@/features/administracion/services/deudaProveedores'
import { egresosPercibidos, frescura, horaSanJuan, type GraficoCaja, type LecturaCaja, type SeccionCaja, type SerieCaja } from '../services/cajaSheet'
import { apilar, disposicion, escala, fechaCorta, GEOMETRIA, paneles, rotuloEje, rotulosDelEje, rotuloVentana, textoCelda, xDe } from '../services/graficoCaja'
import { Cabecera, FilaDeCifras, ENCABEZADO, Seccion, SinLectura } from './Piezas'
import { Torta } from './Torta'
import { Columnas } from './VistasEmpresa'

/** La rampa de grises del diseño v9 para las ramas de estructura, en el orden en que llegan. */
const GRISES_DE_AREA = ['text-ink-soft', 'text-muted', 'text-dato-materiales', 'text-dato-referencia']

export function VistaCaja({ lectura, egresos, periodo, rango, deuda = null }: {
  lectura: LecturaCaja
  deuda?: (TotalesDeuda & { truncado: boolean }) | null
  egresos: unknown[] | null
  periodo: string
  rango: { desde: string | null; hasta: string | null }
}) {
  if (lectura.estado !== 'foto') {
    return (
      <>
        <Cabecera titulo="Caja" detalle="la pestaña CAJA del Flujo de Caja" cifras={[]} />
        <p className="mt-6 text-sm text-muted" data-testid="caja-sin-foto">
          {lectura.estado === 'sin_espejo' ? 'El espejo de CAJA todavía no está publicado en esta base (migración 20260918T1500 pendiente).'
            : lectura.estado === 'sin_foto' ? `El espejo de CAJA todavía no guardó ninguna foto${lectura.error ? ` — último intento: ${lectura.error}` : ''}.`
              : 'No se pudo leer el espejo de CAJA.'}
        </p>
        <Gasto egresos={egresos} periodo={periodo} rango={rango} />
      </>
    )
  }
  const { foto } = lectura
  const { aviso } = frescura(foto, new Date().toISOString())
  const tablas = foto.secciones.filter((s): s is Extract<SeccionCaja, { forma: 'tabla' }> => s.forma === 'tabla')
  const listas = foto.secciones.filter((s): s is Extract<SeccionCaja, { forma: 'lista' }> => s.forma === 'lista')
  return (
    <>
      <Cabecera titulo="Caja" repartidas
        detalle={<>
          {foto.portada.titulo || 'CAJA'} · leída {horaSanJuan(foto.verificadaEn)}{foto.versionDrive ? ` · v${foto.versionDrive}` : ''}
          {/* LA POSICIÓN NO SE FILTRA (auditoría 18/09/2026): es a la fecha que la pestaña declara en cada
              tarjeta y en «Fecha del saldo». El período de la barra gobierna sólo el bloque de abajo. */}
          <span className="block" data-testid="caja-a-la-fecha">posición a la fecha que declara la pestaña · el período de arriba no la mueve: gobierna sólo «Lo que se está gastando»</span>
          {aviso ? <span className="block text-warn" data-testid="caja-aviso">▲ {aviso}</span> : null}
        </>}
        cifras={foto.portada.tarjetas.map((t) => (/deuda/i.test(t.rotulo) ? tarjetaDeuda(deuda) : { rotulo: t.rotulo, valor: t.valor.texto || null, falta: '—', nota: t.contexto || undefined }))} />
      {tablas.map((s) => (
        <Seccion key={s.clave} titulo={s.titulo} arriba="pt-8">
          <Tabla s={s} />
        </Seccion>
      ))}
      {listas.length ? (
        <div className="mt-8 grid gap-6 border-t border-line pt-6 lg:grid-cols-2">
          {listas.map((s) => (
            <div key={s.clave} className="flex flex-col gap-2.5">
              <h2 className="text-[13px] font-semibold text-ink">{s.titulo}</h2>
              {s.items.length ? s.items.map((i) => (
                <p key={i.fila} className={`text-[12.5px] leading-normal ${i.texto.startsWith('▲') ? 'text-warn' : 'text-ink-soft'}`}>{i.texto}</p>
              )) : <p className="text-[12.5px] text-faint">nada</p>}
            </div>
          ))}
        </div>
      ) : null}
      {foto.graficos.map((g) => (
        <Seccion key={g.id} titulo={g.titulo.replace(/^⟡\s*/, '')} aclaracion={g.subtitulo || undefined} filo>
          <Grafico g={g} />
        </Seccion>
      ))}
      <Gasto egresos={egresos} periodo={periodo} rango={rango} />
    </>
  )
}

// ─── Las tablas de la pestaña ───────────────────────────────────────────────────────────────────

/** «Balanz · inversiones ARS ‖ invertido» → el nombre y su marca, como los escribe la pestaña. */
const partirRotulo = (t: string): { nombre: string; marca: string | null } => {
  const [nombre, marca] = t.split('‖').map((x) => x.trim())
  return { nombre, marca: marca || null }
}

const pesos = (n: number): string => `$ ${Math.round(n).toLocaleString('es-AR')}`

/**
 * LA DEUDA ES LA DE PROVEEDORES (dueño, 18/09/2026): «lo que dice que se le debe actualmente, sacado de
 * Supabase, que es lo que sale en Proveedores». Reemplaza la tarjeta de deuda de la pestaña en su mismo
 * lugar; el resto de las tarjetas sigue siendo el texto del Sheet. Sin lectura, lo dice: no cae a la
 * cifra del Sheet, porque serían dos definiciones de la misma deuda.
 */
export function tarjetaDeuda(d: (TotalesDeuda & { truncado: boolean }) | null) {
  if (!d) return { rotulo: 'Deuda con proveedores', valor: null, falta: 'no se pudo leer Proveedores', nota: undefined }
  return {
    rotulo: 'Deuda con proveedores',
    valor: pesos(d.total),
    falta: '—',
    nota: `vencido ${pesos(d.vencido)} · por vencer ${pesos(d.porVencer)}${d.sinFecha ? ` · sin fecha ${pesos(d.sinFecha)}` : ''} · ${d.proveedores} proveedores · la de Proveedores${d.truncado ? ' · ▲ lectura recortada' : ''}`,
  }
}

function Tabla({ s }: { s: Extract<SeccionCaja, { forma: 'tabla' }> }) {
  const n = s.encabezados.length
  const cols = `minmax(0,1.6fr) repeat(${Math.max(n - 1, 1)}, minmax(0,1fr))`
  // EN EL TELÉFONO NO SE TRUNCA UN NÚMERO: la fila se abre en dos líneas —el nombre y, debajo, cada
  // celda con su encabezado chico— antes que mostrar «35.027.4…» con cara de dato (captura 390, 18/09).
  return (
    <div className="flex flex-col" data-testid={`caja-${s.clave}`}>
      <div className={`hidden h-9 items-center gap-4 border-b border-line lg:grid ${ENCABEZADO}`} style={{ gridTemplateColumns: cols }}>
        {s.encabezados.map((h, i) => <div key={h} className={i === 0 ? '' : 'text-right'}>{h}</div>)}
      </div>
      {s.filas.map((f, k) => {
        const total = /^(total|⇒)/i.test(f.celdas[0]?.texto ?? '')
        const { nombre, marca } = partirRotulo(f.celdas[0]?.texto ?? '')
        return (
          <div key={f.clave} className={`flex flex-col gap-1.5 py-2.5 tabular-nums hover:bg-surface-quiet lg:grid lg:min-h-10 lg:items-center lg:gap-4 lg:py-2 lg:[grid-template-columns:var(--cols)] ${total ? 'border-t border-line-strong font-semibold' : k < s.filas.length - 1 ? 'border-b border-line' : ''}`} style={{ ['--cols' as string]: cols }}>
            <div className="min-w-0 text-[13px] text-ink">
              <span className={total ? 'font-semibold' : 'font-medium'}>{nombre}</span>
              {marca ? <span className="ml-2 text-[11px] font-normal text-faint">{marca}</span> : null}
            </div>
            {f.celdas.slice(1).map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 lg:block lg:text-right">
                <span className={`lg:hidden ${ENCABEZADO}`}>{s.encabezados[i + 1]}</span>
                {/* VACÍA ES VACÍA y la fecha en dd/mm/yy (`textoCelda`). */}
                <span className={`whitespace-nowrap text-[13px] ${c.numero != null && c.numero < 0 ? 'text-neg' : c.fecha ? 'text-muted' : 'text-ink'}`}>{textoCelda(c)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── Los gráficos ────────────────────────────────────────────────────────────────────────────────

/** Identidad por serie, en orden fijo. «Ya salió» es gris porque ya no hay que conseguirlo (así lo pinta la pestaña). */
const RELLENO = ['fill-serie-1', 'fill-serie-2', 'fill-serie-3', 'fill-serie-4', 'fill-accent', 'fill-dato-materiales']
const PUNTO = ['bg-serie-1', 'bg-serie-2', 'bg-serie-3', 'bg-serie-4', 'bg-accent', 'bg-dato-materiales']
const TRAZO = ['stroke-accent', 'stroke-serie-1', 'stroke-serie-2', 'stroke-serie-3']
const PUNTO_LINEA = ['bg-accent', 'bg-serie-1', 'bg-serie-2', 'bg-serie-3']
const esYaSalio = (s: SerieCaja) => /^ya sali/i.test(s.nombre)
const rellenoDe = (series: SerieCaja[], k: number) => (esYaSalio(series[k]) ? 'fill-dato-referencia' : RELLENO[series.filter((s, i) => i < k && !esYaSalio(s)).length % RELLENO.length])
const puntoDe = (series: SerieCaja[], k: number) => (esYaSalio(series[k]) ? 'bg-dato-referencia' : PUNTO[series.filter((s, i) => i < k && !esYaSalio(s)).length % PUNTO.length])

const { ANCHO, IZQ, DER, ALTO_BARRAS, ALTO_LINEAS } = GEOMETRIA

function Grafico({ g }: { g: GraficoCaja }) {
  const n = g.dominio.length
  if (!n) return <p className="text-sm text-faint">el gráfico no tiene puntos</p>
  const { barras, lineas } = paneles(g)
  // LA DISPOSICIÓN ES PURA (`disposicion`, `rotulosDelEje`): los paneles del COMBO, la línea que los
  // separa y el pie de fechas en dd/mm/yy se calculan —y se prueban— sin pisarse.
  const dia = g.dominio.map(fechaCorta)
  const lugar = disposicion(barras.length > 0, lineas.length > 0)
  const { alto, yPie } = lugar
  const x = (i: number) => xDe(i, n)
  const paso = (ANCHO - IZQ - DER) / n
  const tramos = apilar(barras, n)
  const eB = escala(tramos.flatMap((t) => [t.y0, t.y1]))
  const eL = escala(lineas.flatMap((s) => s.valores.filter((v): v is number => v != null)))
  const yB = (v: number) => (lugar.barras?.arriba ?? 0) + ALTO_BARRAS - ((v - eB.min) / (eB.max - eB.min)) * ALTO_BARRAS
  const panelBarras = barras.length ? (
      <g key="barras">
        {eB.ticks.map((t) => <g key={t}><line x1={IZQ} x2={ANCHO - DER} y1={yB(t)} y2={yB(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth="1" /><text x={IZQ - 6} y={yB(t) + 3} textAnchor="end" className="fill-faint text-[9px] tabular-nums">{rotuloEje(t)}</text></g>)}
        {tramos.map((t) => {
          const a = Math.min(yB(t.y0), yB(t.y1))
          const h = Math.max(0, Math.abs(yB(t.y0) - yB(t.y1)) - 1)
          const w = Math.max(2, paso * 0.66)
          return (
            <rect key={`${t.serie}-${t.i}`} x={x(t.i) - w / 2} y={a} width={w} height={h} rx={h > 3 ? 1.5 : 0} className={rellenoDe(barras, t.serie)}>
              <title>{`${dia[t.i]} · ${barras[t.serie].nombre || 'valor'}: ${millones(t.y1 - t.y0) ?? ''}`}</title>
            </rect>
          )
        })}
      </g>
  ) : null
  const yL = (v: number) => (lugar.lineas?.arriba ?? 0) + ALTO_LINEAS - ((v - eL.min) / (eL.max - eL.min)) * ALTO_LINEAS
  const panelLineas = lineas.length ? (
    <g key="lineas">
      {lugar.separador != null ? <line x1={IZQ} x2={ANCHO - DER} y1={lugar.separador} y2={lugar.separador} className="stroke-line-strong" strokeWidth="1" strokeDasharray="2 3" /> : null}
      {eL.ticks.map((t) => <g key={t}><line x1={IZQ} x2={ANCHO - DER} y1={yL(t)} y2={yL(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth="1" /><text x={IZQ - 6} y={yL(t) + 3} textAnchor="end" className="fill-faint text-[9px] tabular-nums">{rotuloEje(t)}</text></g>)}
      {lineas.map((s, k) => {
        const puntos = s.valores.map((v, i) => (v == null ? null : [x(i), yL(v)] as const))
        const d = puntos.map((p, i) => (p ? `${i === 0 || !puntos[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join(' ')
        const ultimo = [...puntos].reverse().find((p) => p)
        const ultimoV = [...s.valores].reverse().find((v) => v != null)
        return (
          <g key={k}>
            <path d={d} fill="none" className={TRAZO[k % TRAZO.length]} strokeWidth="2" strokeLinejoin="round" strokeDasharray={s.punteada ? '4 3' : undefined} />
            {puntos.map((p, i) => (p ? <circle key={i} cx={p[0]} cy={p[1]} r="5" className="fill-transparent"><title>{`${dia[i]} · ${s.nombre || 'valor'}: ${millones(s.valores[i]) ?? ''}`}</title></circle> : null))}
            {ultimo && ultimoV != null ? <text x={Math.min(ultimo[0] + 6, ANCHO - DER)} y={ultimo[1] - 6} textAnchor={ultimo[0] > ANCHO - 90 ? 'end' : 'start'} className="fill-muted text-[9.5px] tabular-nums">{millones(ultimoV)}</text> : null}
          </g>
        )
      })}
    </g>
  ) : null
  const leyenda = [
    ...barras.map((s, k) => ({ nombre: s.nombre || 'barras', color: puntoDe(barras, k), tipo: 'barra' as const })),
    ...lineas.map((s, k) => ({ nombre: s.nombre || g.titulo.replace(/^⟡\s*/, ''), color: PUNTO_LINEA[k % PUNTO_LINEA.length], tipo: s.punteada ? 'punteada' as const : 'linea' as const })),
  ]
  return (
    <div className="flex flex-col gap-3" data-testid={`caja-grafico-${g.id}`}>
      {leyenda.length > 1 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted">
          {leyenda.map((l) => <div key={l.nombre} className="flex items-center gap-2"><span className={`${l.tipo === 'barra' ? 'size-2.5 rounded-[2px]' : 'h-0.5 w-4'} ${l.color}`} />{l.nombre}</div>)}
        </div>
      ) : null}
      {/* En el teléfono el gráfico no se achica hasta lo ilegible: se desplaza de costado adentro de su caja. */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} className="block w-full min-w-[640px]" role="img" aria-label={g.titulo}>
        {panelBarras}
        {panelLineas}
        {rotulosDelEje(g.dominio).map((r) => <text key={r.i} x={r.x} y={yPie} textAnchor={r.ancla} className="fill-faint text-[9px] tabular-nums">{r.texto}</text>)}
      </svg>
      </div>
      <details className="text-[11.5px] text-muted">
        <summary className="cursor-pointer select-none">los números</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full tabular-nums">
            <thead><tr className={ENCABEZADO}><th className="py-1 text-left font-normal">día</th>{g.series.map((s, k) => <th key={k} className="py-1 text-right font-normal">{s.nombre || '—'}</th>)}</tr></thead>
            <tbody>{dia.map((d, i) => <tr key={i} className="border-t border-line"><td className="py-1">{d}</td>{g.series.map((s, k) => <td key={k} className="py-1 text-right">{millones(s.valores[i]) ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

// ─── Lo que se está gastando (se conserva; ahora cada pago en su fecha y con el filtro) ──────────

/**
 * EL RATIO, EN PESOS (dueño, 17/09/2026): «0,41 ×» era incomprensible, un multiplicador no dice de qué.
 * Es plata por plata, así que se escribe como plata —`$ 0,41`— y la nota dice la frase entera.
 */
const porPesoDeObra = (x: number | null) => (x == null ? null : `$ ${x.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

function Gasto({ egresos, periodo, rango }: { egresos: unknown[] | null; periodo: string; rango: { desde: string | null; hasta: string | null } }) {
  if (!egresos) return <div data-testid="caja-gasto-sin-lectura"><SinLectura que="lo que salió (caja_egreso_percibido)" /></div>
  const p = egresosPercibidos(egresos)
  const c: Caja = caja(p.egresos)
  const max = Math.max(1, ...c.meses.map((m) => m.aObra + m.estructura))
  const areas = [
    { area: 'Obra', monto: c.aObra, color: 'text-accent' },
    // LA RAMPA DE GRISES DEL DISEÑO v9 (TONOS_AREA): la estructura se lee más apagada que la obra.
    ...c.ramas.map((r, i) => ({ area: r.rotulo, monto: r.total, color: GRISES_DE_AREA[i] ?? 'text-dato-referencia' })),
    { area: 'Sin clasificar', monto: c.sinDestino, color: 'text-warn' },
  ]
  const ventana = rotuloVentana(periodo, rango)
  return (
    <div className="mt-10 border-t border-line-strong pt-7" data-testid="caja-gasto">
      <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[15px] font-semibold text-ink">Lo que se está gastando</h2>
          <p className="text-xs leading-[1.45] text-muted tabular-nums" data-testid="caja-gasto-ventana">{ventana} · cada pago en la fecha en que se pagó, según Compras</p>
        </div>
        <div className="flex flex-col gap-6">
          <FilaDeCifras cifras={[
            { rotulo: 'salió', valor: c.salio ? millones(c.salio) : null, falta: 'nada pagado' },
            { rotulo: 'a una obra', valor: c.salio ? millones(c.aObra) : null, falta: '—' },
            { rotulo: 'estructura', valor: c.salio ? millones(c.estructura) : null, falta: '—', tono: 'muted' },
            { rotulo: 'sin destino', valor: c.nSinDestino ? millones(c.sinDestino) : null, falta: 'ninguno', tono: 'warn' },
            { rotulo: 'estructura por cada peso de obra', valor: porPesoDeObra(c.estructuraPorPesoDeObra), falta: '—',
              nota: c.estructuraPorPesoDeObra != null ? `por cada $ 1 que fue a una obra, ${porPesoDeObra(c.estructuraPorPesoDeObra)} fueron a estructura` : undefined },
          ]} />
          {/* LO QUE NO ES SALIDA, APARTE Y DICHO: deuda del período, lo «Pagado» sin monto en Compras y un pago sin fecha. */}
          <FilaDeCifras cifras={[
            { rotulo: 'por pagar en el período', valor: p.pendientes.n ? millones(p.pendientes.total) : null, falta: 'nada', tono: 'muted', nota: p.pendientes.n ? `${p.pendientes.n} ${p.pendientes.n === 1 ? 'compra' : 'compras'} · deuda, no salida` : undefined },
            { rotulo: 'pagado sin monto en Compras', valor: p.sinDesglose.n ? millones(p.sinDesglose.total) : null, falta: 'ninguno', tono: p.sinDesglose.n ? 'warn' : 'muted',
              nota: p.sinDesglose.n ? `${p.sinDesglose.n} ${p.sinDesglose.n === 1 ? 'compra marcada' : 'compras marcadas'} «Pagado» sin Monto Pagado · no se suman: se completan en Compras` : undefined },
            { rotulo: 'pagos sin fecha', valor: p.pagosSinFecha.n ? millones(p.pagosSinFecha.total) : null, falta: 'ninguno', tono: p.pagosSinFecha.n ? 'warn' : 'muted',
              nota: p.pagosSinFecha.n ? `${p.pagosSinFecha.n} sin «Fecha prevista 2» · no entran a ningún mes` : undefined },
          ]} />
        </div>
      </div>
      {c.meses.length ? (
        <>
          {/* EL GRÁFICO DICE DE QUÉ PERÍODO Y QUÉ ES UNA COLUMNA (dueño, 17/09/2026). */}
          <Seccion titulo="Lo que salió, por mes" aclaracion={`${ventana} · cada columna son los pagos de Compras con fecha de ese mes, a obra o a estructura${c.nSinDestino ? ' · lo sin destino no está en las columnas' : ''}`}
            leyenda={[{ color: 'bg-accent', rotulo: 'a una obra' }, { color: 'bg-dato-referencia', rotulo: 'estructura' }]}>
            <Columnas meses={c.meses.map((m) => ({
              mes: m.mes, valor: millones(m.aObra + m.estructura),
              partes: [{ alto: (m.estructura / max) * 170, clase: 'bg-dato-referencia' }, { alto: (m.aObra / max) * 170, clase: 'bg-accent' }],
            }))} />
          </Seccion>
          {/* POR ÁREA ES LA TORTA DEL DISEÑO v9: el total al centro y cada área con su parte. */}
          <Seccion titulo="Por área" aclaracion={`de todo lo que salió, cuánto se llevó cada área${c.nSinDestino ? ` · ${c.nSinDestino} ${c.nSinDestino === 1 ? 'pago sin área' : 'pagos sin área'} esperan destino` : ''}`} filo>
            <div className="pb-9">
              <Torta centro={millones(c.salio)} centroNota="salió"
                gajos={areas.map((a) => ({ rotulo: a.area, monto: a.monto, color: a.color, falta: a.area === 'Sin clasificar' ? 'ninguno' : 'sin movimiento' }))} />
            </div>
          </Seccion>
        </>
      ) : <p className="mt-6 pb-9 text-sm text-faint">nada pagado en el período</p>}
    </div>
  )
}
