#!/usr/bin/env node
// Test de clasificación de documentos + completitud de legajos. Hermético, 0 DB.
import { clasificarDoc, personaKey, esTelegrama, analizarLegajos } from './legajos.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// clasificarDoc — nombres reales del data room
check('Alta - Aballay Diego → alta', clasificarDoc('Alta - Aballay Diego.pdf') === 'alta')
check('Baja - Ahumada → baja', clasificarDoc('baja - ahumada.pdf') === 'baja')
check('DNI.pdf → dni', clasificarDoc('DNI.pdf') === 'dni')
check('HM - Ahumada → hm', clasificarDoc('HM - Ahumada.pdf') === 'hm')
check('FWEB_1988788 → alta (form IERIC)', clasificarDoc('FWEB_1988788.pdf') === 'alta')
check('nombre sin pista → otro', clasificarDoc('Nuevo doc 26-6-18.pdf') === 'otro')
check('baja gana sobre alta si ambos', clasificarDoc('Baja alta anterior.pdf') === 'baja')

// esTelegrama — señal de conflicto laboral
check('Telegrama de despido → true', esTelegrama('Telegrama de despido.pdf') === true)
check('TELEGRAMA - RESP → true', esTelegrama('TELEGRAMA - RESP 04:5:26.pdf') === true)
check('Carta documento → true', esTelegrama('Carta Documento intimacion.pdf') === true)
check('un DNI no es telegrama', esTelegrama('DNI.pdf') === false)

// personaKey — normaliza fecha en carpeta y prefijo de tipo
check('carpeta con fecha → sin fecha', personaKey('RIOS FERNANDO21:1:26') === 'RIOS FERNANDO')
check('archivo suelto → nombre limpio', personaKey('Alta - Contreras.pdf') === 'CONTRERAS')
check('mismo key sin acentos/caso', personaKey('José Ramón') === personaKey('JOSE RAMON'))

// analizarLegajos — universo = carpetas; atribución por carpeta y por nombre suelto
const filas = [
  { name: 'ABALLAY DIEGO', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/ABALLAY DIEGO', is_folder: true },
  { name: 'Alta - Aballay Diego.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/ABALLAY DIEGO/Alta - Aballay Diego.pdf', is_folder: false },
  { name: 'DNI - Aballay Diego.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/ABALLAY DIEGO/DNI - Aballay Diego.pdf', is_folder: false },
  { name: 'HM.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/ABALLAY DIEGO/HM.pdf', is_folder: false },
  { name: 'EPP.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/ABALLAY DIEGO/EPP.pdf', is_folder: false },
  { name: 'QUIROGA MAURICIO', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/QUIROGA MAURICIO', is_folder: true },
  { name: 'HM.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/QUIROGA MAURICIO/HM.pdf', is_folder: false },
  { name: 'Alta Quiroga Mauricio.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/Alta Quiroga Mauricio.pdf', is_folder: false }, // suelto → por nombre
  { name: 'JOFRE ISMAEL', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/JOFRE ISMAEL', is_folder: true },
  { name: 'Baja - Jofre Ismael.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/JOFRE ISMAEL/Baja - Jofre Ismael.pdf', is_folder: false },
  { name: 'Telegrama de despido.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/JOFRE ISMAEL/Telegrama de despido.pdf', is_folder: false },
  { name: 'XYZ suelto sin dueño.pdf', path: 'administracion/ALTAS - BAJAS - HM - EPP - DNI/XYZ suelto sin dueño.pdf', is_folder: false },
]
const r = analizarLegajos(filas)
check('3 personas (3 carpetas)', r.resumen.personas === 3)
check('Aballay activo completo (alta+dni+hm+epp)', r.resumen.completos === 1)
check('Jofre con baja → inactivo', r.resumen.inactivos === 1)
check('Quiroga activo incompleto', r.resumen.incompletos === 1)
const quiroga = r.legajos.find((l) => l.persona === 'QUIROGA MAURICIO')
check('Quiroga: suelto atribuido por nombre (tiene alta)', quiroga.docs.includes('alta') && quiroga.docs.includes('hm'))
check('Quiroga le falta dni y epp', quiroga.falta.includes('dni') && quiroga.falta.includes('epp'))
check('atribución por nombre contó 1', r.atribucion.por_nombre_inferido === 1)
check('suelto sin dueño listado', r.sueltos_sin_dueno.length === 1)
check('KPI activos sin epp = 1 (Quiroga)', r.resumen.activos_sin_epp === 1)
check('Jofre marcado conflicto laboral (telegrama)', r.legajos.find((l) => l.persona === 'JOFRE ISMAEL').conflicto_laboral === true)
check('resumen con_conflicto_laboral = 1', r.resumen.con_conflicto_laboral === 1)
check('Jofre inactivo → activos_con_conflicto = 0', r.resumen.activos_con_conflicto_laboral === 0)
check('conflictos_laborales lista a Jofre', r.conflictos_laborales.length === 1 && r.conflictos_laborales[0].persona === 'JOFRE ISMAEL')

console.log(`\nlegajos.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
