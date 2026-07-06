---
name: playwright-cli
description: "Testing automatizado con Playwright CLI. Navega la app, llena formularios, hace click, toma screenshots, y genera reportes. Activar cuando el usuario dice: testea esto, revisa que funcione, hay un bug, verificalo, checalo en el browser, o despues de implementar una feature para validar."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Skill: QA Automatizado con Playwright CLI

> Ejecutar QA: $ARGUMENTS

---

## Por Que CLI en vez de MCP

Playwright MCP inyecta snapshots completos de pagina directamente en el context window. Esto consume muchos tokens y puede causar ruido para flujos conocidos.

Playwright CLI en cambio:
- Guarda datos de pagina a disco (archivos YAML/screenshots) en vez de llenar el contexto
- Menos tokens consumidos, mayor precision para flujos definidos
- Claude ya sabe usar shell commands, cero overhead de carga de herramientas
- Los artefactos quedan en disco para revision posterior

**Cuando usar MCP en vez de CLI**: Exploracion interactiva de paginas desconocidas o debugging visual en tiempo real. Para todo lo demas, CLI.

---

## Prerequisitos

Instalar Chromium si no esta instalado:

```bash
npx playwright install chromium
```

Debe existir `playwright.config.ts` en la raiz del proyecto (testDir, baseURL, webServer que levanta `npm run dev`). Ver el de `echegaray-os/` como referencia.

---

## Comandos Core de Playwright CLI

`npx playwright` **no tiene** subcomandos interactivos tipo `navigate`/`click`/`fill`/`snapshot` — eso no existe en el CLI real (confirmado con `npx playwright --help` durante PRP-001). Los subcomandos reales son:

```bash
# Correr todos los tests (usa testDir + webServer de playwright.config.ts)
npx playwright test

# Correr un archivo especifico
npx playwright test tests/fundacion.spec.ts

# Screenshot standalone de una URL (util para un chequeo visual rapido, sin test)
npx playwright screenshot http://localhost:3000/ruta screenshot.png

# Grabar interacciones y generar el codigo de un test automaticamente
npx playwright codegen http://localhost:3000

# Ver el reporte HTML de la ultima corrida
npx playwright show-report
```

El flujo real es: escribir un archivo `tests/[feature].spec.ts` con `@playwright/test` (`import { test, expect } from '@playwright/test'`), y correrlo con `npx playwright test`. `playwright.config.ts` ya tiene `screenshot: 'only-on-failure'`, asi que los screenshots se generan solos cuando algo falla — no hace falta pedirlos manualmente en el happy path.

---

## Flujo QA en 6 Fases

### Fase 1: SETUP

Leer los requerimientos del test. Identificar que necesita testing.

- Que feature o bug se esta verificando?
- Cuales son los criterios de exito?
- Que URL/rutas estan involucradas?
- Se necesitan datos de prueba?

Crear el directorio de artefactos:

```bash
mkdir -p .qa-reports/[YYYY-MM-DD]-[nombre]/screenshots
```

### Fase 2: PROVISION

Preparar datos de prueba si son necesarios.

- Crear usuario de prueba via Supabase MCP si aplica
- Preparar datos en BD que el flujo necesite
- Verificar que el servidor de desarrollo esta corriendo

```bash
# Verificar que la app esta corriendo
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Fase 3: NAVIGATE

Escribir (o ubicar) el archivo `tests/[feature].spec.ts` y confirmar que apunta a las rutas relevantes con `page.goto('/ruta')`. Si es un chequeo puntual sin test formal, usar `npx playwright screenshot` para ver el estado inicial:

```bash
npx playwright screenshot http://localhost:3000/[ruta] .qa-reports/[fecha]-[nombre]/screenshots/01-inicio.png
```

### Fase 4: TEST

Escribir los pasos como aserciones de Playwright Test (`expect(locator).toBeVisible()`, `.fill()`, `.click()`) dentro del `.spec.ts`, y correrlos:

```ts
// tests/login.spec.ts
import { test, expect } from '@playwright/test'

test('login redirige al dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password').fill('testpassword')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL('/dashboard')
})
```

```bash
npx playwright test tests/login.spec.ts
```

Con `screenshot: 'only-on-failure'` en `playwright.config.ts`, un test que pasa no genera capturas — si necesitás ver un estado intermedio a proposito, usar `await page.screenshot({ path: '...' })` dentro del test.

### Fase 5: DOCUMENT

El reporte de texto de `npx playwright test` (reporter `list`) ya resume que paso y que fallo. Si algo fallo, revisar los screenshots automaticos en `test-results/` y el `error-context.md` que Playwright genera junto a cada falla — no hace falta pedir un snapshot manual aparte.

**Principio sticky-notes**: no volcar el HTML completo del reporte al contexto. Leer el resumen de la terminal primero; abrir `test-results/` o `npx playwright show-report` solo si se necesita inspeccionar un fallo especifico.

### Fase 6: REPORT

Generar reporte markdown con hallazgos.

---

## Template del Reporte

Crear el archivo `.qa-reports/[YYYY-MM-DD]-[nombre]/report.md`:

```markdown
# QA Report: [Feature/Bug Name]

**Date**: [YYYY-MM-DD]
**Status**: PASSED | FAILED | PARTIALLY_FIXED

## Test Steps
1. [Descripcion del paso] - Screenshot: `screenshots/01-nombre.png`
2. [Descripcion del paso] - Screenshot: `screenshots/02-nombre.png`
3. ...

## Findings
- [Issue encontrado o confirmacion de que funciona]
- [Comportamiento inesperado observado]

## Screenshots
- `screenshots/01-inicio.png` - Estado inicial
- `screenshots/02-accion.png` - Despues de [accion]
- ...

## Recommendations
- [Fix sugerido o mejora]
- [Siguiente paso]
```

---

## Modos de Uso

| Comando | Que hace |
|---------|----------|
| `/qa verify [flujo]` | Verificar que un flujo funciona correctamente |
| `/qa reproduce [bug]` | Intentar reproducir un bug reportado |
| `/qa full [feature]` | QA completo de una feature (happy path + edge cases) |

### Ejemplo: `/qa verify login flow`

```
Fase 1: SETUP - Verificar flujo de login. Criterio: usuario puede loguearse y ver dashboard.
Fase 2: PROVISION - Verificar que existe usuario de prueba en BD.
Fase 3: NAVIGATE - Ir a /login, tomar screenshot.
Fase 4: TEST - Llenar email/password, click Sign In, verificar redireccion a /dashboard.
Fase 5: DOCUMENT - Screenshots en cada paso.
Fase 6: REPORT - Generar report.md con status PASSED/FAILED.
```

---

## Directorio de Output

Todos los artefactos de QA se guardan en:

```
.qa-reports/
  [YYYY-MM-DD]-[nombre]/
    report.md
    screenshots/
      01-nombre.png
      02-nombre.png
      ...
    snapshot-[paso].yaml  (solo si se necesito)
```

---

## Reglas

- SIEMPRE crear el directorio de artefactos antes de empezar
- SIEMPRE tomar screenshots en cada paso critico
- NUNCA volcar snapshots YAML completos al contexto (leerlos on-demand)
- SIEMPRE generar el reporte al final, incluso si todo paso
- Si el servidor no esta corriendo, avisar al usuario en vez de fallar silenciosamente
- Los screenshots se guardan en disco, NO se insertan inline en el reporte (solo paths)
