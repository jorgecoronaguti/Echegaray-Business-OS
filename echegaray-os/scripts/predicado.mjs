// ¿LA POLICY NUEVA DEVUELVE EXACTAMENTE LAS MISMAS FILAS QUE LA VIEJA, PARA CADA ROL?
// Una migración de rendimiento que cambia QUIÉN VE QUÉ no es una optimización, es un incidente.
// Se compara el conjunto entero de `drive_file_id` visible, antes y después, con rollback.
import { query, closePool } from '../orquestador/lib/db.mjs'
import fs from 'node:fs'

if (!process.argv[2]) {
  console.error('uso: node scripts/predicado.mjs <migracion.sql>')
  process.exit(1)
}
// Los tres roles que ven distinto. Son usuarios REALES del padrón: la prueba no sirve con un id
// inventado, porque la policy que se compara resuelve el rol contra `perfiles`.
const USUARIOS = [
  ['direccion ', 'ede1fa51-517b-4f27-b6d9-09ce8a704aca'],
  ['jefe_obra ', '543b2008-7540-494f-bfd6-5e30bc601ac8'],
  ['campo     ', 'e9faff0d-69c7-4d7f-849b-0043f2bf0f8a'],
]
const HUELLA = "select coalesce(md5(string_agg(drive_file_id, ',' order by drive_file_id)), 'VACIO')||' · '||count(*)::text from public.drive_index"
const huellaDe = async (uid) => {
  await query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
  await query('set local role authenticated')
  const v = Object.values((await query(HUELLA)).rows[0])[0]
  await query('reset role')
  return v
}
const antes = {}, despues = {}
await query('begin')
for (const [n, u] of USUARIOS) antes[n] = await huellaDe(u)
for (const st of fs.readFileSync(process.argv[2], 'utf8').split(/;\s*$/m)) {
  if (st.replace(/^\s*--.*$/gm, '').trim()) await query(st)
}
for (const [n, u] of USUARIOS) despues[n] = await huellaDe(u)
await query('rollback')
let ok = true
for (const [n] of USUARIOS) {
  const igual = antes[n] === despues[n]
  ok &&= igual
  console.log(`${igual ? 'IGUAL  ' : 'CAMBIÓ '} ${n} antes=${antes[n]}  después=${despues[n]}`)
}
console.log(ok ? 'VEREDICTO: el predicado NO cambió para ningún rol.' : 'VEREDICTO: LA MIGRACIÓN CAMBIA QUIÉN VE QUÉ — no aplicar.')
await closePool()
