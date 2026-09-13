/* =============================================================================
   config.js — datos de conexión con Supabase.

   La clave `anon` es PÚBLICA por diseño: va incrustada en el JavaScript que
   descarga cualquier visitante. Lo que protege tus datos no es esconderla, son
   las políticas RLS de db/schema.sql, que filtran cada fila por usuario.

   La otra clave que da Supabase, `service_role`, se salta RLS: NO debe aparecer
   nunca en este archivo ni en ninguno del frontend.

   Dónde se copian: Supabase → tu proyecto → Settings → API.
   ============================================================================= */
window.LD_CONFIG = {
  SUPABASE_URL: 'https://jhaoozzmamorvkigdsyu.supabase.co',        // https://xxxxxxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoYW9venptYW1vcnZraWdkc3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNjk5MDYsImV4cCI6MjEwNDg0NTkwNn0.EnO72qO6X2xfJM6RsM8kH_ejtC-eHU7Ujmq2gYom0q0'    // eyJhbGciOiJIUzI1NiIs...
};
