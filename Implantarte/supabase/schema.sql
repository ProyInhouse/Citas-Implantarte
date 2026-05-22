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
  ('1', 'Dr. Alejandro Contreras',  ARRAY['Implantología','Cirugía Oral'],  '4bc56f0d270b7a39841779f0fb8ea4ae5f81768619c1d1e080bc48b39e0b4415@group.calendar.google.com', '08:00', '17:00', '13:00', ARRAY[1,2,3,4,5,6], 60),
  ('2', 'Dra. María B. Fuenmayor',  ARRAY['Ortodoncia'],                    '467b840c9c441c28dc850a65b59ff5b80041c9069b36ab52bb2845be8fa1953e@group.calendar.google.com', '08:00', '14:00', NULL,    ARRAY[1,2,3,4,5],   60),
  ('3', 'Dr. Germán Valenzuela',    ARRAY['Odontología General'],           'ee0b43d672aa375fd063b8d6a2c74dab6f2bd2a1da36a31300aef895cf991d8c@group.calendar.google.com', '08:00', '16:00', '16:00', ARRAY[2,3,4,5,6],   45),
  ('4', 'Dra. Vanessa Touza',       ARRAY['Odontología Estética'],          'cb7d0c4882de72e7b799c6f0c91291beef2dca67a9f23485428203f786ee3e4c@group.calendar.google.com', '10:00', '19:00', NULL,    ARRAY[1,2,3,4],     60),
  ('5', 'Dra. Beatriz Bravo',       ARRAY['Odontopediatría'],               '2a2d690e77424c331b675affdc481a35da4b2e4bb96683827553f1f28d70a1c5@group.calendar.google.com', '08:00', '15:00', NULL,    ARRAY[1,2,3,4,5],   30)
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
