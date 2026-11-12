"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { unlockAdminSection } from "@/lib/admin-gate-actions";

/** Inline password prompt shown in place of エリア・全社シート / 本部
 * ダッシュボード / マスタ管理 until the shared admin/HQ password is entered.
 * Client component so it can read ?adminLockError from anywhere, including
 * layouts (which don't receive searchParams as a prop). */
export function AdminPasswordGate({ redirectTo }: { redirectTo: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("adminLockError");

  return (
    <div className="flex justify-center pt-16">
      <Card className="w-full max-w-sm">
        <CardContent>
          <h2 className="mb-1 text-base font-medium">パスワードが必要です</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            この画面を開くには本部・管理者用のパスワードを入力してください。
          </p>
          <form action={unlockAdminSection} className="flex flex-col gap-3">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="adminPassword">パスワード</Label>
              <Input id="adminPassword" name="password" type="password" required autoFocus />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">開く</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
