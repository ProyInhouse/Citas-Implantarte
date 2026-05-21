# Implantarte v2 — Contexto del Proyecto

## Qué es esto
Bot de agendamiento automático de citas para la clínica dental **Implantarte** (Venezuela).
Los pacientes escriben por WhatsApp → el bot guía el flujo → crea eventos en Google Calendar.

## Arquitectura

```
Paciente (WhatsApp)
    ↓
Gateway WhatsApp (Meta Cloud API — objetivo final)
    ↓
n8n Cloud — dentiflow2026.app.n8n.cloud
    ↓
Google Calendar (5 odontólogos)
```

---

## Componentes y estado actual

### 1. n8n Workflow — Flujo Principal de Citas
- **URL**: `http://localhost:5678/webhook/`
- **Webhook producción**: `http://localhost:5678/webhook/implatarte-citas`
- **Workflow ID**: `AWZcau1ITvrCFnu5`
- **Archivo local**: `workflows/flujo-completo.json`
- **Estado**: Pendiente reimportar con la arquitectura actualizada (17 nodos).

**Flujo de estados completo:**
```
inicio
 ├─ 1 (Odontología) → solicitar_nombre → seleccion_odontologo (doctores 1-4)
 │     ↓ doctor elegido
 │  verificando_disponibilidad → [Verificar Disponibilidad → Consultar Freebusy → Filtrar Slots]
 │     ↓ 3 slots libres
 │  seleccion_slot → confirmacion
 │     ↓ 1 confirmar
 │  [Crear Cita en Calendar] → gestion_cita (event_id guardado)
 │     ├─ 1 reportar → realizacion_cita → fin_proceso
 │     ├─ 2 reagendar → verificando_disponibilidad (ciclo)
 │     ├─ 3 menú → inicio
 │     └─ 4 cancelar → cancelar_confirmacion → [Cancelar Cita en Calendar] → completado
 ├─ 2 (Radiología) → solicitar_nombre_radio → verificando_disponibilidad (Dra. Beatriz directo)
 ├─ 3 (Precios) → inicio
 └─ 4 (Resultados) → inicio
```

**Arquitectura de nodos (17 total):**
```
Webhook Entrada → Session Manager → Router de Acciones (Switch, 4 outputs)
  verificar  → Verificar Disponibilidad → Router Disponibilidad
                  error → Responder al Simulador B
                  ok    → Consultar Freebusy (HTTP) → Filtrar Slots Libres → Responder al Simulador B
  crear      → Preparar Evento → Crear Cita en Calendar → Respuesta Confirmacion → Responder al Simulador C
  cancelar   → Cancelar Cita en Calendar → Respuesta Cancelacion → Responder al Simulador D
  fallback   → Responder al Simulador A
```

**Funcionalidades clave del Session Manager:**
- 5 odontólogos con `calendar_id`, días de trabajo, horario y duración de slot
- Timeout de sesión: 30 minutos por inactividad
- Reset con palabras: `menu`, `inicio`, `reiniciar`, `hola`, `hi`, `0`, `reset`, `cancelar`
- Radiología (opción 2): asigna `ODONTOLOGOS['5']` (Dra. Beatriz) automáticamente
- Odontología (opción 1): muestra solo doctores 1–4
- Validación de nombre: rechaza si `length < 3` o es solo números
- Slots: se buscan automáticamente los próximos 3 disponibles (sin pedir fecha)
- Cancelación: guarda `event_id` en sesión al crear cita; lo usa para eliminar el evento

**Disponibilidad real (freebusy):**
- `Verificar Disponibilidad` genera candidatos + `freebusy_params`
- `Consultar Freebusy` llama `POST /calendar/v3/freeBusy` con OAuth Google
- `Filtrar Slots Libres` descarta ocupados, devuelve primeros 3 libres
- Referencia upstream: `$('Verificar Disponibilidad').first().json` para recuperar contexto tras llamada HTTP
- Fallback: si freebusy falla, muestra todos los slots generados

**Formato de evento en Google Calendar:**
```
Summary: Cita {especialidad} - {nombre_paciente}
Description:
  Paciente: {nombre}
  Teléfono: +{telefono}
  Servicio: {odontologia|radiologia}
  Canal: WhatsApp Bot
  Agendado: DentiFlow / Implantarte
```

---

### 2. n8n Workflow — Recordatorio de Citas
- **Archivo local**: `workflows/recordatorio-citas.json`
- **Estado**: Creado, pendiente importar en n8n.
- **Trigger**: Cron `0 8 * * *` (8am diario, hora del servidor n8n)

**Arquitectura (6 nodos):**
```
Ejecutar Diario 8am (Schedule)
  → Preparar Calendarios (Code) — genera 5 items con {calendar_id, doctor, timeMin, timeMax}
  → Obtener Eventos Mañana (Google Calendar getAll, continueOnFail)
  → Parsear Recordatorios (Code) — extrae teléfono de description, formatea mensaje
  → Tiene Telefono (IF)
      true  → Enviar Recordatorio WAHA (HTTP POST)
      false → (sin salida, item descartado)
```

**Extracción de teléfono:** regex `/Teléfono:\s*\+?(\d+)/i` sobre `event.description`

**Mensaje enviado (WhatsApp):**
```
🦷 *Recordatorio de Cita — Implantarte*

Hola *{nombre}*, tu cita es *mañana*:

👨‍⚕️ {doctor}
🦷 {especialidad}
📅 {fecha}
🕐 {hora} hrs

📍 *Implantarte — Clínica Dental*

📌 *Recuerda:*
• Llegar *10 minutos antes*
• Traer cédula de identidad
• Para cancelar escribe *cancelar*

¡Te esperamos!
```

