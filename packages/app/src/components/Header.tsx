import Link from "next/link";
import { FaUser } from "react-icons/fa";
import { auth, signOut } from "@/auth";
import { Avatar, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export async function Header() {
  const session = await auth();

  return (
    <header className="h-fit w-full">
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
        className="flex justify-end"
        id="sign-out"
      >
        {session?.user && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full" type="button">
                {session.user.image ? (
                  <Avatar className="size-8">
                    <AvatarImage src={session.user.image} />
                  </Avatar>
                ) : (
                  <FaUser className="size-8" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-fit">
              <DropdownMenuItem asChild>
                <Link href="/upload">アップロード</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <button
                  className="w-full font-bold text-red-500"
                  form="sign-out"
                  type="submit"
                >
                  ログアウト
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </form>
    </header>
  );
}
