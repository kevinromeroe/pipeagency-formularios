// Edge Function del formulario de publicaciones.
// Acciones: cargar · enviar · corregir · quitar
// Una agencia (Felipe Agency) entra con un código y elige a cuál de sus clientes pertenece cada publicación.
// Seguridad: código de acceso por agencia (hash), Cloudflare Turnstile en cada escritura,
// links solo de Instagram/TikTok/YouTube, duplicados bloqueados y límite de envíos por IP.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINS = ["https://pipeagency.datalitica.com.co", "http://localhost:8820"];
const LIMITE = { escrituras: 10, minutos: 10 };

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Json = Record<string, unknown>;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

class Falla extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

// ---- Links -------------------------------------------------------------
type Link = { red: "ig" | "tt" | "yt"; formato: string; clave: string };

function leer(u: string): Link | null {
  let m: RegExpMatchArray | null;
  if ((m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/i)))
    return { red: "ig", formato: m[1].toLowerCase() === "p" ? "Post" : "Reel", clave: `ig:${m[2]}` };
  if ((m = u.match(/instagram\.com\/stories\/([\w.]+)\/(\d+)/i)))
    return { red: "ig", formato: "Historia", clave: `ig-story:${m[2]}` };
  if ((m = u.match(/tiktok\.com\/@([\w.-]+)\/(?:video|photo)\/(\d+)/i)))
    return { red: "tt", formato: "Video", clave: `tt:${m[2]}` };
  if ((m = u.match(/youtube\.com\/shorts\/([\w-]{6,})/i)))
    return { red: "yt", formato: "Short", clave: `yt:${m[1]}` };
  if ((m = u.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{6,})/i)))
    return { red: "yt", formato: "Video", clave: `yt:${m[1]}` };
  return null;
}

async function normalizar(raw: unknown): Promise<Link & { link: string }> {
  const link = String(raw ?? "").trim();
  if (!link || link.length > 500 || !/^https?:\/\//i.test(link))
    throw new Falla(400, "Pega el link completo de la publicación (empieza por https://).");
  let host = "";
  try { host = new URL(link).hostname.toLowerCase(); } catch { /* inválido */ }
  const ok = /(^|\.)(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)$/.test(host);
  if (!ok) throw new Falla(400, "El link debe ser de Instagram, TikTok o YouTube.");
  let l = leer(link);
  // Links cortos de TikTok (vt.tiktok.com): se sigue la redirección para obtener el video
  if (!l && /^(vt|vm)\.tiktok\.com$/.test(host)) {
    try {
      const r = await fetch(link, { redirect: "manual" });
      const to = r.headers.get("location") ?? "";
      l = leer(to);
    } catch { /* se deja como corto */ }
    if (!l) l = { red: "tt", formato: "Video", clave: `tt-corto:${new URL(link).pathname.replace(/\//g, "")}` };
  }
  if (!l) throw new Falla(400, "No reconocemos ese link. Cópialo desde el botón Compartir de la publicación.");
  return { ...l, link };
}

// ---- Verificaciones ----------------------------------------------------
async function agenciaDe(slug: unknown, codigo: unknown) {
  if (typeof slug !== "string" || typeof codigo !== "string" || codigo.length < 8)
    throw new Falla(401, "Este enlace no es válido. Pide a Datalítica el enlace de tu agencia.");
  const { data } = await db.from("form_agencias").select("id, nombre, logo, codigo_hash, activa")
    .eq("slug", slug).maybeSingle();
  if (!data || !data.activa || data.codigo_hash !== await sha256(codigo))
    throw new Falla(401, "Este enlace no es válido. Pide a Datalítica el enlace de tu agencia.");
  const { data: cuentas } = await db.from("form_cuentas").select("id, nombre, campana, logo")
    .eq("agencia_id", data.id).eq("activa", true).order("nombre");
  return { ...data, cuentas: cuentas ?? [] };
}

function cuentaDe(ids: string[], id: unknown) {
  if (typeof id !== "string" || !ids.includes(id)) throw new Falla(400, "Elige el cliente.");
  return id;
}

async function humano(token: unknown, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET");
  if (!secret) throw new Falla(500, "Falta configurar la verificación. Avísale a Datalítica.");
  if (typeof token !== "string" || !token) throw new Falla(400, "Espera a que termine la verificación y vuelve a intentar.");
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const j = await r.json();
  if (!j.success) throw new Falla(400, "La verificación venció. Vuelve a intentar.");
}

async function limite(ipHash: string) {
  const desde = new Date(Date.now() - LIMITE.minutos * 60_000).toISOString();
  const { count } = await db.from("form_envios").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("actualizado_en", desde);
  if ((count ?? 0) >= LIMITE.escrituras)
    throw new Falla(429, "Hiciste muchos envíos seguidos. Espera unos minutos y vuelve a intentar.");
}

async function talentoDe(cuentaId: string, id: unknown) {
  if (typeof id !== "string") throw new Falla(400, "Elige el talento.");
  const { data } = await db.from("form_talentos").select("id").eq("id", id).eq("cuenta_id", cuentaId)
    .eq("activo", true).maybeSingle();
  if (!data) throw new Falla(400, "Elige el talento.");
  return data.id as string;
}

function valor(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000_000) throw new Falla(400, "Revisa el valor pagado.");
  return n;
}

