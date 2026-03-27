import type { Metadata } from "next";
import Link from "next/link";
import SiteShell from "../components/site-shell";

export const metadata: Metadata = {
  title: "Deer Flow FAQ: Pricing, Difficulty, and Use Cases",
  description:
    "Answers to common deer flow questions: is deer flow free, who should use it, and how difficult this AI agent workflow is.",
  alternates: {
    canonical: "/deer-flow-faq",
  },
  openGraph: {
    title: "Deer Flow FAQ: Pricing, Difficulty, and Use Cases",
    description:
      "Common deer flow questions answered with concise and practical guidance for developers.",
    url: "/deer-flow-faq",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deer Flow FAQ: Pricing, Difficulty, and Use Cases",
    description:
      "Find answers about deer flow pricing, learning curve, and AI agent workflow suitability.",
  },
};

const faqData = [
  {
    question: "What is Deer Flow?",
    answer: "Deer Flow is an open-source AI agent framework for automation and orchestration.",
  },
  {
    question: "Is Deer Flow free?",
    answer: "Yes. DeerFlow is open-source and available under an MIT license.",
  },
  {
    question: "Who should use Deer Flow?",
    answer: "Developers and advanced users who need structured workflow execution.",
  },
  {
    question: "How to use Deer Flow?",
    answer:
      "Start with a small task, configure models, run the environment, and iterate your workflow steps.",
  },
  {
    question: "Deer Flow vs OpenClaw: which one is better?",
    answer:
      "They optimize for different priorities. Deer Flow often favors control and stable orchestration, while OpenClaw can emphasize flexibility.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqData.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function DeerFlowFaqPage() {
  return (
    <SiteShell currentPath="/deer-flow-faq">
      <article className="mx-auto w-full max-w-4xl px-6 pb-16 pt-16 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Deer Flow FAQ</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-700">
          Quick answers about deer flow, its AI agent workflow model, and whether it fits your use case.
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Common Questions</h2>
          {faqData.map((item) => (
            <details key={item.question} className="rounded-2xl border border-zinc-200 p-6">
              <summary className="cursor-pointer text-lg font-semibold">{item.question}</summary>
              <p className="mt-3 text-zinc-700">{item.answer}</p>
            </details>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Next Steps</h2>
          <div className="mt-5 flex flex-wrap gap-5 text-sm">
            <Link href="/deer-flow-tutorial" className="text-blue-600 hover:text-blue-700">
              Go to deer flow tutorial
            </Link>
            <Link href="/deer-flow-github" className="text-blue-600 hover:text-blue-700">
              Visit deer flow github guide
            </Link>
          </div>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </article>
    </SiteShell>
  );
}
