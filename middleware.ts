import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // login страница доступна всем
  if (pathname === "/admin/login") return NextResponse.next();

  // Supabase кладёт токены в cookie, обычно ключ начинается с "sb-"
  const hasSupabaseCookie = req.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  if (!hasSupabaseCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
