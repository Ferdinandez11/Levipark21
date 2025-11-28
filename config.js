// config.js
import { THEME } from './theme.js';

// Re-exportamos desde el tema centralizado para no romper imports en otros archivos
export const ENV_COLORS = THEME.env;
export const FLOOR_COLORS = THEME.floor;

export const PRICE_PER_M2 = 40; 
export const LOGO_URL = "logo.png"; 
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBy55ReQjx0odJ_aagHh_fjWNr-y97kPoT2stB6axgSvGZV0LLrc9n4EVysCxU4tpweWDVGld0SrAJ/pub?output=csv";

// --- SUPABASE CONFIG ---
export const SUPABASE_URL = "https://ikcjeiyidbrbkbletpxh.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY2plaXlpZGJyYmtibGV0cHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNDM2NTQsImV4cCI6MjA3OTgxOTY1NH0.6x6bLTzHIqqInO2_9N83weQ3SVR0mrQV07pItqpisMs";