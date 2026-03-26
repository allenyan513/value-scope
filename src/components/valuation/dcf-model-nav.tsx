"use client";

import { usePathname, useRouter } from "next/navigation";

const DCF_MODELS = [
  { slug: "perpetual-growth", label: "Perpetual Growth (10Y)" },
  { slug: "pe-exit", label: "P/E Exit (10Y)" },
  { slug: "ev-ebitda-exit", label: "EV/EBITDA Exit (10Y)" },
];

interface Props {
  ticker: string;
}

export function DCFModelNav({ ticker }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/${ticker}/valuation/dcf`;

  const currentSlug = DCF_MODELS.find(
    (m) => pathname === `${basePath}/${m.slug}`
  )?.slug ?? DCF_MODELS[0].slug;

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`${basePath}/${e.target.value}`)}
      className="rounded-lg border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {DCF_MODELS.map((m) => (
        <option key={m.slug} value={m.slug}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
