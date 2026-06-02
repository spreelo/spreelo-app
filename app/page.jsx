"use client";

import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPosts() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("posts")
        .select("id, platform, tone, language, post_type, idea, content, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPosts(data);
      }

      setLoading(false);
    }

    loadPosts();
  }, []);

  return (
    <AppLayout active="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Your social media workspace</h2>
        </div>
        <a className="primary-button" href="/create">
          Create new post
        </a>
      </header>

      <section className="grid">
        <div className="stat-card">
          <span>Posts created</span>
          <strong>{posts.length}</strong>
        </div>
        <div className="stat-card">
          <span>Scheduled posts</span>
          <strong>{posts.filter((post) => post.status === "scheduled").length}</strong>
        </div>
        <div className="stat-card">
          <span>Connected channels</span>
          <strong>0</strong>
        </div>
      </section>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Saved drafts</p>
            <h3>Your posts</h3>
          </div>
          <a className="secondary-button" href="/create">
            New draft
          </a>
        </div>

        {loading ? (
          <div className="empty-card">
            <h3>Loading posts...</h3>
            <p>Please wait while Vifsy loads your saved drafts.</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-card">
            <h3>No posts yet</h3>
            <p>
              Your generated and saved posts will appear here once you start
              creating content.
            </p>
          </div>
        ) : (
          <div className="posts-list">
            {posts.map((post) => (
              <article className="post-item" key={post.id}>
                <div className="post-item-header">
                  <div>
                    <h4>{post.platform} · {post.post_type}</h4>
                    <p>{post.tone} · {post.language} · {post.status}</p>
                  </div>
                  <span>
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="post-preview compact">
                  {post.content.split("\n").slice(0, 6).map((line, index) => (
                    <p key={index}>{line || "\u00A0"}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
