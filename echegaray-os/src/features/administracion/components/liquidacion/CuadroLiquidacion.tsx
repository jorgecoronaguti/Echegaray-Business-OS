'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { TotalesDeCuadro } from '../../services/liquidacionQuincena'
import { desvioDelAcuerdo } from '../../services/liquidacionAcuerdo'
import type { CampoEditable, LineaConOverrides } from '../../services/liquidacionOverrides'
import type { CuadroConOverrides } from '../../services/liquidacionQuincenaService'
import { cerrarQuincena } from '../../services/liquidacionActions'
// LAS CELDAS ESCRIBIBLES VIVEN EN UN MÓDULO PROPIO: la solapa Pagos del handoff v2 usa las MISMAS.
// Dos copias serían dos definiciones de «qué pasa cuando alguien corrige un adelanto».
import {
  CeldaEditable, CeldaRedondeo, CeldaValorHora, type UnidadDeCelda,
} from './CeldasDeLiquidacion'
import { pesos } from './formato'

// UN CUADRO DE LA LIQUIDACIÓN. Las mismas ocho columnas en los tres.
//
// ═══ TODO SE EDITA MENOS EL NOMBRE (dueño, 09/09/2026) ═══
//
// *«quiero más editables todas esas filas y columnas, no los nombres pero lo demás sí»*. Cada celda
// guarda al salir del campo, sin recargar la pantalla, y **lo escrito a mano gana sobre la cuenta**:
// es la regla más vieja del repo —edición manual = verdad definitiva—. Vaciar la celda no escribe
// cero: borra el override y la cuenta vuelve sola.
//
// LO PISADO SE VE QUE ESTÁ PISADO. Un punto y la palabra «manual» al lado del número, sin fondo de
// color: un importe escrito a mano que se disfraza de calculado es el que después nadie puede
// explicar frente al recibo.
//
// ═══ LO QUE NO SE PUEDE EDITAR TODAVÍA SE DICE, NO SE ESCONDE ═══
//
// Seis de las celdas necesitan columnas `*_manual` que la migración `20260909T1740` agrega y que
// NADIE APLICÓ TODAVÍA: `cobra`, `adelanto`, … nacieron `not null default 0` y un 0 ahí no puede
// significar «vacío». Hasta que se aplique se dibujan de sólo lectura. `camposEditables` sale de
// preguntarle a la base qué columnas tiene, no de una lista escrita a mano.
//
// ═══ LA QUINCENA CERRADA NO SE TOCA ═══
//
// Cerrada = foto. Ninguna celda se dibuja editable, y el servidor lo vuelve a comprobar releyendo el
// estado: la pantalla es la puerta, no la cerradura.
//
// ═══ «SIN TARIFA» NO ES $ 0 ═══
//
// Una fila sin $/hora cargado muestra «sin tarifa» y deja COBRA en blanco. Un cero ahí liquidaría a
// alguien en nada con la misma cara con la que muestra un importe correcto, y la plata se entrega en
// mano: nadie la reclama después.

// ═══ LAS DOS COLUMNAS DEL ACUERDO 50/50 VAN PEGADAS A COBRA, Y NO SE EDITAN ═══
//
// El dueño (10/09/2026): «el acuerdo con todos los empleados es 50% en blanco y 50% en efectivo, no
// me lo está mostrando actualmente». Son un DERIVADO de COBRA (`repartoDelAcuerdo`), no una celda de
// la liquidación: editarlas sería acordar otra cosa desde una pantalla. Van antes de ADELANTO
// porque pertenecen al acuerdo, no a la cadena de pago —que empieza justamente ahí—.
const COLUMNAS = [
  'Persona', 'Horas', '$/h', 'COBRA', 'BLANCO 50%', 'EFECTIVO 50%', 'ADELANTO', 'YA TRANSFERIDO',
  'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado',
] as const

const numero = (n: number | null): string =>
  n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })

