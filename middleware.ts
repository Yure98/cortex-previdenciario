import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const protectedPath = request.nextUrl.pathname.startsWith("/portal") || request.nextUrl.pathname.startsWith("/admin");
  const authPath = request.nextUrl.pathname === "/entrar";

  if (protectedPath && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/entrar";
    login.searchParams.set("retorno", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  if (authPath && data.user) {
    const portal = request.nextUrl.clone();
    portal.pathname = "/portal";
    portal.search = "";
    return NextResponse.redirect(portal);
  }
  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/entrar"],
};
