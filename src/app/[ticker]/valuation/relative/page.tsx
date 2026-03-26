import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function RelativeIndex({ params }: Props) {
  const { ticker } = await params;
  redirect(`/${ticker}/valuation/relative/pe-multiples`);
}
