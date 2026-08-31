// LO QUE EL DUEÑO TRANSFIRIÓ HOY, REGISTRADO COMO YA TRANSFERIDO.
//
// La columna POR BANCO publicaba el NETO ENTERO del recibo sin descontar lo ya girado. El dueño pagó
// leyendo esa columna. Cada uno de esos giros se registra acá para que la Nómina los descuente y no
// se pague dos veces — la segunda vez sería en efectivo, que no se recupera.
//
// Sólo los OBREROS de la quincena en curso: oficina cobra mensual y las liquidaciones finales ya
// tienen su propio registro.
import { query, closePool } from '/home/jorge/echegaray-os/app/echegaray-os/orquestador/lib/db.mjs'
import { makeGoogleClient } from '/home/jorge/echegaray-os/app/echegaray-os/orquestador/lib/google.mjs'
import { loadConfig } from '/home/jorge/echegaray-os/app/echegaray-os/orquestador/lib/config.mjs'

const APLICAR = process.argv.includes('--aplicar')
const PERIODO = 'Q2-08/2026'
const FECHA = '2026-08-31'
const g = makeGoogleClient({ config: loadConfig(), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })

// Quiénes son los obreros de la quincena: los que están en el cuadro 1 de la Nómina.
const nom = await g.readSheetValues('1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8', "'Nómina'!A14:A28")
const nombres = nom.map((f) => String(f?.[0] ?? '').replace(/\s+▲.*$/, '').trim()).filter(Boolean)

const { rows: recibos } = await query(
  `select distinct on (cuil) cuil, nombre_recibo, neto from public.nomina_recibo_neto
    where periodo = $1 order by cuil, cargado_en desc`, [PERIODO])
const porNombre = new Map(recibos.map((r) => [String(r.nombre_recibo).trim().toUpperCase(), r]))

const { rows: yaHay } = await query(
  `select cuil, sum(importe) s from public.nomina_adelanto
    where concepto = 'QUINCENA' and fecha = $1 group by cuil`, [FECHA])
const registrado = new Map(yaHay.map((r) => [r.cuil, Number(r.s)]))

console.log(`${nombres.length} obrero(s) en la quincena · recibos ${PERIODO}: ${recibos.length}`)
console.log(APLICAR ? '── REGISTRANDO ──\n' : '── EN SECO ──\n')
console.log('Persona'.padEnd(34), 'CUIL'.padEnd(13), 'transferido hoy'.padStart(16), '  estado')
let total = 0; let n = 0
for (const nombre of nombres) {
  const r = porNombre.get(nombre.toUpperCase())
  if (!r) { console.log(`${nombre.slice(0, 33).padEnd(34)} ${''.padEnd(13)} ${'—'.padStart(16)}   SIN RECIBO: no se le transfirió nada`); continue }
  const importe = Number(r.neto)
  if (registrado.has(r.cuil)) {
    console.log(`${nombre.slice(0, 33).padEnd(34)} ${r.cuil.padEnd(13)} ${importe.toLocaleString('es-AR').padStart(16)}   ya estaba registrado`)
    continue
  }
  if (APLICAR) {
    await query(
      `insert into public.nomina_adelanto (referencia, fecha, cuil, beneficiario, importe, concepto, fuente)
       values ($1,$2,$3,$4,$5,'QUINCENA',$6)
       on conflict (referencia) do update set importe = excluded.importe`,
      [`TRANSF-31082026-${r.cuil}`, FECHA, r.cuil, r.nombre_recibo, importe,
        'transferencia del 31/08/2026 hecha leyendo la columna POR BANCO de Nómina, que publicaba el neto entero del recibo sin descontar lo ya girado · declarado por el dueño'])
  }
  total += importe; n++
  console.log(`${nombre.slice(0, 33).padEnd(34)} ${r.cuil.padEnd(13)} ${importe.toLocaleString('es-AR').padStart(16)}   ${APLICAR ? 'REGISTRADO' : 'se registraría'}`)
}
console.log(`\n${APLICAR ? 'registrados' : 'a registrar'}: ${n} · $${total.toLocaleString('es-AR')}`)
if (!APLICAR) console.log('\n(sin --aplicar no se escribió nada)')
await closePool()
