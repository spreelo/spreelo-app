// v144.331 - fail-closed switch for the NEW AI Control Center background jobs.
// This never changes normal posting, generation or existing Spreelo cron workers.
export const AI_BACKGROUND_JOBS_KEY = 'ai_control_background_jobs';

export async function readAiBackgroundJobsState(admin) {
  if (!admin) return { enabled: false, available: false, error: 'Database client missing' };
  try {
    const { data, error } = await admin.from('ai_control_job_settings')
      .select('enabled,updated_at,updated_by')
      .eq('key', AI_BACKGROUND_JOBS_KEY).maybeSingle();
    if (error) return { enabled: false, available: false, error: String(error.message || error) };
    // A missing row is OFF, even after a partial migration.
    return { enabled: data?.enabled === true, available: true,
      updated_at: data?.updated_at || null, updated_by: data?.updated_by || null };
  } catch (error) {
    return { enabled: false, available: false, error: String(error?.message || error) };
  }
}

// To be called before any new AI cron performs work or spends AI credits.
export async function blockDisabledAiBackgroundJob(admin) {
  const state = await readAiBackgroundJobsState(admin);
  if (!state.available) {
    console.error('AI Control Center background jobs: gate unavailable; denying execution.', state.error);
    return Response.json({ok:false,skipped:'safety_switch_unavailable',error:'AI background safety setting is unavailable; job was not started.'},{status:503});
  }
  if (!state.enabled) return Response.json({ok:true,skipped:'ai_background_jobs_disabled'});
  return null;
}
