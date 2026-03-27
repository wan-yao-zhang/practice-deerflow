export const siteConfig = {
  name: "Deer Flow Guide",
  description:
    "Deer Flow Guide explains what deer flow is, how the AI agent workflow works, and how to get started.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://githubbox.info").replace(
    /\/$/,
    "",
  ),
};

export const navLinks = [
  { href: "/deer-flow", label: "What is" },
  { href: "/deer-flow-tutorial", label: "Tutorial" },
  { href: "/deer-flow-github", label: "GitHub" },
  { href: "/deer-flow-faq", label: "FAQ" },
];
