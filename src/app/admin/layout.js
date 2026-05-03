export const metadata = {
  title: "Library Admin Dashboard",
  description: "AI PDF Ingestion Platform",
};

export default function AdminLayout({ children }) {
  return (
    <div className="admin-container">
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --admin-bg: #09090b;
          --admin-card: #18181b;
          --admin-border: #27272a;
          --admin-text: #fafafa;
          --admin-text-muted: #a1a1aa;
          --admin-accent: #3b82f6;
          --admin-accent-hover: #2563eb;
          --admin-success: #10b981;
          --admin-error: #ef4444;
        }
        body {
          margin: 0;
          background-color: var(--admin-bg);
          color: var(--admin-text);
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .admin-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .admin-header {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--admin-border);
          background: rgba(24, 24, 27, 0.5);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .admin-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .admin-header a {
          color: var(--admin-text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          transition: color 0.2s;
        }
        .admin-header a:hover {
          color: var(--admin-text);
        }
        .admin-main {
          flex: 1;
          padding: 2rem;
          max-width: 1000px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
      `}} />
      
      <header className="admin-header">
        <h1>Library Ingestion Hub</h1>
        <a href="/">← Back to Library</a>
      </header>
      
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
