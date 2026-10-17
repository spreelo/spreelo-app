// Use the same database-backed campaign handoff from Home and the calendar.
// No new plan is saved or activated by following this link.
export function calendarCampaignHref(campaignId, brandProfileId = '') {
  if (!campaignId) return '/calendar';
  const params = new URLSearchParams({
    campaignOpportunityId: String(campaignId),
    campaignId: String(campaignId),
    mode: 'campaign',
  });
  if (brandProfileId) params.set('brandProfileId', String(brandProfileId));
  return `/automation?${params.toString()}`;
}
