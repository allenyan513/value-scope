import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function DCFValuationIndex({ params }: Props) {
  const { ticker } = await params;
  redirect(`/${ticker}/dcf-valuation/perpetual-growth`);
}
