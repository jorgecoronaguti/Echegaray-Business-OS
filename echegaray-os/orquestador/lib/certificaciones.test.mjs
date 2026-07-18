#!/usr/bin/env node
// Test de la validación pura de certificaciones (sin DB).
import { validarCertificacion } from './certificaciones.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

check('monto número (schema)', validarCertificacion({ monto: 5000000 }).monto === 5000000)
check('monto string es-AR "$5.000.000" → 5000000', validarCertificacion({ monto: '$5.000.000' }).monto === 5000000)
check('monto string es-AR con decimal "5.000.000,50"', validarCertificacion({ monto: '5.000.000,50' }).monto === 5000000.5)
check('monto 0 → error', validarCertificacion({ monto: 0 }).ok === false)
check('monto negativo → error', validarCertificacion({ monto: -100 }).ok === false)
check('monto no numérico → error', validarCertificacion({ monto: 'abc' }).ok === false)

const conFecha = validarCertificacion({ monto: 100, fecha: '15/07/2026' })
check('fecha DD/MM/AAAA → ISO', conFecha.ok && conFecha.fecha === '2026-07-15')
check('fecha ISO se acepta', validarCertificacion({ monto: 100, fecha: '2026-07-15' }).fecha === '2026-07-15')
check('fecha basura → error', validarCertificacion({ monto: 100, fecha: 'ayer' }).ok === false)
check('sin fecha → usa hoy (ISO)', /^\d{4}-\d{2}-\d{2}$/.test(validarCertificacion({ monto: 100 }).fecha))

console.log(`\ncertificaciones.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
