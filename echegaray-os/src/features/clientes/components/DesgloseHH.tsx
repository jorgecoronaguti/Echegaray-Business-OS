// EL DESGLOSE DE HORAS DE UN TRABAJO — PERSONA × DÍA.
//
// «Que de ahí me lleve a un desglose de la obra entera con las personas por día que participaron de
// las HH» (dueño, 11/09/2026 18:38). Se abre con el número de HH de la tabla de trabajos y vive en
// la MISMA ficha del cliente (`?hh=<obra>`): el dueño pidió explícitamente no salir del CRM.
//
// ═══ ES UNA TABLA DE VERDAD, Y NO UN GRID ═══
//
// El resto del v2 dibuja con `grid-cols-[...]` porque sus columnas son fijas y conocidas. Acá las
// columnas son los DÍAS con horas —de la obra entera o de un bloque de JORNALES— y
// Tailwind no compila una clase armada en runtime. Una matriz con encabezado de fila y de columna es
// exactamente lo que un `<table>` describe; con `<div>` habría que reimplementar el `scope` que el
// navegador y el lector de pantalla ya entienden.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
//
//   EL COSTO DE ESAS HORAS      es plata de liquidación, vive en el módulo Personal y tiene su
//                               permiso propio. El jefe de obra ve horas; los sueldos no son de esta
//                               pantalla.
//   UN TOTAL PROPIO DE LA OBRA  el acumulado de arriba es EL MISMO número que el dueño clickeó: lo
//                               trae `hh_obra` (leído de `obra_plan_vs_real`) y lo pasa la página. Si
//                               esta pantalla lo sumara por su cuenta podría contradecir a la tabla
//                               que la abrió, y no habría forma de saber cuál creer. Lo que sí se
//                               suma acá es el PERÍODO que se ve, que es un recorte de ese total.
//   LO DE LA APP EN EL TITULAR  hasta el 13/09 `sin_respaldo` iba arriba, con nombres y en color de
//                               advertencia, y el dueño leyó que Petina, Rosales y Zogbe habían
//                               trabajado en Quattropani (JORNALES los tiene en otras obras). Se dice
//                               al PIE, tenue: dicho y no borrado, sin parecer parte del trabajo.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { hh as formatoHH } from '@/shared/utils/format'
import { diaMesISO } from '@/shared/utils/fecha'
import { frescuraDeLaFicha } from '@/features/clientes/services/frescuraFicha'
import {
  grillaDeHoras, iniciosDeBloque, periodoDeLaObra, textoDeCelda, type DesgloseDeHoras,
} from '../services/desgloseHH'

const CELDA = 'px-[6px] py-[4px] text-right font-mono tabular-nums whitespace-nowrap'
const ROTULO = {
  fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '.06em',
  color: V.tenue, fontWeight: 400,
}
const AYUDA_AUSENCIA = 'Ausencia o licencia declarada: NO suma horas. Se muestra porque explica por '
  + 'qué ese bloque rindió menos.'
/** El corte de bloque: el mismo trazo que separa el encabezado, no un color nuevo. */
const BORDE_BLOQUE = `1px solid ${V.lineaFuerte}`
const AYUDA_TOTAL = 'Horas hombre acumuladas del trabajo. Es el MISMO número de la columna HH de la '
  + 'tabla: lo publica obra_plan_vs_real y acá no se vuelve a sumar.'