---

### 3. Simulador local
- **HTML**: `simulator/index.html`
- **Servidor proxy**: `simulator/server.py` (Python, puerto 8080)
- **Cómo correr**: `cd simulator && python server.py`
- **URL**: `http://localhost:8080`
- **Webhook configurado**: `http://localhost:8080/webhook-test` → proxy a n8n
- **Por qué proxy**: CORS bloquea llamadas desde localhost hacia n8n cloud
- **Formato respuesta**: JSON `{respuesta, estado}` — el simulador actualiza botones según `estado`
- **Maneja TwiML como fallback**: si la respuesta no es JSON, extrae texto del tag `<Message>`

### 4. WAHA (WhatsApp HTTP API)
- **URL**: `https://devlikeaprowaha-production-654e.up.railway.app`
- **Dashboard**: `/dashboard` (user/pass en variables Railway `WAHA_DASHBOARD_USERNAME/PASSWORD`)
- **API Key**: `wak_LQRXWC9T1/KR7J1F` (variable `WAHA_API_KEY`)
- **Estado**: Servidor conectado. Sesión `por defecto` con número `584162771663` (Creativa Imagen)
- **Problema**: Cuenta `584162771663` en revisión por Meta tras conectarse a WAHA (cliente no oficial). No usar WAHA con números reales en producción.
- **Endpoint recordatorios**: `POST /api/sendText` con `{session, to: "{tel}@c.us", text}`

### 5. Meta WhatsApp Cloud API (objetivo para producción)
- **App**: `implantarte-oficial` (ID: `2103656213536887`)
- **Portfolio**: Rabdy Marketing
- **Modo**: Desarrollo (no Activo aún)
- **Estado**: App creada con productos WhatsApp + Webhooks. Bloqueada por "Onboarding failure" (verificación de seguridad). Pendiente completar verificación de identidad.
- **Próximos pasos**: Verificar identidad → Phone Number ID + Access Token → webhook → modo Live
- **Nota recordatorios**: Los mensajes proactivos (recordatorios) requieren templates pre-aprobados por Meta.

### 6. Evolution API — Railway
- **URL**: `https://evolution-api-production-8a3b.up.railway.app`
- **Estado**: Desplegado, corriendo. No usado actualmente.

### 7. Twilio WhatsApp Sandbox
- **Número**: `+1 415 523 8886` | código: `join strength-production`
- **SID**: `[TWILIO_ACCOUNT_SID]`
- **Estado**: Descartado — falla el join desde Venezuela (+58)

### 8. Supabase
- **Archivo schema**: `supabase/schema.sql`
- **Estado**: Schema listo, NO ejecutado aún en Supabase
- **Propósito**: Reemplazar `$getWorkflowStaticData('global')` (sesiones se pierden si n8n reinicia)

---

## Odontólogos configurados

| # | Nombre | Especialidad | Días | Horario |
|---|--------|-------------|------|---------|
| 1 | Dr. Alejandro Contreras | Implantología y Cirugía | Lun-Vie + Sáb | 8-17h (Sáb 9-13h) |
| 2 | Dra. María B. Fuenmayor | Ortodoncia | Lun·Mié·Vie | 9-18h |
| 3 | Dr. Germán | Odontología General | Mar-Sáb | 8-16h |
| 4 | Dra. Vanessa | Odontología Estética | Lun-Jue | 10-19h |
| 5 | Dra. Beatriz | Radiología | Lun-Vie | 8-15h |

---

## Pendientes para producción

- [ ] **Reimportar `flujo-completo.json`** en n8n y publicar (17 nodos, arquitectura actualizada)
- [ ] **Importar `recordatorio-citas.json`** en n8n como workflow separado y activar
- [ ] **Conectar credencial real** de Google Calendar (`googleCalendarOAuth2Api`) en todos los nodos que la requieren
- [ ] **Ajustar timezone del cron** de recordatorios si el servidor n8n no está en UTC-4 (Venezuela)
- [ ] **Probar flujo completo** en simulador: inicio → nombre → doctor → slot → confirmar → cancelar → reagendar
- [ ] **Resolver Onboarding failure** en Meta Developer Console (verificar identidad)
- [ ] **Obtener Phone Number ID y Access Token** de Meta Cloud API
- [ ] **Configurar webhook en Meta** → `http://localhost:5678/webhook/implantarte-citas`
- [ ] **Activar modo Live** en Meta app `implantarte-oficial`
- [ ] **Aprobar templates de mensaje** en Meta para recordatorios proactivos
- [ ] **Ejecutar schema.sql** en Supabase y migrar sesiones desde staticData
- [ ] **Agregar IDs reales** de Google Calendar en Session Manager (ya están hardcodeados en el código)

---

## Estructura del proyecto

```
implantarte-v2/
├── workflows/
│   ├── flujo-completo.json       ← Flujo principal WhatsApp (17 nodos) — reimportar en n8n
│   └── recordatorio-citas.json   ← Recordatorios diarios 8am (6 nodos) — importar en n8n
├── simulator/
│   ├── index.html                ← Simulador (URL: http://localhost:8080)
│   └── server.py                 ← Proxy Python → n8n (correr con: python server.py)
├── supabase/
│   └── schema.sql                ← Ejecutar en Supabase SQL Editor
├── whatsapp/
│   ├── docker-compose.yml
│   ├── crear-instancia.sh
│   └── SETUP.md
└── CLAUDE.md                     ← Este archivo
```
