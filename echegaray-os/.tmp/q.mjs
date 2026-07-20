import { query } from '../orquestador/lib/db.mjs'
const r = await query(process.argv[2])
console.log(JSON.stringify(r.rows, null, 1))
process.exit(0)
