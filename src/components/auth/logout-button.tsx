"use client";

import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm" className="w-full text-xs">
        Sign out
      </Button>
    </form>
  );
}
