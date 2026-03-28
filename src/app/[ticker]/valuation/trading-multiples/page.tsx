import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function TradingMultiplesIndex({ params }: Props) {
  const { ticker } = await params;
  redirect(`/${ticker}/valuation/trading-multiples/pe-multiples`);
}