export function CuadroLiquidacion({
  cuadro, totales, quincena, estado, cerradaEn, puedeCerrar, camposEditables,
}: {
  cuadro: CuadroConOverrides
  totales: TotalesDeCuadro
  quincena: { desde: string; hasta: string }
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
  puedeCerrar: boolean
  /** Las celdas que la BASE puede guardar hoy. El resto se dibuja de sólo lectura. */
  camposEditables: readonly CampoEditable[]
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [cerrando, empezar] = useTransition()
  if (cuadro.lineas.length === 0) return null

  const congelables = cuadro.lineas.filter((l) => l.cobra != null && l.enEfectivo != null)

  const cerrar = () => empezar(async () => {
    const r = await cerrarQuincena({
      ...quincena,
      grupo: cuadro.grupo,
      lineas: congelables.map((l) => ({
        persona_id: l.personaId,
        horas: l.horas,
        valor_hora: l.valorHora,
        cobra: l.cobra as number,
        adelanto: l.adelanto,
        ya_transferido: l.yaTransferido,
        por_banco: l.porBanco,
        en_efectivo: l.enEfectivo as number,
        total: l.total as number,
      })),
    })
    setAviso(r.ok ? r.mensaje : r.error)
  })

  return (
    <section data-testid={`cuadro-${cuadro.grupo}`} style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, margin: 0 }}>{cuadro.titulo}</h3>
        <span style={{ fontSize: '11.5px', color: V.tenue }}>
          {cuadro.lineas.length} persona{cuadro.lineas.length === 1 ? '' : 's'}
          {totales.sinTarifa > 0 && ` · ${totales.sinTarifa} sin tarifa`}
          {totales.reciboSinGiro > 0 && ` · ${totales.reciboSinGiro} con recibo sin giro`}
          {totales.sinReparto > 0 && ` · ${totales.sinReparto} sin acuerdo 50/50`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {estado === 'cerrada' ? (
            <span data-testid={`cerrada-${cuadro.grupo}`} style={{ fontSize: '11.5px', color: V.apagado }}>
              Cerrada{cerradaEn ? ` el ${cerradaEn.slice(0, 10)}` : ''}
            </span>
          ) : puedeCerrar && congelables.length > 0 && (
            <button
              type="button"
              onClick={cerrar}
              disabled={cerrando}
              data-testid={`cerrar-${cuadro.grupo}`}
              style={{
                background: V.marca, color: V.grafito, border: 'none', borderRadius: 4,
                padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {cerrando ? 'Cerrando…' : 'Cerrar quincena'}
            </button>
          )}
        </span>
      </div>

      {aviso && (
        <p data-testid={`aviso-${cuadro.grupo}`} style={{ fontSize: '12px', color: V.apagado, margin: '0 0 8px' }}>
          {aviso}
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            {COLUMNAS.map((c, i) => (
              <th key={c} style={{
                textAlign: i === 0 ? 'left' : 'right',
                fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue,
                borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 6px', whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cuadro.lineas.map((l) => (
            <Fila
              key={l.personaId}
              linea={l}
              quincena={quincena}
              grupo={cuadro.grupo}
              bloqueada={estado === 'cerrada'}
              camposEditables={camposEditables}
            />
          ))}
          <tr data-testid={`total-${cuadro.grupo}`}>
            <Celda izquierda fuerte>⇒ {cuadro.lineas.length} persona(s)</Celda>
            <Celda fuerte>{numero(totales.horas)}</Celda>
            <Celda />
            <Celda fuerte>{pesos(totales.cobra)}</Celda>
            {/* LAS DOS MITADES DEL ACUERDO NO INCLUYEN A QUIEN NO LO TIENE, y el subtítulo del
                cuadro publica cuántos son. Sumarlos como 0 daría mitades que parecen completas. */}
            <Celda fuerte title={totales.sinReparto > 0
              ? `${totales.sinReparto} línea(s) sin acuerdo 50/50, fuera de esta suma` : undefined}>
              {pesos(totales.blancoAcuerdo)}
            </Celda>
            <Celda fuerte>{pesos(totales.efectivoAcuerdo)}</Celda>
            <Celda fuerte>{pesos(totales.adelanto)}</Celda>
            <Celda fuerte>{pesos(totales.yaTransferido)}</Celda>
            <Celda fuerte>{pesos(totales.porBanco)}</Celda>
            <Celda fuerte>{pesos(totales.enEfectivo)}</Celda>
            <Celda fuerte>{pesos(totales.total)}</Celda>
            <Celda />
          </tr>
        </tbody>
      </table>

      {cuadro.presentesSinHoras > 0 && (
        <p data-testid={`presentes-sin-horas-${cuadro.grupo}`}
          style={{ fontSize: '11px', color: V.warn, margin: '6px 0 0' }}>
          {cuadro.presentesSinHoras} día(s) declarados presentes sin horas cargadas: valen 0.
        </p>
      )}
    </section>
  )
}

function Fila({ linea, quincena, grupo, bloqueada, camposEditables }: {
  linea: LineaConOverrides
  quincena: { desde: string; hasta: string }
  grupo: string
  bloqueada: boolean
  camposEditables: readonly CampoEditable[]
}) {
  const acuerdo = linea.blancoAcuerdo == null
    ? 'Sin acuerdo 50/50: Oficina y subcontratistas cobran otra cosa'
    : 'Acuerdo 50/50 sobre COBRA — no es lo que giró el banco'
  // EL DESVÍO ENTRE EL RECIBO Y EL ACUERDO ES LO QUE TERMINA SALIENDO EN EFECTIVO. Se pinta en la
  // celda de POR BANCO porque es ahí donde el número deja de ser la mitad, y hasta hoy había que
  // deducirlo restando dos columnas a ojo.
  const desvio = desvioDelAcuerdo(linea)

  const celda = (campo: CampoEditable, valor: number | null, unidad: UnidadDeCelda) => (
    <Celda>
      <CeldaEditable
        campo={campo}
        valor={valor}
        unidad={unidad}
        manual={linea.manual[campo]}
        personaId={linea.personaId}
        quincena={quincena}
        grupo={grupo}
        // SÓLO LECTURA SI LA QUINCENA ESTÁ CERRADA O SI LA BASE NO PUEDE GUARDAR ESA CELDA.
        soloLectura={bloqueada || !camposEditables.includes(campo)}
      />
    </Celda>
  )

  return (
    <tr data-testid="fila-liquidacion" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
      <Celda izquierda>
        {linea.nombre}
        {linea.sinTarifa && (
          <span data-testid="sin-tarifa" style={{ marginLeft: 8, fontSize: '11px', color: V.warn }}>
            sin tarifa
          </span>
        )}
        {linea.reciboSinGiro && (
          <span data-testid="recibo-sin-giro" style={{ marginLeft: 8, fontSize: '11px', color: V.warn }}>
            recibo sin giro
          </span>
        )}
      </Celda>
      {celda('horas', linea.horas, 'horas')}
      <Celda>
        {/* EL $/HORA NO VIVE EN LA LÍNEA: vive en `persona_tarifa`, que es de la persona y no de
            esta quincena. Escribirlo acá escribe una tarifa vigente desde hoy. */}
        <CeldaValorHora
          valor={linea.valorHora}
          origen={linea.origenTarifa}
          personaId={linea.personaId}
          quincena={quincena}
          grupo={grupo}
          // OFICINA Y LAS FINALES NO COBRAN POR HORA: escribir un $/h ahí crearía una tarifa
          // `valor_hora` que, por el CHECK «una sola forma», borraría el neto mensual de esa
          // persona — $1.800.000 convertidos en una tarifa horaria sin que nadie lo pida.
          soloLectura={bloqueada || grupo !== 'obreros'}
        />
      </Celda>
      {celda('cobra', linea.cobra, 'pesos')}
      {/* LO ACORDADO, NO LO LIQUIDADO. Sólo lectura y «—» cuando no hay acuerdo 50/50 (Oficina y
          los subcontratistas del cuadro `final`). */}
      <Celda title={acuerdo}>{pesos(linea.blancoAcuerdo)}</Celda>
      <Celda title={acuerdo}>{pesos(linea.efectivoAcuerdo)}</Celda>
      {celda('adelanto', linea.adelanto, 'pesos')}
      {celda('yaTransferido', linea.yaTransferido, 'pesos')}
      {/* EL TÍTULO DICE EL RECIBO, NO LO GIRADO: `porBanco` vale 0 mientras el extracto no muestre
          el lote, y así el aviso decía «recibo $ 0» sobre alguien que sí tenía recibo. */}
      <Celda title={desvio == null ? undefined
        : `recibo ${linea.reciboNeto == null ? 'sin recibo' : pesos(linea.reciboNeto)}`
          + `${linea.reciboSinGiro ? ' · sin giro en el extracto' : ''}`
          + ` · acuerdo ${pesos(linea.blancoAcuerdo)} · diferencia `
          + `${pesos(Math.abs(desvio))} ${desvio < 0 ? 'que sale en efectivo' : 'girada de más'}`}
        tono={desvio == null ? undefined : V.warn}>
        <CeldaEditable
          campo="porBanco"
          valor={linea.porBanco}
          unidad="pesos"
          manual={linea.manual.porBanco}
          personaId={linea.personaId}
          quincena={quincena}
          grupo={grupo}
          soloLectura={bloqueada || !camposEditables.includes('porBanco')}
        />
      </Celda>
      {celda('enEfectivo', linea.enEfectivo, 'pesos')}
      {celda('total', linea.total, 'pesos')}
      <Celda>
        <CeldaRedondeo
          personaId={linea.personaId}
          valor={linea.efectivoRedondeado}
          quincena={quincena}
          grupo={grupo}
          bloqueada={bloqueada}
        />
      </Celda>
    </tr>
  )
}

function Celda({ children, izquierda = false, fuerte = false, title, tono }: {
  children?: React.ReactNode; izquierda?: boolean; fuerte?: boolean; title?: string; tono?: string
}) {
  return (
    <td title={title} style={{
      textAlign: izquierda ? 'left' : 'right',
      fontSize: '12.5px',
      fontWeight: fuerte ? 600 : 400,
      color: tono ?? (fuerte ? V.tinta : V.tintaSuave),
      padding: '9px 8px',
      whiteSpace: 'nowrap',
    }}>{children}</td>
  )
}
