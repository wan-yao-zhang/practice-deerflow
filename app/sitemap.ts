import type { MetadataRoute } from "next";
import { siteConfig } from "./lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number }> = [
    { path: "/deer-flow", priority: 1 },
    { path: "/deer-flow-tutorial", priority: 0.9 },
    { path: "/deer-flow-github", priority: 0.8 },
    { path: "/deer-flow-faq", priority: 0.8 },
  ];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route.path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route.priority,
  }));
}
