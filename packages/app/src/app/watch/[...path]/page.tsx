import { notFound } from "next/navigation";

export default async function WatchPage(props: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await props.params;
  if (!path.length) return notFound();

  return (
    <main className="grid place-items-center py-8">
      <video
        className="h-auto max-h-[80vh] w-full"
        controls
        muted={false}
        playsInline
        preload="metadata"
        src={`/${path.join("/")}`}
      />
    </main>
  );
}
