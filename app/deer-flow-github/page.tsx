import type { Metadata } from "next";
import Link from "next/link";
import SiteShell from "../components/site-shell";

export const metadata: Metadata = {
  title: "Deer Flow GitHub Guide: Where to Start",
  description:
    "Navigate the deer flow github repository quickly: key docs, version notes, setup path, and practical starting points.",
  alternates: {
    canonical: "/deer-flow-github",
  },
  openGraph: {
    title: "Deer Flow GitHub Guide: Where to Start",
    description:
      "A developer-friendly map of the deer flow github repo and documentation structure.",
    url: "/deer-flow-github",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deer Flow GitHub Guide: Where to Start",
    description: "Get oriented in deer flow github and launch your first workflow quickly.",
  },
};

export default function DeerFlowGithubPage() {
  return (
    <SiteShell currentPath="/deer-flow-github">
      <article className="mx-auto w-full max-w-4xl px-6 pb-16 pt-16 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Deer Flow GitHub Guide</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-700">
          This page helps you read the deer flow github repository in the right order,
          so you understand the product before diving into implementation details.
        </p>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Official Repository</h2>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            Start from the official repository and README. The README explains the project
            purpose, quick start, and architecture at a high level.
          </p>
          <a
            href="https://github.com/bytedance/deer-flow"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-blue-600 hover:text-blue-700"
          >
            Open deer flow github
          </a>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Version Context</h2>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            DeerFlow 2.0 is a rewrite. If you find older tutorials, verify whether they refer
            to the 1.x branch or the current 2.0 implementation.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Quick Start Path</h2>
          <ol className="mt-6 list-decimal space-y-3 pl-6 text-lg text-zinc-700">
            <li>Read README overview and quick start section.</li>
            <li>Follow config setup and choose your model provider.</li>
            <li>Run in Docker mode first for a stable initial environment.</li>
            <li>Move to local development only after first successful run.</li>
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">What to Read Next</h2>
          <div className="mt-5 flex flex-wrap gap-5 text-sm">
            <Link href="/deer-flow-tutorial" className="text-blue-600 hover:text-blue-700">
              Read deer flow tutorial
            </Link>
            <Link href="/deer-flow-faq" className="text-blue-600 hover:text-blue-700">
              Check FAQ and common concerns
            </Link>
            <Link href="/deer-flow" className="text-blue-600 hover:text-blue-700">
              Back to what is deer flow
            </Link>
          </div>
        </section>
      </article>
    </SiteShell>
  );
}
