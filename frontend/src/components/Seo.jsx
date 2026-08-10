import { useEffect } from "react";

const SITE_URL = "https://casemoney.ru";
const DEFAULT_IMAGE = `${SITE_URL}/icons/icon-512.png`;

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

export default function Seo({
  title,
  description,
  path = "/",
  type = "website",
  image = DEFAULT_IMAGE,
  noindex = false,
  schema,
}) {
  useEffect(() => {
    const fullTitle = title.includes("CaseMoney") ? title : `${title} — CaseMoney`;
    const canonicalUrl = new URL(path, SITE_URL).toString();
    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: "ru_RU" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image });

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    document.head.querySelectorAll('script[data-casemoney-schema="true"]').forEach(node => node.remove());
    const schemas = Array.isArray(schema) ? schema : schema ? [schema] : [];
    schemas.forEach(data => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.casemoneySchema = "true";
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });
  }, [description, image, noindex, path, schema, title, type]);

  return null;
}

export { SITE_URL };