export function DesgloseHH({ d, totalHH, volverHref, hrefPeriodo }: {
  d: DesgloseDeHoras
  /** El MISMO número de la columna HH (`obra_plan_vs_real.hh_real`). `null` = no lo trajo la ficha. */
  totalHH: number | null
  volverHref: string
  /** `null` = la obra entera. */
  hrefPeriodo: (desde: string | null) => string
}) {
  const g = grillaDeHoras(d)
  const ventana = d.periodos.find((p) => p.desde === d.ventana) ?? null
  const inicios = iniciosDeBloque(g.dias, d.periodos)
  const obraEntera = d.ventana == null
  // Σ de los períodos: es lo que suma el índice, no un total nuevo de la obra (ése es `totalHH`).
  const totalPeriodos = d.periodos.reduce((a, p) => a + (p.hh ?? 0), 0)
  const bordeDe = (i: number) => (inicios.has(i) && i > 0 ? BORDE_BLOQUE : undefined)
  // `null` = calculado en vivo para este pedido: no se dibuja nada.
  const frescura = frescuraDeLaFicha(d.calculadoEn, new Date())

  return (
    <div data-testid="desglose-hh">
      <Link
        href={volverHref}
        prefetch={false}
        data-testid="volver-a-obras"
        className="hover:underline"
        style={{ fontSize: '12px', color: V.apagado }}
      >
        ‹ obras del cliente
      </Link>

      {/* EL TITULAR: qué trabajo, cuánto lleva, de cuándo a cuándo y con cuánta gente. Cuatro datos
          en una línea y sin tarjetas — la skill de diseño prohíbe una card por dato. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', paddingTop: 8 }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: V.tinta }}>{d.obra.nombre}</h2>
        <span
          data-testid="desglose-total-hh"
          title={AYUDA_TOTAL}
          className="font-mono tabular-nums"
          style={{ fontSize: '13px', color: V.tinta }}
        >
          {totalHH == null ? '—' : `${formatoHH(totalHH)} HH`}
        </span>
        <span data-testid="desglose-periodo" style={{ fontSize: '12px', color: V.apagado }}>
          {periodoDeLaObra(d)}
        </span>
        {/* DE CUÁNDO SON LAS HORAS: el desglose de Dirección sale de una caché de 5 minutos. */}
        {frescura && (
          <span data-testid="desglose-frescura" title="Se recalcula cada 5 minutos" style={{ fontSize: '12px', color: V.tenue }}>
            {frescura}
          </span>
        )}
        <span style={{ fontSize: '12px', color: V.tenue }}>
          {d.registros} {d.registros === 1 ? 'registro' : 'registros'} · {d.personas}{' '}
          {d.personas === 1 ? 'persona' : 'personas'}
        </span>
      </div>

      {/* EL ÍNDICE: primero la obra entera —con lo que abre—, después cada bloque de JORNALES con su
          total. Ninguno se esconde. */}
      <div
        data-testid="desglose-periodos"
        style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '12px 0 10px' }}
      >
        <Link
          href={hrefPeriodo(null)}
          prefetch={false}
          data-testid="periodo-hh-obra"
          data-actual={obraEntera || undefined}
          className="hover:underline"
          style={{
            fontSize: '11.5px',
            color: obraEntera ? V.tinta : V.apagado,
            fontWeight: obraEntera ? 600 : 400,
            borderBottom: obraEntera ? `2px solid ${V.marca}` : '2px solid transparent',
            paddingBottom: 2,
          }}
        >
          Toda la obra{' '}
          <span className="font-mono tabular-nums">{d.periodos.length ? formatoHH(totalPeriodos) : '—'}</span>
        </Link>
        {d.periodos.map((p) => {
          const actual = p.desde === d.ventana
          return (
            <Link
              key={p.desde}
              href={hrefPeriodo(p.desde)}
              prefetch={false}
              data-testid="periodo-hh"
              data-actual={actual || undefined}
              className="hover:underline"
              style={{
                fontSize: '11.5px',
                color: actual ? V.tinta : V.apagado,
                fontWeight: actual ? 600 : 400,
                // EL AMARILLO ES MARCA Y DICE «ACÁ ESTÁS»; no es un estado ni un fondo con texto.
                borderBottom: actual ? `2px solid ${V.marca}` : '2px solid transparent',
                paddingBottom: 2,
              }}
              title={`${p.dias} ${p.dias === 1 ? 'día' : 'días'} con horas · ${p.registros} registros`}
            >
              {p.etiqueta}{' '}
              <span className="font-mono tabular-nums">{p.hh == null ? '—' : formatoHH(p.hh)}</span>
            </Link>
          )
        })}
      </div>

      {g.dias.length === 0 && (
        <p data-testid="desglose-vacio" style={{ fontSize: '12.5px', color: V.apagado }}>
          {obraEntera ? 'Este trabajo no tiene horas en JORNALES.' : 'Este bloque no tiene horas cargadas. Los que sí tienen están arriba.'}
        </p>
      )}

      {g.dias.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="grilla-hh"
            style={{ borderCollapse: 'collapse', fontSize: '11.5px', color: V.tintaSuave }}
          >
            <thead>
              {/* EL RANGO DE CADA BLOQUE sobre sus días: con la obra entera, 31/08 y 01/09 son
                  columnas vecinas de bloques distintos. */}
              {inicios.size > 0 && (
                <tr data-testid="bloques-hh">
                  <th scope="col" />
                  {[...inicios.entries()].map(([i, p], k, todos) => (
                    <th
                      key={`${p.desde}-${p.hasta}`}
                      scope="colgroup"
                      colSpan={(todos[k + 1]?.[0] ?? g.dias.length) - i}
                      style={{ ...ROTULO, textAlign: 'left', padding: '2px 6px', borderLeft: bordeDe(i) }}
                    >
                      {p.etiqueta}
                    </th>
                  ))}
                  <th scope="col" colSpan={2} />
                </tr>
              )}
              <tr style={{ borderBottom: `1px solid ${V.lineaFuerte}` }}>
                <th scope="col" style={{ ...ROTULO, textAlign: 'left', padding: '4px 12px 6px 0' }}>
                  Persona
                </th>
                {g.dias.map((f, i) => (
                  <th key={f} scope="col" className={CELDA} style={{ ...ROTULO, borderLeft: bordeDe(i) }}>
                    {diaMesISO(f)}
                  </th>
                ))}
                <th scope="col" className={CELDA} style={ROTULO}>Período</th>
                <th scope="col" className={CELDA} style={ROTULO}>Obra</th>
              </tr>
            </thead>
            <tbody>
              {g.filas.map((fila) => (
                <tr
                  key={fila.persona.personaId ?? 'sin-persona'}
                  data-testid="fila-persona-hh"
                  style={{ borderBottom: `1px solid ${V.lineaFila}` }}
                >
                  <th
                    scope="row"
                    style={{ textAlign: 'left', padding: '4px 12px 4px 0', fontWeight: 400, whiteSpace: 'nowrap' }}
                  >
                    {/* SIN PERSONA SE DICE: son las filas legacy de JORNALES que nadie pudo imputar a
                        una persona. Esconderlas haría que la grilla no cerrara con el total de la
                        obra y nadie sabría por qué. */}
                    {fila.persona.nombre ?? <span style={{ color: V.tenue }}>sin persona identificada</span>}
                  </th>
                  {fila.celdas.map((c, i) => {
                    const { texto, marca } = textoDeCelda(c)
                    return (
                      <td
                        key={g.dias[i]}
                        className={CELDA}
                        style={{ color: marca ? V.tenue : V.tintaSuave, borderLeft: bordeDe(i) }}
                        title={marca ? AYUDA_AUSENCIA : undefined}
                      >
                        {texto}
                      </td>
                    )
                  })}
                  <td className={CELDA} style={{ color: V.tinta }}>
                    {fila.total == null ? '' : formatoHH(fila.total)}
                  </td>
                  <td
                    className={CELDA}
                    style={{ color: V.apagado }}
                    title="Acumulado de esta persona en TODA la obra"
                  >
                    {fila.persona.hh == null ? '' : formatoHH(fila.persona.hh)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="total-por-dia" style={{ borderTop: `1px solid ${V.lineaFuerte}` }}>
                <th scope="row" style={{ ...ROTULO, textAlign: 'left', padding: '6px 12px 4px 0' }}>
                  Total del día
                </th>
                {g.porDia.map((n, i) => (
                  <td key={g.dias[i]} className={CELDA} style={{ color: V.tinta, borderLeft: bordeDe(i) }}>
                    {n == null ? '' : formatoHH(n)}
                  </td>
                ))}
                <td className={CELDA} style={{ color: V.tinta, fontWeight: 600 }} data-testid="total-ventana">
                  {g.total == null ? '' : formatoHH(g.total)}
                </td>
                <td className={CELDA} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {g.dias.length > 0 && (
        <p data-testid="desglose-nota" style={{ fontSize: '11px', color: V.tenue, paddingTop: 10 }}>
          La grilla dibuja {ventana ? `el bloque ${ventana.etiqueta} de JORNALES` : 'la obra entera, cortada por los bloques de JORNALES'}.
          «Período» suma lo que se ve; «Obra» es el acumulado de cada persona, que no cambia al elegir
          un bloque.
        </p>
      )}

      {/* LO DE LA APP SIN RESPALDO EN JORNALES, DICHO Y NO BORRADO (dueño, 13/09/2026). Al pie y
          tenue: no suma a nada de arriba y esas personas NO participaron del trabajo según la
          planilla. Sin esta nota desaparecería en silencio; arriba y en advertencia se leía como
          parte del equipo. */}
      {d.sinRespaldo.length > 0 && (
        <div data-testid="desglose-sin-respaldo" style={{ fontSize: '11px', color: V.tenue, paddingTop: 10 }}>
          <p style={{ margin: 0 }}>
            La app tiene {formatoHH(d.sinRespaldo.reduce((a, s) => a + s.horas, 0))} h cargadas en este
            trabajo que JORNALES no tiene; no se suman ni cuentan como personas del trabajo:
          </p>
          <ul style={{ margin: '2px 0 0', padding: 0, listStyle: 'none' }}>
            {d.sinRespaldo.map((s) => (
              <li key={s.personaId ?? 'sin-persona'}>
                {s.nombre ?? 'sin persona'} · {s.dias.map(diaMesISO).join(', ')} ·{' '}
                <span className="font-mono tabular-nums">{formatoHH(s.horas)}</span> h
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
