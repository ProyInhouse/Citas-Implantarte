-- ============================================
-- IMPLANTARTE - SCHEMA SUPABASE v2
-- Con horarios de prueba por odontólogo
-- ============================================

-- Odontólogos con horarios individuales
CREATE TABLE IF NOT EXISTS odontologos (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo       TEXT UNIQUE NOT NULL,  -- '1','2','3','4','5' para el bot
  nombre       TEXT NOT NULL,
  especialidad TEXT[] NOT NULL,
  calendar_id  TEXT DEFAULT '',       -- Completar con ID de Google Calendar
  activo       BOOLEAN DEFAULT true,
  -- Horario
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  hora_fin_sab TIME,                  -- NULL si no trabaja sábados
  dias_atencion INT[] NOT NULL,       -- 1=Lun, 2=Mar ... 6=Sáb, 7=Dom
  duracion_min INT DEFAULT 60,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar odontólogos con horarios de prueba
INSERT INTO odontologos (codigo, nombre, especialidad, calendar_id, hora_inicio, hora_fin, hora_fin_sab, dias_atencion, duracion_min)
VALUES
  ('1', 'Dr. Alejandro Contreras',  ARRAY['Implantología','Cirugía Oral'],  '3e2d7a3f62231eff8e8f233ec1dbe1f8a416539f52530171c9e457d7c735e87a@group.calendar.google.com', '08:00', '17:00', '13:00', ARRAY[1,2,3,4,5,6], 60),
  ('2', 'Dra. María B. Fuenmayor', ARRAY['Ortodoncia'],                    '7b66ca52aef646deff180d5d8e1fcb1767ae9f26db8304f9879c93cdaffe2dfe@group.calendar.google.com', '09:00', '18:00', NULL,    ARRAY[1,3,5],       60),
  ('3', 'Dr. Germán',               ARRAY['Odontología General'],           'cf87f5290d01e5ad24e5e8fe6f0251a57e757c1fb3b95c706ca0c924fc779930@group.calendar.google.com', '08:00', '16:00', '16:00', ARRAY[2,3,4,5,6],   45),
  ('4', 'Dra. Vanessa',             ARRAY['Odontología Estética'],          'cb7d0c4882de72e7b799c6f0c91291beef2dca67a9f23485428203f786ee3e4c@group.calendar.google.com', '10:00', '19:00', NULL,    ARRAY[1,2,3,4],     60),
  ('5', 'Dra. Beatriz',             ARRAY['Radiología'],                    'b45e211b61fb2ddb7309f449c7cc507edd0a9b90e2d359bead1fdc2639b0af4f@group.calendar.google.com', '08:00', '15:00', NULL,    ARRAY[1,2,3,4,5],   30)
ON CONFLICT (codigo) DO NOTHING;

-- Pacientes
CREATE TABLE IF NOT EXISTS pacientes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre        TEXT,
  telefono      TEXT UNIQUE NOT NULL,
  email         TEXT,
  canal_entrada TEXT DEFAULT 'whatsapp',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Casos de solicitud de cita
CREATE TABLE IF NOT EXISTS casos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id      UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  odontologo_id    UUID REFERENCES odontologos(id),
  servicio         TEXT NOT NULL,
  estado           TEXT DEFAULT 'pendiente' CHECK (estado IN (
                     'pendiente','propuesto','confirmado',
                     'descartado','realizado','no_realizado','reagendado'
                   )),
  fecha_solicitada TIMESTAMPTZ,
  fecha_propuesta  TIMESTAMPTZ,
  fecha_confirmada TIMESTAMPTZ,
  fecha_realizada  TIMESTAMPTZ,
  canal_entrada    TEXT,
  google_event_id  TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Historial de mensajes
CREATE TABLE IF NOT EXISTS mensajes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id     UUID REFERENCES casos(id),
  paciente_id UUID REFERENCES pacientes(id),
  direccion   TEXT NOT NULL CHECK (direccion IN ('entrante','saliente')),
  canal       TEXT NOT NULL,
  contenido   TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sesiones activas del bot (alternativa a static data de n8n)
CREATE TABLE IF NOT EXISTS sesiones_bot (
  telefono     TEXT PRIMARY KEY,
  estado       TEXT DEFAULT 'inicio',
  datos        JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_casos_estado       ON casos(estado);
CREATE INDEX IF NOT EXISTS idx_casos_odontologo   ON casos(odontologo_id);
CREATE INDEX IF NOT EXISTS idx_casos_fecha        ON casos(fecha_propuesta);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefono ON pacientes(telefono);
CREATE INDEX IF NOT EXISTS idx_mensajes_caso      ON mensajes(caso_id);

-- Vista útil para ver citas del día
CREATE OR REPLACE VIEW citas_hoy AS
SELECT
  c.id,
  p.nombre AS paciente,
  p.telefono,
  o.nombre AS odontologo,
  c.servicio,
  c.estado,
  c.fecha_confirmada,
  c.google_event_id
FROM casos c
JOIN pacientes p ON p.id = c.paciente_id
JOIN odontologos o ON o.id = c.odontologo_id
WHERE DATE(c.fecha_confirmada) = CURRENT_DATE
ORDER BY c.fecha_confirmada;

-- RLS (activar para producción)
ALTER TABLE pacientes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_bot ENABLE ROW LEVEL SECURITY;

-- Política permisiva para el service role (n8n usará service key)
CREATE POLICY "service_role_all" ON pacientes    FOR ALL USING (true);
CREATE POLICY "service_role_all" ON casos        FOR ALL USING (true);
CREATE POLICY "service_role_all" ON mensajes     FOR ALL USING (true);
CREATE POLICY "service_role_all" ON sesiones_bot FOR ALL USING (true);
