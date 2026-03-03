'use client';

import Link from 'next/link';

export default function BookCard({ book, viewMode, gradient }) {
    const displayTitle = book.replace('.chm', '').replace('.CHM', '');

    return (
        <Link
            href={`/reader/${encodeURIComponent(book)}`}
            className={`book-card ${viewMode === 'list' ? 'list-card' : ''}`}
        >
            <div
                className="book-card-cover"
                style={{ background: viewMode === 'grid' ? gradient : 'transparent' }}
            >
                {viewMode === 'grid' && <div className="book-icon">📖</div>}
            </div>
            <div className="book-card-content">
                <h2 className="book-title">{displayTitle}</h2>
                <p className="book-meta">CHM File • {book}</p>
            </div>
        </Link>
    );
}
