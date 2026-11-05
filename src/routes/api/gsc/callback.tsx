import { createFileRoute } from "@tanstack/react-router";

// Retour d'OAuth Google : échange le code, mémorise le jeton côté serveur, renvoie vers le projet.
export const Route = createFileRoute("/api/gsc/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const back = (projectId: string | null, status: string) =>
          Response.redirect(
            `${url.origin}${projectId ? `/projects/${projectId}` : "/projects"}?gsc=${status}`,
            302,
          );
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state) return back(null, "error");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { exchangeCode } = await import("@/lib/seo/gsc.server");
        const { data: st } = await supabaseAdmin
          .from("seo_oauth_states")
          .select("*")
          .eq("nonce", state)
          .maybeSingle();
        if (!st || Date.now() - new Date(st.created_at).getTime() > 600_000)
          return back(null, "expired");
        await supabaseAdmin.from("seo_oauth_states").delete().eq("nonce", state);
        if (!code || url.searchParams.get("error")) return back(st.project_id, "denied");

        try {
          const tokens = await exchangeCode(code, `${url.origin}/api/gsc/callback`);
          if (!tokens.refresh_token) return back(st.project_id, "error");
          await supabaseAdmin
            .from("seo_google_connections")
            .upsert(
              { user_id: st.user_id, refresh_token: tokens.refresh_token },
              { onConflict: "user_id" },
            );
          return back(st.project_id, "connected");
        } catch {
          return back(st.project_id, "error");
        }
      },
    },
  },
});
