export type BackendResponse = {
  raw: unknown;
  orders: unknown[];
  buyers?: Array<{
    nickname?: string;
    avatar?: string;
    amount?: number;
    isStarter?: boolean;
  }>;
  buyerSummary?: {
    totalNumber?: number;
    totalAmount?: number;
    totalPrizeAmount?: number;
    totalCommission?: number;
  } | null;
};

const apiRoot = import.meta.env.VITE_API_BASE_URL ?? '';

export async function requestBackend(path: string, payload: Record<string, unknown> = {}): Promise<BackendResponse> {
  const response = await fetch(`${apiRoot}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }
  return response.json() as Promise<BackendResponse>;
}
