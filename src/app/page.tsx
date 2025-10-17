import { auth, signIn } from "@/auth";
import { GoogleSigninButton } from "@/components/GoogleSigninButton";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const session = await auth();

  if (session?.user) {
    return (
      // TODO: ギャラリー
      <p>Welcome to {session.user.name}</p>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
      className="grid place-items-center gap-2"
    >
      <div className="grid place-items-center gap-4">
        {error === "unauthorized" && (
          <p className="font-bold text-xl">続行するにはログインしてください</p>
        )}
        <GoogleSigninButton type="submit">
          Signin with Google
        </GoogleSigninButton>
      </div>
    </form>
  );
}
