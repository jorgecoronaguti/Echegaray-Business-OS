// LAS CUENTAS EN EL PANEL LATERAL — `?editar=cuentas`, el mismo panel que identidad y laboral.
//
// Sueldo arriba, FCL abajo, y al pie de dónde salieron los números. El estado es un select de tres
// valores y una opción vacía: «sin relevar» no es «sin pedir» (ver la migración 20261001T0300), y
// guardar el panel sin tocarlo no puede convertir lo primero en lo segundo.

import { Campo, CTRL } from '@/shared/components/ui'
import { ESTADOS_CUENTA, ROTULO_ESTADO } from '../services/cuentasDelLegajo'
import type { FilaDeCuentas } from '../services/cuentasDelLegajoService'

function Estado({ name, valor, testid }: { name: string; valor: string | null; testid: string }) {
  return (
    <select name={name} defaultValue={valor ?? ''} className={CTRL} data-testid={testid}>
      <option value="">sin relevar</option>
      {ESTADOS_CUENTA.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
    </select>
  )
}

function Texto({ name, valor, label, ancho, max, numerico }: {
  name: string; valor: string | null; label: string; ancho?: string; max: number; numerico?: boolean
}) {
  return (
    <Campo label={label} ancho={ancho}>
      <input
        name={name} maxLength={max} defaultValue={valor ?? ''} className={CTRL}
        inputMode={numerico ? 'numeric' : undefined} autoComplete="off" data-testid={`cuentas-${name}`}
      />
    </Campo>
  )
}

export function CamposCuentas({ c }: { c: FilaDeCuentas | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Texto name="cuenta_sueldo_banco" label="Banco (sueldo)" valor={c?.cuenta_sueldo_banco ?? null} max={80} />
      <Campo label="Estado (sueldo)">
        <Estado name="cuenta_sueldo_estado" valor={c?.cuenta_sueldo_estado ?? null} testid="cuentas-sueldo-estado" />
      </Campo>
      <Texto name="cuenta_sueldo_numero" label="N° de cuenta (sueldo)" ancho="col-span-2" valor={c?.cuenta_sueldo_numero ?? null} max={40} />
      {/* 22 dígitos + espacios: el CBU se tipea en bloques y el esquema los saca. */}
      <Texto name="cbu" label="CBU (sueldo)" ancho="col-span-2" valor={c?.cbu ?? null} max={30} numerico />

      <Texto name="fcl_cuenta" label="N° de cuenta FCL" valor={c?.fcl_cuenta ?? null} max={40} />
      <Campo label="Estado (FCL)">
        <Estado name="fcl_estado" valor={c?.fcl_estado ?? null} testid="cuentas-fcl-estado" />
      </Campo>
      <Texto name="fcl_cbu" label="CBU FCL" ancho="col-span-2" valor={c?.fcl_cbu ?? null} max={30} numerico />

      <Texto name="cuentas_fuente" label="Fuente" valor={c?.cuentas_fuente ?? null} max={200} />
      <Campo label="Relevado el">
        <input type="date" name="cuentas_relevadas_en" defaultValue={c?.cuentas_relevadas_en ?? ''} className={CTRL} />
      </Campo>
    </div>
  )
}
