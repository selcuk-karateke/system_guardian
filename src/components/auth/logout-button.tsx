"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className={
          compact
            ? "w-full h-9 px-0 text-xs"
            : "w-full text-xs"
        }
        title="Sign out"
        aria-label="Sign out"
      >
        {compact ? <LogOut className="size-4" aria-hidden /> : "Sign out"}
      </Button>
    </form>
  );
}
