const items = [
  { title: "Build a calmer content workflow", source: "example.com", type: "Article", color: "lavender" },
  { title: "AI research notes and field guide", source: "research.example", type: "Webpage", color: "peach" },
  { title: "Creator intelligence inspiration", source: "video.example", type: "Video", color: "mint" }
];

export default function Home() {
  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="mark">B</span><span>Bookmark Intelligence</span></div><nav><a className="active">Home</a><a>Inbox <span>12</span></a><a>Library</a><a>Projects</a><a>Creators</a><a>Playlists</a><a>AI Search</a></nav><div className="sidebar-bottom"><a>Storage</a><a>Settings</a></div></aside>
    <section className="content"><header><div><p className="eyebrow">Tuesday, 29 August</p><h1>Good morning, Michael</h1><p className="muted">Your library is ready when you are.</p></div><button className="primary">＋ Save something</button></header>
      <div className="stats"><div><span>Saved this week</span><strong>24</strong><small>↑ 18% from last week</small></div><div><span>In your library</span><strong>1,284</strong><small>Across 8 projects</small></div><div><span>Storage mode</span><strong>Local first</strong><small>Cloud sync is optional</small></div></div>
      <section className="section-head"><div><p className="eyebrow">Your library</p><h2>Recently saved</h2></div><a className="view">View library →</a></section><div className="cards">{items.map(item => <article className="card" key={item.title}><div className={`thumb ${item.color}`}><span>{item.type}</span></div><div className="card-body"><p className="source">{item.source}</p><h3>{item.title}</h3><p className="meta">Saved to <b>Inbox</b> · Just now</p></div></article>)}</div>
    </section>
  </main>;
}
