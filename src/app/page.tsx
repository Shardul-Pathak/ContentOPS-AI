import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Content Ops Platform</h1>
      <p className="text-center text-neutral-400">
        An autonomous AI content operations platform. A coordinated AI content team that
        researches, strategizes, writes, validates, illustrates, and publishes company
        content — keeping consequential external actions under human control.
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="rounded-md border border-neutral-700 px-4 py-2 hover:bg-neutral-900" href="/companies">
          Company Context
        </Link>
        <Link className="rounded-md border border-neutral-700 px-4 py-2 hover:bg-neutral-900" href="/campaigns">
          Campaigns
        </Link>
      </nav>
    </main>
  );
}
