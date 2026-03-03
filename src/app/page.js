'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reader/book.chm');
  }, [router]);

  return (
    <main className="container">
      <div className="loader-container">
        <div className="loader"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading book...</p>
      </div>
    </main>
  );
}
