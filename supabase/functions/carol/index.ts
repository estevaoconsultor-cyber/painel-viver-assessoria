// carol: IA da assistente Carol no Portal Viver (site).
// Só responde para quem está logado e ativo. O portal manda as instruções e a conversa; a função devolve a resposta.
// Segredos (Supabase → Edge Functions → Secrets): OPENAI_API_KEY ou ANTHROPIC_API_KEY; opcional CAROL_MODELO.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return resp({ ok: true });
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: eu } = await adm.auth.getUser(token);
  if (eu || !u?.user) return resp({ erro: "Faça login de novo." }, 401);
  const { data: pf } = await adm.from("perfis").select("status").eq("id", u.user.id).maybeSingle();
  if (!pf || pf.status !== "ativo") return resp({ erro: "Seu acesso não está ativo." }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { b = {}; }
  const msgs: Msg[] = (Array.isArray(b.mensagens) ? b.mensagens : [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 220000) }));
  if (!msgs.length) return resp({ erro: "Mensagem vazia." }, 400);
  // a primeira mensagem do portal são as instruções da Carol (regras, portal e dados de quem pergunta)
  const sistema = msgs[0].role === "user" ? msgs.shift()!.content : "";
  // junta mensagens seguidas do mesmo lado (exigência da API)
  const conversa: Msg[] = [];
  for (const m of msgs) { const ult = conversa[conversa.length - 1]; if (ult && ult.role === m.role) ult.content += "\n\n" + m.content; else conversa.push({ ...m }); }
  if (!conversa.length || conversa[0].role !== "user") conversa.unshift({ role: "user", content: "Olá" });

  const chaveOpenAI = Deno.env.get("OPENAI_API_KEY"), chaveClaude = Deno.env.get("ANTHROPIC_API_KEY");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 110000);
  try {
    if (chaveClaude) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctl.signal,
        headers: { "x-api-key": chaveClaude, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("CAROL_MODELO") || "claude-sonnet-5-5", max_tokens: 1800, system: sistema, messages: conversa }),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) return resp({ erro: "A IA não respondeu: " + (j?.error?.message || r.status) }, 502);
      const texto = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      return texto ? resp({ resposta: texto }) : resp({ erro: "Resposta vazia da IA." }, 502);
    }
    if (chaveOpenAI) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${chaveOpenAI}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("CAROL_MODELO") || "gpt-6.1-terra", instructions: sistema, input: conversa, max_output_tokens: 2500, store: false }),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) return resp({ erro: "A IA não respondeu: " + (j?.error?.message || r.status) }, 502);
      const texto = (Array.isArray(j.output) ? j.output : []).filter((x: any) => x?.type === "message")
        .flatMap((x: any) => x.content || []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join("").trim();
      return texto ? resp({ resposta: texto }) : resp({ erro: "Resposta vazia da IA." }, 502);
    }
    return resp({ erro: "A Carol ainda não está ligada a uma IA. Um gestor precisa cadastrar a chave da IA no Supabase (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." }, 503);
  } catch (e) {
    return resp({ erro: "A IA demorou demais para responder. Tente de novo." }, 504);
  } finally { clearTimeout(t); }
});
