import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function EVEBITDAMultiplesRedirect({ params }: Props) {
  const { ticker } = await params;
  redirect(`/${ticker}/valuation/trading-multiples`);
}
