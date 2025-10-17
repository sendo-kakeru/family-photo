import { auth, signIn, signOut } from "@/auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const session = await auth();

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <p>Welcome to {session.user.name}</p>
        <button type="submit">Sign Out</button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      {error === "unauthorized" && <p>続行するにはログインしてください</p>}
      <button type="submit">Signin with Google</button>
    </form>
  );
}
