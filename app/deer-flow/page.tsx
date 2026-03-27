import type { Metadata } from "next";
import Link from "next/link";
import SiteShell from "../components/site-shell";

export const metadata: Metadata = {
  title: "What is Deer Flow? AI Agent Workflow Explained",
  description:
    "Learn what deer flow is, how the AI agent workflow operates, and when to use deer-flow for complex automation tasks.",
  alternates: {
    canonical: "/deer-flow",
  },
  openGraph: {
    title: "What is Deer Flow? AI Agent Workflow Explained",
    description:
      "A practical guide to deer flow, including core components, workflow steps, and common use cases.",
    url: "/deer-flow",
  },
  twitter: {
    card: "summary_large_image",
    title: "What is Deer Flow? AI Agent Workflow Explained",
    description:
      "Understand deer flow and how this AI agent workflow can automate complex tasks.",
  },
};

const components = [
  {
    name: "Sub-agents",
    description: "Multiple AI agents handling different tasks in parallel when needed.",
  },
  {
    name: "Memory",
    description: "Stores context across steps so long workflow execution stays coherent.",
  },
  {
    name: "Sandbox",
    description: "Safe execution environment for file operations, commands, and experiments.",
  },
  {
    name: "Skills",
    description: "Extendable capabilities like search, coding, writing, and analysis.",
  },
];

const steps = ["Define Task", "Assign Agents", "Execute Workflow", "Generate Result"];

const useCases = [
  {
    title: "Research Automation",
    description: "Automatically gather and summarize data from multiple sources.",
  },
  {
    title: "Workflow Automation",
    description: "Execute multi-step processes with a consistent AI agent workflow.",
  },
  {
    title: "Complex Tasks",
    description: "Break large tasks into smaller chunks and merge outputs reliably.",
  },
];

const faqs = [
  {
    q: "What is Deer Flow?",
    a: "Deer Flow is an open-source AI agent framework for automation and orchestration.",
  },
  {
    q: "Is Deer Flow free?",
    a: "Yes. DeerFlow is open-source under an MIT license.",
  },
  {
    q: "Who should use Deer Flow?",
    a: "Developers and advanced users who need structured workflow automation.",
  },
];

export default function DeerFlowPage() {
  return (
    <SiteShell currentPath="/deer-flow">
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-16 sm:pt-20">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Deer Flow AI: What It Is and How It Works
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-700">
            Deer flow is an AI agent framework that coordinates multiple agents to complete
            complex tasks through a clear workflow, from planning to execution.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="#what-is"
              className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
            >
              What is Deer Flow
            </Link>
            <Link
              href="/deer-flow-tutorial"
              className="rounded-lg border border-blue-600 px-5 py-3 font-medium text-blue-600 hover:bg-blue-50"
            >
              View Tutorial
            </Link>
          </div>
        </div>
      </section>

      <section id="what-is" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">What is Deer Flow?</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-700">
              DeerFlow is an open-source AI agent orchestration system that manages multiple
              agents working together.
            </p>
            <p className="mt-4 text-lg leading-8 text-zinc-700">
              It combines sub-agents, memory, sandbox environments, and skills to execute
              complex workflows.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-xl font-medium">
            Task → Agents → Execution → Result
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight">Core Components</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {components.map((item) => (
            <article key={item.name} className="rounded-2xl border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <p className="mt-3 text-zinc-700">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">How Deer Flow Works</h2>
          <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="rounded-2xl border border-zinc-200 bg-white p-6">
                <p className="text-sm font-semibold text-blue-600">Step {index + 1}</p>
                <p className="mt-2 text-lg font-semibold">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight">Use Cases</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {useCases.map((item) => (
            <article key={item.title} className="rounded-2xl border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-zinc-700">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">Deer Flow vs OpenClaw</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="px-5 py-3">Feature</th>
                  <th className="px-5 py-3">Deer Flow</th>
                  <th className="px-5 py-3">OpenClaw</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-zinc-200">
                  <td className="px-5 py-3 font-medium">Control</td>
                  <td className="px-5 py-3">High</td>
                  <td className="px-5 py-3">Lower</td>
                </tr>
                <tr className="border-t border-zinc-200">
                  <td className="px-5 py-3 font-medium">Flexibility</td>
                  <td className="px-5 py-3">Medium</td>
                  <td className="px-5 py-3">High</td>
                </tr>
                <tr className="border-t border-zinc-200">
                  <td className="px-5 py-3 font-medium">Stability</td>
                  <td className="px-5 py-3">High</td>
                  <td className="px-5 py-3">Medium</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight">Frequently Asked Questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((item) => (
            <details key={item.q} className="rounded-2xl border border-zinc-200 p-6">
              <summary className="cursor-pointer text-lg font-semibold">{item.q}</summary>
              <p className="mt-3 text-zinc-700">{item.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-5 text-sm">
          <Link href="/deer-flow-faq" className="text-blue-600 hover:text-blue-700">
            See full FAQ page
          </Link>
          <Link href="/deer-flow-github" className="text-blue-600 hover:text-blue-700">
            Explore deer flow github guide
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
