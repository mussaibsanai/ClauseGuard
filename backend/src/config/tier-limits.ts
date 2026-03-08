export const TIER_LIMITS = {
  free: {
    maxTotalFiles: 5,
    dailyUploads: 2,
    maxFileSizeMB: 20,
    maxFilesPerUpload: 1,
    aiModel: 'claude-3-5-sonnet-20241022',
  },
  pro: {
    maxTotalFiles: 100,
    dailyUploads: 20,
    maxFileSizeMB: 50,
    maxFilesPerUpload: 5,
    aiModel: 'claude-opus-4-20250514',
  },
} as const;

export type UserTier = keyof typeof TIER_LIMITS;

export function getTierLimits(tier: string) {
  return TIER_LIMITS[tier as UserTier] || TIER_LIMITS.free;
}
