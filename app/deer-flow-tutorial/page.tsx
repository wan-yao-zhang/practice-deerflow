import type { Metadata } from "next";
import Link from "next/link";
import SiteShell from "../components/site-shell";

export const metadata: Metadata = {
  title: "Deer Flow Tutorial: How to Use Deer Flow",
  description:
    "A practical deer flow tutorial for developers. Learn setup, execution flow, and a real AI agent workflow example.",
  alternates: {
    canonical: "/deer-flow-tutorial",
  },
  openGraph: {
    title: "Deer Flow Tutorial: How to Use Deer Flow",
    description:
      "Step-by-step guide to using deer flow, from task definition to final result generation.",
    url: "/deer-flow-tutorial",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deer Flow Tutorial: How to Use Deer Flow",
    description:
      "Learn how to use deer flow for a structured AI agent workflow in real projects.",
  },
};

const workflowSteps = [
  "Define a task",
  "System assigns agents",
  "Agents execute tasks",
  "Results are generated",
];

const exampleSteps = ["Create research agent", "Collect data", "Analyze results", "Generate summary"];

export default function DeerFlowTutorialPage() {
  return (
    <SiteShell currentPath="/deer-flow-tutorial">
      <article className="mx-auto w-full max-w-4xl px-6 pb-16 pt-16 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          How to Use Deer Flow (Beginner Guide)
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-700">
          Deer Flow is not a simple tool. It requires setup and is mainly for developers
          who want a controllable AI agent workflow.
        </p>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">How It Works</h2>
          <ol className="mt-6 list-decimal space-y-3 pl-6 text-lg text-zinc-700">
            {workflowSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Example Workflow</h2>
          <p className="mt-4 text-lg font-medium">Task: Research AI tools market</p>
          <ul className="mt-5 list-disc space-y-3 pl-6 text-lg text-zinc-700">
            {exampleSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Basic Setup</h2>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            Clone the repository and install dependencies using Git and Python.
            In most cases, developers start from the deer flow github repository README.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Use Cases</h2>
          <ul className="mt-5 list-disc space-y-3 pl-6 text-lg text-zinc-700">
            <li>Research</li>
            <li>Automation</li>
            <li>Workflow tasks</li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Is Deer Flow Hard to Use?</h2>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            Yes, it requires technical knowledge and is not beginner-friendly.
            If you are new to agent systems, begin with simple tasks and short workflows.
          </p>
        </section>

        <section className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Conclusion</h2>
          <p className="mt-4 text-lg leading-8 text-zinc-700">
            Deer Flow is powerful but best suited for developers who need repeatable AI
            agent workflow execution.
          </p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            <Link href="/deer-flow-github" className="text-blue-600 hover:text-blue-700">
              Go to deer flow github guide
            </Link>
            <Link href="/deer-flow-faq" className="text-blue-600 hover:text-blue-700">
              Read FAQ
            </Link>
          </div>
        </section>
      </article>
    </SiteShell>
  );
}
