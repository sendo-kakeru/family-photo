import { notFound } from "next/navigation";

export default async function WatchPage(props: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await props.params;
  if (!path.length) return notFound();
  const mediaUrl = `${process.env.NEXT_PUBLIC_CDN_ORIGIN}/${path.join("/")}`;

  return (
    <main className="grid place-items-center py-8">
      <video
        className="h-auto max-h-[80vh] w-full"
        controls
        muted={false}
        playsInline
        preload="metadata"
        src={mediaUrl}
      />
    </main>
  );
}
