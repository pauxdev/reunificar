
/* CONFIGURACIÓN — CAMBIA ESTOS DOS VALORES
  con los datos de tu proyecto en Supabase*/

const SUPABASE_URL = 'https://yhfqfywlkomsnorapgtk.supabase.co';         // ← reemplaza
const SUPABASE_ANON_KEY = 'sb_publishable_sLa68n5Hj74NAAaC9AOjYw_LnyKiytC';         // ← reemplaza
const ADMIN_PASSWORD = 'CONTRASENA_SECRETA_EN_VERCEL';                    // ← CAMBIA ESTO

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);