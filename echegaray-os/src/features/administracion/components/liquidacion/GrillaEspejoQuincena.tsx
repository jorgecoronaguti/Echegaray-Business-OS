'use client'

// EL CUADRO DE LA QUINCENA — DOS CUADROS: JORNALEROS Y MENSUALES (dueño, 14, 15 y 17/09/2026).
//
// *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»* (14/09) → blanco (recibo) + negro;
// *«necesito al lado de banco y negro lo que se le ha pagado efectivamente»* (15/09) → Pagado y Saldo por lado;
// *«que se distingan horas, recibo blanco, recibo negro y resto del cálculo»* (17/09) → cuatro bloques rotulados;
// y el mismo 17/09, sobre el primer intento: *«está roto y no contempló cuestiones de los dos tipos de empleados que
// aparecen, rehacer»*.
//
// ═══ POR QUÉ DOS CUADROS Y NO UNA GRILLA CON FILAS ESPECIALES ═══
//
// Un jornalero cobra horas × $/h: recibo por categoría (blanco) y las horas que el recibo no paga (negro). Un jefe de
// obra cobra un sueldo del mes: recibo por banco y el resto en efectivo. En la misma grilla, las columnas del recibo
// blanco del jefe quedaban vacías, quince columnas de días parecían dato de pago, y el pie sumaba sueldos mensuales en
// el efectivo redondeado y en el cierre. Dos cuadros, cada uno con sus columnas y su subtotal, y un total general que
// dice si cierra. Quién va en cada uno lo decide `tipoDeLiquidacion` (la modalidad del cuadro de la liquidación).
//
// ═══ NI UN NÚMERO SE CALCULA ACÁ ═══
//
// Las cifras son las de `getLiquidacionDeLaQuincena`; los subtotales, los de `liquidacionPorTipo.ts`. Este archivo
// decide qué cuadro va primero y qué se abre al tocar un nombre.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { PanelDeLaPersona } from './cuadro/PanelDeLaPersona'
import { TablaDeBloques } from './cuadro/TablaDeBloques'
import { CUADRO_JORNALEROS, CUADRO_MENSUALES } from './cuadro/columnasDelCuadro'
import { FilaJornalero, TotalJornaleros } from './cuadro/FilasJornaleros'
import { FilaMensual, TotalMensuales } from './cuadro/FilasMensuales'
import { PieTotalGeneral, ResumenJornaleros, ResumenMensuales } from './cuadro/PieDeLaQuincena'
import { useAnchoDePersona } from './cuadro/useAnchoDePersona'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDelEspejo } from '../../services/espejoDeJornales'
import type { EntradaDeHistorial } from '../../services/cuadroDeJornales'
import type { DetalleLaboral } from '../../services/detalleLaboral'
import {
  separarPorTipo, tipoDeLiquidacion, totalGeneral, totalesDeJornaleros, totalesDeMensuales,
} from '../../services/liquidacionPorTipo'

export { FiltrosDelEspejo } from './cuadro/FiltrosDelEspejo'

export interface SeccionDelEspejo {
  clave: string
  rotulo: string
  filas: FilaDelEspejo[]
}

/** El % contra el valor anterior, sólo si el valor que rige empieza en esta quincena. */
function pctDeLaQuincena(historial: readonly EntradaDeHistorial[] | undefined, desde: string): number | null {
  const vigente = historial?.find((e) => e.vigente)
  return vigente && vigente.desde === desde ? vigente.pctAumento : null
}

/** Las secciones de Personal que caen en un cuadro. Con una sola, el título del cuadro ya la nombra. */
const seccionesDelTipo = (secciones: readonly SeccionDelEspejo[], tipo: 'jornalero' | 'mensual'): SeccionDelEspejo[] =>
  secciones
    .map((s) => ({ ...s, filas: s.filas.filter((f) => tipoDeLiquidacion(f) === tipo) }))
    .filter((s) => s.filas.length > 0)

export function GrillaEspejoQuincena({
  dias, secciones, quincena, camposEditables, sello,
  historiales = {}, historialCompleto = true, detalles = {},
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  historiales?: Record<string, EntradaDeHistorial[]>
  historialCompleto?: boolean
  /** El detalle laboral de cada persona (`leerDetallesLaborales`). Viaja armado: el panel no lee. */
  detalles?: Record<string, DetalleLaboral>
  sello: React.ReactNode
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const { registrar, tirador } = useAnchoDePersona()
  const visibles = secciones.flatMap((s) => s.filas)
  const { jornaleros, mensuales } = separarPorTipo(visibles)
  const tJ = totalesDeJornaleros(jornaleros)
  const tM = totalesDeMensuales(mensuales)
  const general = totalGeneral(tJ, tM)
  const filaAbierta = abierta ? visibles.find((f) => f.personaId === abierta) : undefined
  const edicion = { quincena, camposEditables }
  const sellada = visibles.some((f) => f.cerrada)

  const filasDe = (tipo: 'jornalero' | 'mensual', columnas: string) => {
    const suyas = seccionesDelTipo(secciones, tipo)
    return suyas.map((sec, i) => (
      <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
        {suyas.length > 1 && <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />}
        {sec.filas.map((fila) => {
          const props = {
            fila, columnas, edicion, abrir: () => setAbierta(fila.personaId),
            pct: pctDeLaQuincena(historiales[fila.personaId], quincena.desde),
          }
          return tipo === 'mensual' ? <FilaMensual key={fila.personaId} {...props} /> : <FilaJornalero key={fila.personaId} {...props} />
        })}
      </div>
    ))
  }

  return (
    // `overflow: clip` Y NO `hidden`: `hidden` crea un contenedor de scroll y el encabezado pegajoso de adentro
    // quedaría clavado a esta caja. `clip` recorta las esquinas sin crear scrollport.
    <div style={{ background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, overflow: 'clip' }}>
      {sello}
      {jornaleros.length > 0 && (
        <TablaDeBloques testid="cuadro-jornaleros" principal titulo={`Jornaleros · por hora · ${jornaleros.length}`}
          resumen={<ResumenJornaleros t={tJ} />} definicion={CUADRO_JORNALEROS} dias={dias} sellada={sellada}
          tirador={tirador} registrar={registrar}
          filas={(c) => filasDe('jornalero', c)}
          total={(c) => <TotalJornaleros columnas={c} dias={dias} t={tJ} />} />
      )}
      {mensuales.length > 0 && (
        <TablaDeBloques testid="cuadro-mensuales" titulo={`Mensuales · sueldo del mes · ${mensuales.length}`}
          resumen={<ResumenMensuales t={tM} />} definicion={CUADRO_MENSUALES} dias={dias} sellada={sellada}
          tirador={tirador} registrar={registrar}
          filas={(c) => filasDe('mensual', c)}
          total={(c) => <TotalMensuales columnas={c} t={tM} />} />
      )}
      <PieTotalGeneral g={general} hayMensuales={mensuales.length > 0} />
      {/* `key` = LA PERSONA. Sin la clave, abrir a otra persona reutiliza el mismo árbol y cada celda editable
          conserva lo tecleado para la anterior (dueño, 11/09/2026: «si cambiás de persona la hora se cambia»). */}
      {filaAbierta && (
        <PanelDeLaPersona key={filaAbierta.personaId} fila={filaAbierta} quincena={quincena} camposEditables={camposEditables}
          historial={historiales[filaAbierta.personaId] ?? []} historialCompleto={historialCompleto}
          detalle={detalles[filaAbierta.personaId]}
          onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}
