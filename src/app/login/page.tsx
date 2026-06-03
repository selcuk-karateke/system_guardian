import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthEnabled } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  if (!isAuthEnabled()) {
    redirect(next && next.startsWith("/") ? next : "/");
  }

  const user = await getSessionUser();
  if (user) {
    redirect(next && next.startsWith("/") ? next : "/");
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            System Guardian
          </p>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">Sign in</h1>
        </div>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
