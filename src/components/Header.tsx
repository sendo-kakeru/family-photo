import { FaUser } from "react-icons/fa";
import { auth, signOut } from "@/auth";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export async function Header() {
  const session = await auth();

  return (
    <header className="absolute top-0 right-0 left-0 z-50 w-full bg-transparent px-4 pt-4">
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
        className="flex justify-end"
        id="sign-out"
      >
        {session?.user && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button">
                {session.user.image ? (
                  <Avatar className="size-8">
                    <AvatarImage src={session.user.image} />
                  </Avatar>
                ) : (
                  <FaUser className="size-8" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-fit">
              <Button
                className="font-bold"
                form="sign-out"
                type="submit"
                variant="destructive"
              >
                ログアウト
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </form>
    </header>
  );
}
