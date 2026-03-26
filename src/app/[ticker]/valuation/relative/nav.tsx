"use client";

import { usePathname, useRouter } from "next/navigation";

const MODELS = [
  { slug: "pe-multiples", label: "P/E Multiples" },
  { slug: "ev-ebitda-multiples", label: "EV/EBITDA Multiples" },
];

interface Props {
  ticker: string;
}

export function TradingMultiplesNav({ ticker }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/${ticker}/valuation/relative`;

  const currentSlug = MODELS.find(
    (m) => pathname === `${basePath}/${m.slug}`
  )?.slug ?? MODELS[0].slug;

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`${basePath}/${e.target.value}`)}
      className="rounded-lg border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {MODELS.map((m) => (
        <option key={m.slug} value={m.slug}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
