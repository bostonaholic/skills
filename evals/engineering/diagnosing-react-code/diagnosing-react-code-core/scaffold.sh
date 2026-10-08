#!/usr/bin/env bash
set -euo pipefail

cat >package.json <<'EOF_1'
{
  "name": "acme-web",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8"
  }
}
EOF_1

mkdir -p src
cat >src/Profile.jsx <<'EOF_2'
import { useEffect, useState } from 'react';

export default function Profile({ userId, onLoad }) {
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('about');

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
        onLoad(data);
      });
  }, []);

  if (!profile) return <p>Loading...</p>;

  const tabs = ['about', 'posts', 'followers'];

  return (
    <section className="profile">
      <h1>{profile.name}</h1>
      <nav>
        {tabs.map((name, index) => (
          <button key={index} type="button" onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === 'about' && (
        <div className="bio" dangerouslySetInnerHTML={{ __html: profile.bio }} />
      )}
    </section>
  );
}
EOF_2

git init -q
git add -A
