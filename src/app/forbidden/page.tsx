import Link from "next/link";

export default async function () {
  return (
    <div className="grid h-full place-items-center">
      <h1 className="font-bold text-2xl">
        このメールアドレスは許可されていません。
      </h1>
      <Link href="/">別のメールアドレスでログインする</Link>
    </div>
  );
}
