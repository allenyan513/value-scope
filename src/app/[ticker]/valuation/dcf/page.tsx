import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function DCFIndex({ params }: Props) {
  const { ticker } = await params;
  redirect(`/${ticker}/valuation/dcf/perpetual-growth`);
}
