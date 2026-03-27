import Link from "next/link";
import { navLinks, siteConfig } from "../lib/site";

type SiteShellProps = {
  currentPath: string;
  children: React.ReactNode;
};

function linkClass(isActive: boolean): string {
  return isActive
    ? "text-blue-600"
    : "text-zinc-700 transition-colors hover:text-blue-600";
}

export default function SiteShell({ currentPath, children }: SiteShellProps) {
  return (
    <div className="min-h-full bg-white text-black">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/deer-flow" className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </Link>
          <ul className="flex items-center gap-6 text-sm font-medium">
            {navLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass(currentPath === item.href)}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-zinc-200 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-4 px-6 text-sm sm:flex-row">
          <p className="text-zinc-600">© Deer Flow Guide</p>
          <nav className="flex flex-wrap gap-6">
            {navLinks.map((item) => (
              <Link key={item.href} href={item.href} className="text-blue-600 hover:text-blue-700">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
