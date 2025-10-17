import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function () {
  return (
    <div className="grid place-items-center">
      <div className="grid place-items-center gap-4">
        <h1 className="font-bold text-xl">
          このメールアドレスは許可されていません。
        </h1>
        <Button asChild className="font-bold" size="lg">
          <Link href="/">再度ログインする</Link>
        </Button>
      </div>
    </div>
  );
}