async function lista(cuentaIds: string[]) {
  if (!cuentaIds.length) return [];
  const { data } = await db.from("form_envios")
    .select("id, cuenta_id, talento_id, link, red, formato, salida_nueva, valor_pagado_cop, estado, creado_en")
    .in("cuenta_id", cuentaIds).neq("estado", "quitada").order("creado_en", { ascending: false }).limit(200);
  return data ?? [];
}

// ---- Acciones ----------------------------------------------------------
async function accion(b: Json, ip: string): Promise<Json> {
  const a = await agenciaDe(b.agencia, b.codigo);
  const ids = a.cuentas.map((c) => c.id as string);
  const ipHash = await sha256(`${ip}|${a.id}`);

  if (b.accion === "cargar") {
    const { data: talentos } = ids.length
      ? await db.from("form_talentos").select("id, cuenta_id, nombre").in("cuenta_id", ids).eq("activo", true)
        .order("orden").order("nombre")
      : { data: [] };
    return {
      agencia: { nombre: a.nombre, logo: a.logo },
      clientes: a.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, campana: c.campana, logo: c.logo })),
      talentos: talentos ?? [], envios: await lista(ids),
    };
  }

  if (!["enviar", "corregir", "quitar"].includes(String(b.accion))) throw new Falla(400, "Acción no válida.");
  await humano(b.token, ip);
  await limite(ipHash);

  if (b.accion === "quitar" || b.accion === "corregir") {
    const { data: e } = await db.from("form_envios").select("id, estado").eq("id", String(b.id ?? ""))
      .in("cuenta_id", ids).maybeSingle();
    if (!e) throw new Falla(404, "No encontramos esa publicación.");
    if (e.estado !== "en_cola") throw new Falla(409, "Esta publicación ya fue medida. Para cambiarla, escríbele a Datalítica.");
    if (b.accion === "quitar") {
      await db.from("form_envios").update({ estado: "quitada", actualizado_en: new Date().toISOString(), ip_hash: ipHash }).eq("id", e.id);
      return { ok: true, envios: await lista(ids) };
    }
  }

  const cuenta_id = cuentaDe(ids, b.cliente);
  const talento_id = await talentoDe(cuenta_id, b.talento);
  const l = await normalizar(b.link);
  const fila = {
    cuenta_id, talento_id, link: l.link, link_clave: l.clave, red: l.red, formato: l.formato,
    salida_nueva: b.salida_nueva !== false, valor_pagado_cop: valor(b.valor_pagado),
    ip_hash: ipHash, actualizado_en: new Date().toISOString(),
  };
  const q = b.accion === "enviar"
    ? db.from("form_envios").insert(fila)
    : db.from("form_envios").update(fila).eq("id", String(b.id)).in("cuenta_id", ids);
  const { error } = await q;
  if (error?.code === "23505") throw new Falla(409, "Esta publicación ya fue enviada para este cliente. Si quieres cambiar algo, corrígela en la lista.");
  if (error) throw new Falla(500, "No pudimos guardar la publicación. Vuelve a intentar en un momento.");
  return { ok: true, red: l.red, formato: l.formato, envios: await lista(ids) };
}

Deno.serve(async (req) => {
  const h = { ...cors(req.headers.get("origin")), "Content-Type": "application/json; charset=utf-8" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: h });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
  try {
    const txt = await req.text();
    if (txt.length > 4000) throw new Falla(413, "Solicitud demasiado grande.");
    const out = await accion(JSON.parse(txt), ip);
    return new Response(JSON.stringify(out), { headers: h });
  } catch (e) {
    const status = e instanceof Falla ? e.status : 400;
    const msg = e instanceof Falla ? e.message : "Solicitud no válida.";
    return new Response(JSON.stringify({ error: msg }), { status, headers: h });
  }
});
