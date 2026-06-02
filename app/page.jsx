export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f7fb] text-[#111827]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#635bff] text-lg font-black text-white shadow-lg">
              V
            </div>
            <div>
              <div className="text-xl font-black tracking-tight">Vifsy</div>
              <div className="text-xs text-gray-500">
                AI social media assistant
              </div>
            </div>
          </div>

          <button className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-bold shadow-sm">
            Sign in
          </button>
        </header>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-2">
          <div>
            <div className="mb-5 inline-flex rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 shadow-sm">
              MVP dashboard preview
            </div>

            <h1 className="mb-6 max-w-2xl text-5xl font-black leading-none tracking-[-0.06em] md:text-7xl">
              Create, approve and publish social posts with AI.
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-8 text-gray-600">
              Vifsy helps small businesses generate social media posts, review
              them by email and publish approved content automatically.
            </p>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-[#111827] px-6 py-3 text-sm font-bold text-white shadow-xl">
                Create AI post
              </button>
              <button className="rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-900">
                View calendar
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white/90 p-5 shadow-2xl">
            <div className="mb-4 rounded-[1.4rem] bg-[#111827] p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-300">Next post</div>
                  <div className="text-xl font-black">Ready for approval</div>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-300">
                  AI created
                </span>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-gray-200 bg-white p-5">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">
                Caption
              </div>
              <h2 className="mb-3 text-2xl font-black tracking-tight">
                Keep your business visible every week
              </h2>
              <p className="leading-7 text-gray-600">
                Your customers follow many brands. Vifsy helps you show up
                consistently with posts that match your tone, services and
                offers.
              </p>

              <div className="mt-5 grid gap-3">
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 p-4">
                  <div>
                    <div className="font-bold">Facebook</div>
                    <div className="text-sm text-gray-500">
                      Scheduled today, 19:00
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    Approved
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-gray-200 p-4">
                  <div>
                    <div className="font-bold">Instagram</div>
                    <div className="text-sm text-gray-500">
                      Waiting for review
                    </div>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">
                    Ready
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
