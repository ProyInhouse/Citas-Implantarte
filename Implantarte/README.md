# Implantarte — Piloto v2 🦷

Sistema completo de agendamiento automático con horarios por odontólogo.

---

## Horarios de prueba configurados

| # | Odontólogo | Especialidad | Días | Horario | Duración |
|---|---|---|---|---|---|
| 1 | Dr. Alejandro Contreras | Implantología y Cirugía | Lun-Vie + Sáb | 8-17h (Sáb 9-13h) | 60 min |
| 2 | Dra. María B. Fuenmayor | Ortodoncia | Lun · Mié · Vie | 9-18h | 60 min |
| 3 | Dr. Germán | Odontología General | Mar-Sáb | 8-16h | 45 min |
| 4 | Dra. Vanessa | Odontología Estética | Lun-Jue | 10-19h | 60 min |
| 5 | Dra. Beatriz | Radiología | Lun-Vie | 8-15h | 30 min |

---

## Setup en 3 pasos

### Paso 1 — Importar workflow en n8n

1. Ir a `dentiflow2026.app.n8n.cloud`
2. **Workflows** → botón `+` → **Import from file**
3. Seleccionar `workflows/flujo-completo.json`
4. Abrir el nodo **"Crear Cita en Calendar"** → asignar credencial `Google Calendar account 2`
5. Hacer clic en **Publish** (botón azul arriba a la derecha)

### Paso 2 — Obtener IDs de calendarios de Google

1. Ir a `calendar.google.com` con `testeruser2020rg@gmail.com`
2. Por cada calendario de odontólogo:
   - Clic en los 3 puntitos (...) → **Configuración**
   - Bajar hasta **"ID del calendario"** → copiar
3. Buscar en el nodo **Session Manager** las líneas `calendar_id: ''` y pegar el ID correspondiente

### Paso 3 — Probar con el simulador

1. Abrir `simulator/index.html` en el navegador (doble clic)
2. Verificar que la URL del webhook sea:
   ```
   https://dentiflow2026.app.n8n.cloud/webhook/implantarte-citas
   ```
3. Hacer clic en **"Probar"** para verificar la conexión
4. ¡Chatear con el bot!

---

## Flujo de conversación del bot

```
Paciente escribe "hola"
    ↓
Bot muestra menú (1-Odontología, 2-Radiología, 3-Precios, 4-Resultados)
    ↓
Paciente elige "1" (Odontología)
    ↓
Bot muestra 5 odontólogos con sus horarios
    ↓
Paciente elige "3" (Dr. Germán)
    ↓
Bot pide fecha preferida
    ↓
Paciente escribe "lunes" o "05/05/2025"
    ↓
Bot verifica si el doctor trabaja ese día
Si sí → propone 3 slots disponibles
Si no → informa y pide otro día
    ↓
Paciente confirma con "1"
    ↓
Bot crea evento en Google Calendar ✅
Bot envía mensaje de confirmación con todos los detalles
```

---

## Próximos pasos

- [ ] Agregar IDs reales de calendarios en el Code node
- [ ] Configurar Supabase (ejecutar `supabase/schema.sql`)
- [ ] Conectar WhatsApp real (Evolution API o Meta)
- [ ] Agregar verificación real de disponibilidad vs Google Calendar API
- [ ] Configurar precios reales en el nodo de información

---

## Estructura del proyecto

```
implantarte-v2/
├── workflows/
│   └── flujo-completo.json    ← Importar en n8n
├── simulator/
│   └── index.html             ← Abrir en navegador para probar
├── supabase/
│   └── schema.sql             ← Ejecutar en Supabase SQL Editor
└── README.md
```
