// CUENTAS BANCARIAS EN EL COSTADO DEL LEGAJO (dueño, 01/10/2026).
//
// Renglones de rótulo y valor, como Legajo y Laboral: sin tarjeta, sin párrafo. El primer renglón es
// el control —lo que el dueño preguntó: ¿está en regla?—; el color va sólo ahí, verde si está todo y
// ámbar si falta algo. Los números van en monoespaciada para poder dictarlos contra el comprobante.
//
// FCL NO EXIGIBLE SE DICE: a quien no es de la construcción no se le escribe «sin relevar» en el
// estado del FCL, que parecería un pendiente. Se escribe por qué no se le pide.

import { RotuloPanel, V } from '@/shared/components/v2/patron'
import { DatoDeCostado } from '@/shared/components/v2/segundoNivel'
import { Editar } from './CostadoLegajo'
import { ROTULO_CONTROL, ROTULO_ESTADO, type EstadoCuenta } from '../services/cuentasDelLegajo'
import { MIGRACION_CUENTAS, type LecturaDeCuentas } from '../services/cuentasDelLegajoService'
import { diaMesAnioISO as fecha } from '@/shared/utils/fecha'

const estado = (e: string | null) => (e ? ROTULO_ESTADO[e as EstadoCuenta] ?? e : null)

export function CuentasDelLegajo({ lectura, hrefEditar }: { lectura: LecturaDeCuentas; hrefEditar: string }) {
  const c = lectura.estado === 'ok' ? lectura.filas[0] ?? null : null
  return (
    <div data-testid="bloque-cuentas" style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <RotuloPanel>Cuentas bancarias</RotuloPanel>
        {lectura.estado === 'ok' && <Editar href={hrefEditar} testid="bloque-cuentas-editar" />}
      </div>
      {lectura.estado === 'falta_migracion' && (
        <DatoDeCostado k="Cuentas" v={null} falta={`falta aplicar ${MIGRACION_CUENTAS.slice(0, 13)}`} testid="cuentas-sin-base" />
      )}
      {lectura.estado === 'error' && (
        <div title={lectura.mensaje}><DatoDeCostado k="Cuentas" v={null} falta="sin lectura" testid="cuentas-error" /></div>
      )}
      {c && (
        <>
          <DatoDeCostado
            k="Control" testid="cuentas-control"
            v={<span style={{ color: c.control === 'completo' ? V.pos : V.warn, fontWeight: 500 }}>{ROTULO_CONTROL[c.control]}</span>}
          />
          <DatoDeCostado k="Banco" v={c.cuenta_sueldo_banco} />
          <DatoDeCostado k="N° cuenta" v={c.cuenta_sueldo_numero} mono />
          <DatoDeCostado k="CBU" v={c.cbu} mono testid="cuentas-cbu" />
          <DatoDeCostado k="Sueldo" v={estado(c.cuenta_sueldo_estado)} falta="sin relevar" />
          <DatoDeCostado k="N° FCL" v={c.fcl_cuenta} mono falta={c.fcl_exigible ? undefined : 'no aplica'} />
          <DatoDeCostado k="CBU FCL" v={c.fcl_cbu} mono falta={c.fcl_exigible ? undefined : 'no aplica'} />
          <DatoDeCostado
            k="FCL" v={estado(c.fcl_estado)}
            falta={c.fcl_exigible ? 'sin relevar' : 'no exigible por convenio'}
            testid="cuentas-fcl-estado"
          />
          <DatoDeCostado k="Fuente" v={c.cuentas_fuente} />
          <DatoDeCostado k="Relevado" v={c.cuentas_relevadas_en ? fecha(c.cuentas_relevadas_en) : null} />
        </>
      )}
    </div>
  )
}
