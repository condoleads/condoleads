export interface TenantCreditConfig {
  // AI Chat
  ai_free_messages: number
  ai_auto_approve_limit: number
  ai_manual_approve_limit: number
  ai_hard_cap: number
  // Buyer Plans
  plan_free_attempts: number
  plan_auto_approve_limit: number
  plan_manual_approve_limit: number
  plan_hard_cap: number
  // Seller Plans
  seller_plan_free_attempts: number
  seller_plan_auto_approve_limit: number
  seller_plan_manual_approve_limit: number
  seller_plan_hard_cap: number
  // Estimator
  estimator_free_attempts: number
  estimator_auto_approve_attempts: number
  estimator_manual_approve_attempts: number
  estimator_hard_cap: number
}

export interface UserCreditOverride {
  ai_chat_limit: number | null
  buyer_plan_limit: number | null
  seller_plan_limit: number | null
  estimator_limit: number | null
}

export interface ResolvedLimits {
  ai_chat_total_allowed: number
  buyer_plan_total_allowed: number
  seller_plan_total_allowed: number
  estimator_total_allowed: number
  has_override: boolean
  override_pools: {
    chat: boolean
    buyer: boolean
    seller: boolean
    estimator: boolean
  }
}

/**
 * Resolves effective credit limits for a specific user.
 *
 * If user_credit_overrides row exists for this user:
 *   - Non-null pool value → use it, capped at tenant hard_cap
 *   - Null pool value → fall back to tenant config for that pool
 *
 * If no override row exists:
 *   - All pools use tenant config (existing behaviour, unchanged)
 */
export function resolveUserLimits(
  tenant: TenantCreditConfig,
  override: UserCreditOverride | null
): ResolvedLimits {
  const tenantChatTotal =
    tenant.ai_free_messages +
    tenant.ai_auto_approve_limit +
    tenant.ai_manual_approve_limit

  const tenantBuyerTotal =
    tenant.plan_free_attempts +
    tenant.plan_auto_approve_limit +
    tenant.plan_manual_approve_limit

  const tenantSellerTotal =
    tenant.seller_plan_free_attempts +
    tenant.seller_plan_auto_approve_limit +
    tenant.seller_plan_manual_approve_limit

  const tenantEstimatorTotal =
    tenant.estimator_free_attempts +
    tenant.estimator_auto_approve_attempts +
    tenant.estimator_manual_approve_attempts

  const chatOverride      = override?.ai_chat_limit      ?? null
  const buyerOverride     = override?.buyer_plan_limit    ?? null
  const sellerOverride    = override?.seller_plan_limit   ?? null
  const estimatorOverride = override?.estimator_limit     ?? null

  return {
    ai_chat_total_allowed: chatOverride !== null
      ? Math.min(chatOverride, tenant.ai_hard_cap)
      : tenantChatTotal,

    buyer_plan_total_allowed: buyerOverride !== null
      ? Math.min(buyerOverride, tenant.plan_hard_cap)
      : tenantBuyerTotal,

    seller_plan_total_allowed: sellerOverride !== null
      ? Math.min(sellerOverride, tenant.seller_plan_hard_cap)
      : tenantSellerTotal,

    estimator_total_allowed: estimatorOverride !== null
      ? Math.min(estimatorOverride, tenant.estimator_hard_cap)
      : tenantEstimatorTotal,

    has_override: override !== null,
    override_pools: {
      chat:      chatOverride !== null,
      buyer:     buyerOverride !== null,
      seller:    sellerOverride !== null,
      estimator: estimatorOverride !== null,
    },
  }
}