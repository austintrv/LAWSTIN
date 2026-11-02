import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createCloudHandler } from "./cloud-handler.mjs";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createCloudHandler({
  supabaseUrl: url,
  publicUrl: `${url}/functions/v1/course-cloud`,
  setupUrl: "https://austintrv.github.io/LAWSTIN/#/connect",
  adminClient: admin,
  authenticate: async (request: Request) => {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    const client = createClient(url, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user || data.user.email !== "trevinoaustin10@gmail.com") return null;
    return { client, user: data.user };
  },
}));
